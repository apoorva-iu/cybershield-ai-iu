const cfg = require('./config');
const LLM = cfg.runtime.llm;
const env = k => (process.env[k] || '').trim();

function mapHttpReason(status) {
  if (status === 401 || status === 403) return 'bad key';
  if (status === 404) return 'bad model';
  if (status === 429) return 'quota';
  if (status === 502 || status === 503 || status === 504) return 'overloaded';
  return 'http ' + status;
}

function mapErrReason(err) {
  if (!err) return 'network error';
  const causeCode = err.cause && err.cause.code;
  if (err.name === 'AbortError' || causeCode === 'UND_ERR_HEADERS_TIMEOUT' || causeCode === 'ETIMEDOUT') {
    return 'timeout';
  }
  return 'network error';
}

function parseLlmJson(resultJson) {
  if (typeof resultJson !== 'string' || !resultJson.trim()) return null;
  const startIdx = resultJson.indexOf('{');
  const endIdx = resultJson.lastIndexOf('}');
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    console.warn('LLM output does not contain JSON braces');
    return null;
  }
  try {
    const o = JSON.parse(resultJson.slice(startIdx, endIdx + 1));
    if (!o || typeof o !== 'object') return null;
    return {
      risk: Math.max(0, Math.min(100, Number(o.risk) || 0)),
      scamType: LLM.validTypes.includes(o.scamType) ? o.scamType : 'none',
      asksForPayment: !!o.asksForPayment,
      asksForIdentityDocs: !!o.asksForIdentityDocs,
      reasons: (Array.isArray(o.reasons) ? o.reasons : []).slice(0, 4).map(String)
    };
  } catch (e) {
    console.warn('LLM JSON parse failed');
    return null;
  }
}

function extractGeminiText(data) {
  const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (p && !p.thought && typeof p.text === 'string' && p.text.trim()) {
      return p.text;
    }
  }
  return (parts[0] && typeof parts[0].text === 'string') ? parts[0].text : null;
}

async function analyzeDescriptionWithStatus(text) {
  if (!text || !text.trim()) return { result: null, status: 'no description' };
  const provider = env('LLM_PROVIDER').toLowerCase();
  if (!provider) return { result: null, status: 'no key' };

  const cleanText = text.trim().slice(0, LLM.textLimit);
  const sys = LLM.systemPrompt;
  const content = LLM.promptWrapper[0] + cleanText + LLM.promptWrapper[1];

  if (provider === 'gemini') {
    const key = env('GEMINI_API_KEY');
    if (!key) return { result: null, status: 'no key' };

    const primaryModel = env('LLM_MODEL') || LLM.geminiModelDefault;
    const fallbacks = Array.isArray(LLM.geminiFallbackModels) ? LLM.geminiFallbackModels : [];
    const models = [...new Set([primaryModel, ...fallbacks].filter(Boolean))];
    let lastStatus = 'bad response';

    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      const hasMore = i < models.length - 1;
      const timeoutMs = hasMore ? Math.min(LLM.timeoutMs, LLM.attemptTimeoutMs || 8000) : LLM.timeoutMs;
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), timeoutMs);
      try {
        const url = `${LLM.geminiUrl}${model}:generateContent`;
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          signal: c.signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: sys }] },
            contents: [{ parts: [{ text: content }] }],
            generationConfig: { temperature: LLM.temperature, responseMimeType: 'application/json' }
          })
        });
        if (!r.ok) {
          lastStatus = mapHttpReason(r.status);
          console.warn(`Gemini API error (${model}):`, r.status, lastStatus);
          if (lastStatus === 'bad key') break;
          continue;
        }
        const data = await r.json();
        const textOut = extractGeminiText(data);
        const parsed = parseLlmJson(textOut);
        if (parsed) {
          return { result: parsed, status: 'ok' };
        }
        lastStatus = 'bad response';
      } catch (err) {
        lastStatus = mapErrReason(err);
        console.warn(`Gemini fetch failed (${model}):`, lastStatus);
      } finally {
        clearTimeout(t);
      }
    }
    return { result: null, status: lastStatus };
  }

  if (provider === 'anthropic') {
    const key = env('ANTHROPIC_API_KEY');
    if (!key) return { result: null, status: 'no key' };
    const model = env('LLM_MODEL') || LLM.anthropicModelDefault;
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), LLM.timeoutMs);
    try {
      const r = await fetch(LLM.anthropicUrl, {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': LLM.anthropicVersion, 'content-type': 'application/json' },
        signal: c.signal,
        body: JSON.stringify({
          model,
          max_tokens: LLM.maxTokens,
          temperature: LLM.temperature,
          system: sys,
          messages: [{ role: 'user', content }]
        })
      });
      if (!r.ok) {
        const status = mapHttpReason(r.status);
        console.warn('Anthropic API error:', r.status, status);
        return { result: null, status };
      }
      const data = await r.json();
      const resultJson = data && data.content && data.content[0] && data.content[0].text;
      const parsed = parseLlmJson(resultJson);
      if (!parsed) return { result: null, status: 'bad response' };
      return { result: parsed, status: 'ok' };
    } catch (err) {
      const status = mapErrReason(err);
      console.warn('Anthropic fetch failed:', status);
      return { result: null, status };
    } finally {
      clearTimeout(t);
    }
  }

  return { result: null, status: 'no key' };
}

async function analyzeDescription(text) {
  const { result } = await analyzeDescriptionWithStatus(text);
  return result;
}

module.exports = { analyzeDescription, analyzeDescriptionWithStatus };

'use strict';

const crypto = require('crypto');
const cfg = require('../config');
const { getAnalysisModel, env } = require('./config');
const { SYSTEM_INSTRUCTION } = require('./prompts');
const { validatePassResult, findBannedClaims, sanitizeBannedClaims } = require('./validator');

const LLM_CFG = cfg.runtime.llm || {};

let customRunner = null;
let liveCallCount = 0;

// 10-minute in-memory cache (key = sha256 hash of normalized text)
const analysisCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

function setCustomRunner(fn) {
  customRunner = fn;
}

function getLiveCallCount() {
  return liveCallCount;
}

function resetLiveCallCount() {
  liveCallCount = 0;
}

function clearAnalysisCache() {
  analysisCache.clear();
}

function getCachedAnalysis(text) {
  if (typeof text !== 'string') return null;
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const hashKey = crypto.createHash('sha256').update(normalized).digest('hex');
  const entry = analysisCache.get(hashKey);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    analysisCache.delete(hashKey);
    return null;
  }
  return entry.data;
}

function setCachedAnalysis(text, data) {
  if (typeof text !== 'string' || !data) return;
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const hashKey = crypto.createHash('sha256').update(normalized).digest('hex');
  analysisCache.set(hashKey, {
    timestamp: Date.now(),
    data
  });
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

function parseJsonFromText(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) return null;
  const startIdx = rawText.indexOf('{');
  const endIdx = rawText.lastIndexOf('}');
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return null;
  try {
    return JSON.parse(rawText.slice(startIdx, endIdx + 1));
  } catch (e) {
    return null;
  }
}

async function callGeminiApi(promptText, modelName, apiKey, timeoutMs) {
  const url = `${LLM_CFG.geminiUrl || 'https://generativelanguage.googleapis.com/v1beta/models/'}${modelName}:generateContent`;

  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);

  try {
    liveCallCount++;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      signal: c.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!res.ok) {
      if (res.status === 429 || res.status === 503) {
        const jitter = Math.floor(Math.random() * 800) + 1200;
        await new Promise(r => setTimeout(r, jitter));

        liveCallCount++;
        const retryRes = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          signal: c.signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json'
            }
          })
        });

        if (retryRes.ok) {
          const data = await retryRes.json();
          return { ok: true, text: extractGeminiText(data) };
        }
      }

      // Try fallback model if configured and different
      const fallbackModel = modelName === 'gemini-flash-lite-latest' ? 'gemini-3.1-flash-lite' : 'gemini-flash-lite-latest';
      const fallbackUrl = `${LLM_CFG.geminiUrl || 'https://generativelanguage.googleapis.com/v1beta/models/'}${fallbackModel}:generateContent`;
      const fallbackRes = await fetch(fallbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        signal: c.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        })
      });
      if (fallbackRes.ok) {
        const data = await fallbackRes.json();
        return { ok: true, text: extractGeminiText(data) };
      }

      return { ok: false, status: res.status, reason: res.status === 429 ? 'quota' : `http_${res.status}` };
    }

    const data = await res.json();
    return { ok: true, text: extractGeminiText(data) };
  } catch (err) {
    const isTimeout = err && (err.name === 'AbortError' || err.code === 'ETIMEDOUT');
    return { ok: false, reason: isTimeout ? 'timeout' : 'network_error' };
  } finally {
    clearTimeout(t);
  }
}

async function runPassWithRetry(promptText, rawInput, passNum = 1) {
  const apiKey = env('GEMINI_API_KEY');
  const timeoutMs = LLM_CFG.timeoutMs || 25000;
  const modelName = getAnalysisModel();

  let currentPrompt = promptText;

  // Retry up to 1 time (max 2 attempts) for JSON parse errors, band inconsistencies, or banned claims
  for (let attempt = 1; attempt <= 2; attempt++) {
    let rawText = null;

    if (typeof customRunner === 'function') {
      try {
        const out = await customRunner(currentPrompt, SYSTEM_INSTRUCTION, { pass: passNum, attempt });
        if (typeof out === 'object' && out !== null) {
          const validated = validatePassResult(out, rawInput);
          if (validated.ok) {
            const bannedViolations = findBannedClaims(validated.data);
            if (bannedViolations.length > 0) {
              if (attempt === 1) {
                currentPrompt = `${promptText}\n\nCORRECTION REQUIRED: wording policy violation. You asserted that a message or scenario is fabricated, fake, forged, edited, or genuine as a fact (${bannedViolations.map(v => v.text).join('; ')}). Never state these as fact. Use safe wording such as "cannot be verified".`;
                continue;
              }
              sanitizeBannedClaims(validated.data);
            }
            return { ok: true, data: validated.data };
          }
          if (attempt === 2) {
            return {
              ok: true,
              data: {
                level: 'unable',
                score: null,
                riskScore: null,
                certainty: 0,
                confidence: 0,
                primaryConcern: 'Details cannot be verified from a message',
                scamType: 'unclear',
                requestedAction: 'none',
                signals: [],
                checks: [],
                flaggedPhrases: [],
                conversationSummary: 'Context insufficient to evaluate risk.',
                explanation: 'Details cannot be verified from a message.',
                whatToDo: []
              }
            };
          }
          continue;
        }
        rawText = String(out || '');
      } catch (err) {
        if (attempt === 2) return { ok: false, reason: err.message || 'custom_runner_error' };
        continue;
      }
    } else {
      if (!apiKey) {
        return { ok: false, reason: 'no_key' };
      }
      const apiRes = await callGeminiApi(currentPrompt, modelName, apiKey, timeoutMs);
      if (!apiRes.ok) {
        if (apiRes.reason === 'quota') {
          return { ok: false, reason: 'quota' };
        }
        if (attempt === 2) return { ok: false, reason: apiRes.reason };
        continue;
      }
      rawText = apiRes.text;
    }

    const parsed = parseJsonFromText(rawText);
    if (!parsed) {
      if (attempt === 2) {
        return { ok: false, reason: 'bad_response' };
      }
      continue;
    }

    const validated = validatePassResult(parsed, rawInput);
    if (validated.ok) {
      const bannedViolations = findBannedClaims(validated.data);
      if (bannedViolations.length > 0) {
        if (attempt === 1) {
          currentPrompt = `${promptText}\n\nCORRECTION REQUIRED: wording policy violation. You asserted that a message or scenario is fabricated, fake, forged, edited, or genuine as a fact (${bannedViolations.map(v => v.text).join('; ')}). Never state these as fact. Use safe wording such as "cannot be verified".`;
          continue;
        }
        sanitizeBannedClaims(validated.data);
      }
      return { ok: true, data: validated.data };
    }

    if (attempt === 2) {
      return {
        ok: true,
        data: {
          level: 'unable',
          score: null,
          riskScore: null,
          certainty: 0,
          confidence: 0,
          primaryConcern: 'Details cannot be verified from a message',
          scamType: 'unclear',
          requestedAction: 'none',
          signals: [],
          checks: [],
          flaggedPhrases: [],
          conversationSummary: 'Context insufficient to evaluate risk.',
          explanation: 'Details cannot be verified from a message.',
          whatToDo: []
        }
      };
    }
  }

  return { ok: false, reason: 'bad_response' };
}

module.exports = {
  runPassWithRetry,
  setCustomRunner,
  getLiveCallCount,
  resetLiveCallCount,
  getCachedAnalysis,
  setCachedAnalysis,
  clearAnalysisCache
};

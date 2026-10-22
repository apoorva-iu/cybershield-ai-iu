'use strict';

const cfg = require('../config');
const { getVisionModel, env } = require('./config');

const LLM_CFG = cfg.runtime.llm || {};
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

let customVisionRunner = null;

function setCustomVisionRunner(fn) {
  customVisionRunner = fn;
}

function detectImageMimeAndMagic(buffer, declaredMime) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { ok: false, error: 'Empty or invalid file buffer' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const isPng = buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
    buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A;

  // JPG: FF D8 FF
  const isJpg = buffer.length >= 3 &&
    buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;

  // WEBP: RIFF....WEBP
  const isWebp = buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP';

  if (!isPng && !isJpg && !isWebp) {
    return { ok: false, error: 'File format not supported. Only PNG, JPG, and WEBP images are accepted.' };
  }

  let realMime = 'image/png';
  if (isPng) realMime = 'image/png';
  else if (isJpg) realMime = 'image/jpeg';
  else if (isWebp) realMime = 'image/webp';

  const normalizedDeclared = String(declaredMime || '').toLowerCase();
  const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

  if (normalizedDeclared && !allowedMimes.includes(normalizedDeclared)) {
    return { ok: false, error: 'Declared MIME type is not allowed' };
  }

  return { ok: true, mimeType: realMime };
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

async function readScreenshot(buffer, mimeType) {
  if (buffer.length > MAX_IMAGE_SIZE) {
    return { ok: false, code: 400, error: 'Image file size exceeds the 5MB limit' };
  }

  const magicCheck = detectImageMimeAndMagic(buffer, mimeType);
  if (!magicCheck.ok) {
    return { ok: false, code: 400, error: magicCheck.error };
  }
  const cleanMime = magicCheck.mimeType;

  if (typeof customVisionRunner === 'function') {
    try {
      const out = await customVisionRunner(buffer, cleanMime);
      if (out && typeof out === 'object') {
        return { ok: true, data: out };
      }
      return { ok: false, code: 503, error: 'AI_UNAVAILABLE' };
    } catch (err) {
      return { ok: false, code: 503, error: 'AI_UNAVAILABLE' };
    }
  }

  const key = env('GEMINI_API_KEY');
  if (!key) {
    return { ok: false, code: 503, error: 'AI_UNAVAILABLE' };
  }

  const modelName = getVisionModel();
  const url = `${LLM_CFG.geminiUrl || 'https://generativelanguage.googleapis.com/v1beta/models/'}${modelName}:generateContent`;

  const systemInstruction = `You are an image transcription specialist. Transcribe ALL visible text from this payment screenshot, chat, or receipt in exact reading order.
Instructions:
- Keep links, phone numbers, UPI IDs, and amounts exactly verbatim as shown.
- If this is a conversation, identify dialogue turns indicating the speaker side ("them", "me", "system", "unknown").
- Ignore OS battery, clock, and navigation status bars.
- Do not evaluate or judge scams. Transcribe faithfully.
Reply with strict JSON only matching this schema:
{
  "text": string,
  "readability": "good" | "poor" | "none",
  "truncated": boolean,
  "notes": string,
  "turns": [
    {
      "side": "them" | "me" | "system" | "unknown",
      "text": string
    }
  ]
}`;

  const c = new AbortController();
  const timeoutMs = LLM_CFG.timeoutMs || 25000;
  const t = setTimeout(() => c.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key
      },
      signal: c.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{
          parts: [
            { inlineData: { mimeType: cleanMime, data: buffer.toString('base64') } },
            { text: "Transcribe all visible text into the required JSON schema." }
          ]
        }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!res.ok) {
      return { ok: false, code: 503, error: 'AI_UNAVAILABLE' };
    }

    const data = await res.json();
    const rawOut = extractGeminiText(data);
    const parsed = parseJsonFromText(rawOut);

    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, code: 503, error: 'AI_UNAVAILABLE' };
    }

    const readabilityValues = ['good', 'poor', 'none'];
    const readability = readabilityValues.includes(parsed.readability) ? parsed.readability : 'good';
    const turns = Array.isArray(parsed.turns) ? parsed.turns.map(t => ({
      side: ['them', 'me', 'system', 'unknown'].includes(t.side) ? t.side : 'unknown',
      text: String(t.text || '').trim()
    })) : [];

    return {
      ok: true,
      data: {
        text: String(parsed.text || '').trim(),
        readability,
        truncated: Boolean(parsed.truncated),
        notes: String(parsed.notes || '').trim(),
        turns
      }
    };
  } catch (err) {
    return { ok: false, code: 503, error: 'AI_UNAVAILABLE' };
  } finally {
    clearTimeout(t);
  }
}

module.exports = {
  readScreenshot,
  detectImageMimeAndMagic,
  setCustomVisionRunner,
  MAX_IMAGE_SIZE
};


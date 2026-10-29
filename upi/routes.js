'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { readScreenshot, detectImageMimeAndMagic, MAX_IMAGE_SIZE } = require('./vision');
const { performUpiCheck } = require('./checker');
const { quotaMiddleware } = require('../detectors/quota');

const MAX_MULTIPART_BYTES = MAX_IMAGE_SIZE + 65536; // 5MB + 64KB overhead

// Rate limiters for UPI tool endpoints
const upiScreenshotLimiter = rateLimit({
  windowMs: 60000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many screenshot requests. Please wait a minute and try again.' })
});

const upiCheckLimiter = rateLimit({
  windowMs: 60000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many payment check requests. Please wait a minute and try again.' })
});

function parseMultipartImage(bodyBuffer, boundary) {
  const boundaryDelimiter = Buffer.from('--' + boundary);
  let pos = 0;

  while (pos < bodyBuffer.length) {
    const bStart = bodyBuffer.indexOf(boundaryDelimiter, pos);
    if (bStart === -1) break;

    const afterBoundary = bStart + boundaryDelimiter.length;
    if (bodyBuffer[afterBoundary] === 0x2D && bodyBuffer[afterBoundary + 1] === 0x2D) {
      break;
    }

    let headerStart = afterBoundary;
    if (bodyBuffer[headerStart] === 0x0D && bodyBuffer[headerStart + 1] === 0x0A) headerStart += 2;
    else if (bodyBuffer[headerStart] === 0x0A) headerStart += 1;

    let headerEnd = bodyBuffer.indexOf(Buffer.from('\r\n\r\n'), headerStart);
    let bodyStart = headerEnd + 4;
    if (headerEnd === -1) {
      headerEnd = bodyBuffer.indexOf(Buffer.from('\n\n'), headerStart);
      bodyStart = headerEnd + 2;
    }
    if (headerEnd === -1) break;

    const headersText = bodyBuffer.slice(headerStart, headerEnd).toString('utf8');
    const nextBoundary = bodyBuffer.indexOf(boundaryDelimiter, bodyStart);
    if (nextBoundary === -1) break;

    let bodyEnd = nextBoundary;
    if (bodyBuffer[bodyEnd - 2] === 0x0D && bodyBuffer[bodyEnd - 1] === 0x0A) bodyEnd -= 2;
    else if (bodyBuffer[bodyEnd - 1] === 0x0A) bodyEnd -= 1;

    const isImageField = /content-disposition:[^;\r\n]*;\s*name=["']?image["']?(?:;|\r|\n|$)/i.test(headersText);
    if (isImageField) {
      const mimeMatch = headersText.match(/content-type:\s*([^\r\n;]+)/i);
      const declaredMime = mimeMatch ? mimeMatch[1].trim().toLowerCase() : '';
      const partBody = bodyBuffer.slice(bodyStart, bodyEnd);
      return { partBody, declaredMime };
    }

    pos = nextBoundary;
  }

  return null;
}

function handleReadScreenshot(req, res) {
  const ctype = req.headers['content-type'] || '';
  if (!ctype.toLowerCase().includes('multipart/form-data')) {
    return res.status(400).json({ error: 'Content-Type must be multipart/form-data with field "image"' });
  }

  const boundaryMatch = ctype.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  if (!boundaryMatch) {
    return res.status(400).json({ error: 'Missing boundary in multipart/form-data' });
  }
  const boundary = boundaryMatch[1] || boundaryMatch[2];

  const chunks = [];
  let totalLength = 0;
  let tooLarge = false;

  req.on('data', chunk => {
    totalLength += chunk.length;
    if (totalLength > MAX_MULTIPART_BYTES) {
      tooLarge = true;
      req.pause();
    } else {
      chunks.push(chunk);
    }
  });

  req.on('error', err => {
    return res.status(400).json({ error: 'Upload stream error: ' + err.message });
  });

  req.on('end', async () => {
    if (tooLarge) {
      return res.status(400).json({ error: 'Image exceeds maximum size of 5 MB' });
    }

    const fullBody = Buffer.concat(chunks);
    const parsed = parseMultipartImage(fullBody, boundary);
    if (!parsed) {
      return res.status(400).json({ error: 'Multipart field "image" not found or empty' });
    }

    const { partBody, declaredMime } = parsed;
    if (partBody.length === 0) {
      return res.status(400).json({ error: 'Uploaded image file is empty' });
    }
    if (partBody.length > MAX_IMAGE_SIZE) {
      return res.status(400).json({ error: 'Image exceeds maximum size of 5 MB' });
    }

    const magicCheck = detectImageMimeAndMagic(partBody, declaredMime);
    if (!magicCheck.ok) {
      return res.status(400).json({ error: magicCheck.error });
    }

    const visionResult = await readScreenshot(partBody, magicCheck.mimeType);
    if (!visionResult.ok) {
      if (visionResult.code === 400) {
        return res.status(400).json({ error: visionResult.error });
      }
      return res.status(503).json({
        error: 'AI_UNAVAILABLE',
        message: 'We could not read this screenshot right now. Please try again or paste the text.'
      });
    }

    return res.json(visionResult.data);
  });
}

async function handleUpiCheck(req, res) {
  if (typeof req.body !== 'object' || req.body === null) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // Reject unknown fields with 400
  const allowedKeys = ['input', 'turns', 'source', 'readability'];
  for (const k of Object.keys(req.body)) {
    if (!allowedKeys.includes(k)) {
      return res.status(400).json({ error: 'Unknown field: ' + k });
    }
  }

  const { input, turns, source, readability } = req.body;

  // Validate input: string 10 to 20000 chars
  if (typeof input !== 'string') {
    return res.status(400).json({ error: 'Field "input" must be a string' });
  }
  const trimmedInput = input.trim();
  if (trimmedInput.length < 10 || trimmedInput.length > 20000) {
    return res.status(400).json({ error: 'Field "input" must be between 10 and 20000 characters' });
  }

  // Validate turns if present
  if (turns !== undefined) {
    if (!Array.isArray(turns)) {
      return res.status(400).json({ error: 'Field "turns" must be an array' });
    }
  }

  // Validate source if present
  if (source !== undefined) {
    const validSources = ['pasted', 'screenshot', 'shared'];
    if (!validSources.includes(source)) {
      return res.status(400).json({ error: 'Field "source" must be one of: pasted, screenshot, shared' });
    }
  }

  // Validate readability if present
  if (readability !== undefined) {
    const validReadability = ['good', 'poor', 'none'];
    if (!validReadability.includes(readability)) {
      return res.status(400).json({ error: 'Field "readability" must be one of: good, poor, none' });
    }
  }

  // NOTE: UPI check is free and unmetered during beta to encourage payment fraud detection, and does not consume user quota.

  try {
    const checkResult = await performUpiCheck({
      text: trimmedInput,
      turns,
      source,
      readability,
      reqUser: req.user,
      hostname: req.hostname
    });

    if (checkResult.isUnavailable) {
      return res.json(checkResult.errorResponse);
    }

    return res.json(checkResult.response);
  } catch (err) {
    return res.status(500).json({ error: 'Internal error processing UPI check: ' + (err.message || 'unknown') });
  }
}

module.exports = function createUpiRouter(optionalAuthMiddleware) {
  const router = express.Router();
  const auth = optionalAuthMiddleware || ((req, res, next) => next());

  // POST /api/upi/read-screenshot
  router.post('/api/upi/read-screenshot', upiScreenshotLimiter, handleReadScreenshot);

  // POST /api/upi/check (anonymous and signed in via optionalAuth, metered via quotaMiddleware)
  router.post('/api/upi/check', auth, quotaMiddleware, upiCheckLimiter, handleUpiCheck);

  return router;
};


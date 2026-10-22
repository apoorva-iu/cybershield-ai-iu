'use strict';
const gemini = require('./gemini');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_MULTIPART_BYTES = MAX_IMAGE_BYTES + 65536; // 5MB + 64KB overhead

function detectMagicBytes(buf) {
  if (!buf || buf.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47 &&
    buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A
  ) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) {
    return 'image/jpeg';
  }
  // WEBP: RIFF....WEBP
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

function parseMultipartImage(bodyBuffer, boundary) {
  const boundaryDelimiter = Buffer.from('--' + boundary);
  let pos = 0;

  while (pos < bodyBuffer.length) {
    const bStart = bodyBuffer.indexOf(boundaryDelimiter, pos);
    if (bStart === -1) break;

    const afterBoundary = bStart + boundaryDelimiter.length;
    // Check if end delimiter
    if (bodyBuffer[afterBoundary] === 0x2D && bodyBuffer[afterBoundary + 1] === 0x2D) { // '--'
      break;
    }

    // Skip \r\n after boundary
    let headerStart = afterBoundary;
    if (bodyBuffer[headerStart] === 0x0D && bodyBuffer[headerStart + 1] === 0x0A) headerStart += 2;
    else if (bodyBuffer[headerStart] === 0x0A) headerStart += 1;

    // Search for \r\n\r\n or \n\n
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

async function handleExtractText(req, res) {
  const ctype = req.headers['content-type'] || '';
  if (!ctype.toLowerCase().includes('multipart/form-data')) {
    return res.status(400).json({ error: 'Content-Type must be multipart/form-data with field "image"' });
  }

  const boundaryMatch = ctype.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  if (!boundaryMatch) {
    return res.status(400).json({ error: 'Missing boundary in multipart/form-data' });
  }
  const boundary = boundaryMatch[1] || boundaryMatch[2];

  // Read request stream up to MAX_MULTIPART_BYTES
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
    if (partBody.length > MAX_IMAGE_BYTES) {
      return res.status(400).json({ error: 'Image exceeds maximum size of 5 MB' });
    }

    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (declaredMime && !allowedMimes.includes(declaredMime)) {
      return res.status(400).json({ error: 'Only PNG, JPG or WEBP images are accepted' });
    }

    const detectedMime = detectMagicBytes(partBody);
    if (!detectedMime) {
      return res.status(400).json({ error: 'Invalid or unsupported image format. Magic bytes check failed.' });
    }

    // Call Gemini vision
    const result = await gemini.extractTextFromImage(partBody, detectedMime);
    if (!result.ok) {
      return res.status(503).json({
        error: 'AI service unavailable: ' + result.reason,
        code: 'AI_UNAVAILABLE',
        reason: result.reason
      });
    }

    return res.json({
      text: result.data.text,
      readability: result.data.readability,
      notes: result.data.notes
    });
  });
}

module.exports = {
  handleExtractText,
  detectMagicBytes,
  parseMultipartImage
};


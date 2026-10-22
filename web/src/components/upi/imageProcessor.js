/**
 * Client-side image pre-processing for UPI screenshot flow.
 * Solves the Content Security Policy img-src violation:
 * CSP blocks blob: and data: URLs in <img> tags.
 * Decoding via createImageBitmap and drawing directly to <canvas>
 * bypasses img-src completely while providing fast, reliable thumbnails and viewing.
 */

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export async function processScreenshotFile(file) {
  if (!file) throw new Error('No file provided.');
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Image file size exceeds the 5 MB limit. Please choose a smaller file.');
  }

  // 1. Inspect first 16 bytes for magic bytes and container signatures
  const headerBuf = await file.slice(0, 16).arrayBuffer();
  const bytes = new Uint8Array(headerBuf);

  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp =
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // RIFF
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50; // WEBP

  // Check for HEIC / AVIF signature
  const headerStr = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
  const isHeicOrAvif =
    (file.type && /heic|heif|avif/i.test(file.type)) ||
    (headerStr.includes('ftyp') && (headerStr.includes('heic') || headerStr.includes('mif1') || headerStr.includes('avif') || headerStr.includes('msf1')));

  if (isHeicOrAvif) {
    throw new Error('Please convert this image to PNG, JPG or WEBP first (HEIC and AVIF are not supported).');
  }

  if (!isPng && !isJpg && !isWebp) {
    throw new Error('Please upload a PNG, JPG or WEBP image.');
  }

  // 2. Decode using createImageBitmap with HTMLImageElement fallback
  let bitmap = null;
  let imgObj = null;
  let width = 0;
  let height = 0;

  try {
    if (typeof window.createImageBitmap === 'function') {
      bitmap = await window.createImageBitmap(file, { imageOrientation: 'from-image' });
      width = bitmap.width;
      height = bitmap.height;
    }
  } catch (e) {
    // Fallback to Image element
  }

  if (!bitmap) {
    try {
      imgObj = await new Promise((resolve, reject) => {
        const tempImg = new Image();
        const tempUrl = URL.createObjectURL(file);
        tempImg.onload = () => {
          URL.revokeObjectURL(tempUrl);
          resolve(tempImg);
        };
        tempImg.onerror = () => {
          URL.revokeObjectURL(tempUrl);
          reject(new Error('Image decode error'));
        };
        tempImg.src = tempUrl;
      });
      width = imgObj.naturalWidth || imgObj.width;
      height = imgObj.naturalHeight || imgObj.height;
    } catch (e) {
      throw new Error('This image could not be read. Please upload a clear PNG, JPG or WEBP screenshot.');
    }
  }

  if (!width || !height) {
    if (bitmap?.close) bitmap.close();
    throw new Error('This image could not be read. Please upload a clear PNG, JPG or WEBP screenshot.');
  }

  // 3. Scale down to at most 1600 px on the longest side
  const maxDim = 1600;
  let targetW = width;
  let targetH = height;
  if (targetW > maxDim || targetH > maxDim) {
    if (targetW > targetH) {
      targetH = Math.round((targetH * maxDim) / targetW);
      targetW = maxDim;
    } else {
      targetW = Math.round((targetW * maxDim) / targetH);
      targetH = maxDim;
    }
  }

  // 4. Draw to canvas with white background fill (for transparent PNGs)
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(bitmap || imgObj, 0, 0, targetW, targetH);

  if (bitmap?.close) bitmap.close();

  // 5. Re-encode as JPEG at quality 0.85 for upload
  let uploadFile = null;
  try {
    const uploadBlob = await new Promise(resolve => {
      canvas.toBlob(b => resolve(b), 'image/jpeg', 0.85);
    });
    if (uploadBlob && uploadBlob.size > 0 && uploadBlob.size <= 5 * 1024 * 1024) {
      const baseName = (file.name || 'screenshot').replace(/\.[^.]+$/, '');
      uploadFile = new File([uploadBlob], `${baseName}.jpg`, { type: 'image/jpeg' });
    }
  } catch (e) {
    // fallback below
  }

  // Fallback: send original file if re-encoding failed and original is valid format and <= 5MB
  if (!uploadFile) {
    if (file.size <= 5 * 1024 * 1024) {
      uploadFile = file;
    } else {
      throw new Error('Image could not be compressed below 5 MB. Please choose a smaller file.');
    }
  }

  return {
    canvas,
    uploadFile,
    width: targetW,
    height: targetH,
    originalName: file.name || 'screenshot.png',
    sizeFormatted: formatBytes(uploadFile.size)
  };
}


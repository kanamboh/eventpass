import crypto from 'crypto';
import { AppError } from '../middleware/errorHandler.js';

export const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB (Vercel serverless payload compatible: under 4.5 MB limit)

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp'
]);

/**
 * Inspects binary magic bytes / signatures to determine actual image format.
 * Strictly supports JPEG, PNG, and WebP.
 * Rejects disguised files (e.g. text/html/executables renamed with .jpg).
 *
 * @param {Buffer} buffer
 * @returns {{ format: string, mimeType: string, extension: string } | null}
 */
export function detectMagicBytes(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  // 1. JPEG signature: 0xFF, 0xD8, 0xFF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return {
      format: 'JPEG',
      mimeType: 'image/jpeg',
      extension: 'jpg'
    };
  }

  // 2. PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A
  ) {
    return {
      format: 'PNG',
      mimeType: 'image/png',
      extension: 'png'
    };
  }

  // 3. WebP signature: RIFF (bytes 0-3) and WEBP (bytes 8-11)
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return {
      format: 'WEBP',
      mimeType: 'image/webp',
      extension: 'webp'
    };
  }

  return null;
}

/**
 * Validates an uploaded image buffer for size, declared MIME type, and binary magic bytes.
 * Generates an immutable, collision-resistant server-side object ID to prevent path traversal.
 *
 * @param {Buffer} buffer - File buffer in memory
 * @param {string} originalname - Client-supplied filename (for audit only)
 * @param {string} declaredMimeType - Client-supplied Content-Type
 * @returns {{
 *   format: string,
 *   mimeType: string,
 *   extension: string,
 *   size: number,
 *   safeFilename: string,
 *   publicId: string
 * }}
 */
export function validateImageBuffer(buffer, originalname = '', declaredMimeType = '') {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new AppError('No image content received. Please select a valid image file.', 400, 'MISSING_FILE');
  }

  // 1. Size Check
  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw new AppError('File exceeds the maximum allowed size of 4 MB.', 400, 'LIMIT_FILE_SIZE');
  }

  // 2. Declared MIME validation
  const normalizedMime = (declaredMimeType || '').trim().toLowerCase();
  if (normalizedMime && !ALLOWED_MIME_TYPES.has(normalizedMime)) {
    throw new AppError(
      'Unsupported image format. Only JPEG, PNG, and WebP images are allowed.',
      400,
      'INVALID_FILE_TYPE'
    );
  }

  // 3. Deep Magic Bytes Content Inspection
  const detected = detectMagicBytes(buffer);
  if (!detected) {
    throw new AppError(
      'Invalid image content. The uploaded file does not match a valid JPEG, PNG, or WebP signature.',
      400,
      'INVALID_FILE_CONTENT'
    );
  }

  // 4. Generate Safe Server-Side Object Identifier (completely immune to path traversal)
  const uniqueId = crypto.randomUUID();
  const safeFilename = `event_poster_${uniqueId}.${detected.extension}`;
  const publicId = `event_posters/${uniqueId}`;

  return {
    format: detected.format,
    mimeType: detected.mimeType,
    extension: detected.extension,
    size: buffer.length,
    safeFilename,
    publicId
  };
}

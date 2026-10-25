import { AppError } from './errorHandler.js';
import { MAX_IMAGE_SIZE_BYTES } from '../utils/imageValidator.js';

/**
 * Express middleware for parsing secure single image multipart/form-data uploads.
 * Streams the request body in-memory with strict 5 MB byte-counter limit enforcement.
 *
 * Populates req.file with { originalname, mimetype, size, buffer }.
 */
export async function uploadPosterMiddleware(req, res, next) {
  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return next(
        new AppError(
          'Invalid content type. Expected multipart/form-data for image upload.',
          400,
          'INVALID_CONTENT_TYPE'
        )
      );
    }

    const chunks = [];
    let totalBytes = 0;

    for await (const chunk of req) {
      totalBytes += chunk.length;
      if (totalBytes > MAX_IMAGE_SIZE_BYTES) {
        req.resume();
        res.set('Connection', 'close');
        return next(
          new AppError(
            'File exceeds the maximum allowed size of 4 MB.',
            400,
            'LIMIT_FILE_SIZE'
          )
        );
      }
      chunks.push(chunk);
    }

    const rawBuffer = Buffer.concat(chunks);
    const webReq = new Request('http://localhost/api/admin/events/upload-poster', {
      method: req.method,
      headers: { 'content-type': contentType },
      body: rawBuffer
    });

    let formData;
    try {
      formData = await webReq.formData();
    } catch (parseErr) {
      return next(
        new AppError(
          'Failed to parse multipart form data. Please ensure the file was sent correctly.',
          400,
          'MALFORMED_FORM_DATA'
        )
      );
    }

    // Accept field names: 'poster', 'image', or 'file'
    let file = formData.get('poster') || formData.get('image') || formData.get('file');

    if (!file) {
      // Check if any field is an uploaded file
      for (const [key, value] of formData.entries()) {
        if (value && typeof value === 'object' && typeof value.arrayBuffer === 'function') {
          file = value;
          break;
        }
      }
    }

    if (!file || typeof file === 'string' || !file.size) {
      return next(
        new AppError(
          'No image file uploaded. Please select an image file to upload.',
          400,
          'MISSING_FILE'
        )
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    if (fileBuffer.length > MAX_IMAGE_SIZE_BYTES) {
      return next(
        new AppError(
          'File exceeds the maximum allowed size of 4 MB.',
          400,
          'LIMIT_FILE_SIZE'
        )
      );
    }

    req.file = {
      originalname: file.name || 'uploaded_image',
      mimetype: file.type || 'application/octet-stream',
      size: fileBuffer.length,
      buffer: fileBuffer
    };

    next();
  } catch (err) {
    next(err);
  }
}

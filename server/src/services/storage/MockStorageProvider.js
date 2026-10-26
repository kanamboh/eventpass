import { StorageProvider } from './StorageProvider.js';

/**
 * Mock Storage Provider
 * Safe, fast in-memory mock provider for local development and automated CI testing.
 * Produces deterministic, valid CDN URLs without requiring external credentials.
 */
export class MockStorageProvider extends StorageProvider {
  constructor() {
    super();
    this.uploadedImages = new Map();
  }

  async uploadImage({ buffer, mimeType, extension, publicId, safeFilename }) {
    const timestamp = Math.floor(Date.now() / 1000);
    const mockUrl = `https://res.cloudinary.com/eventpass-mock/image/upload/v${timestamp}/${publicId}.${extension}`;

    const record = {
      url: mockUrl,
      publicId,
      format: extension.toUpperCase(),
      mimeType,
      size: buffer.length,
      createdAt: new Date().toISOString()
    };

    this.uploadedImages.set(publicId, record);

    return {
      url: mockUrl,
      publicId,
      format: record.format,
      size: record.size
    };
  }

  async deleteImage(publicId) {
    const deleted = this.uploadedImages.delete(publicId);
    return { result: deleted ? 'ok' : 'not found' };
  }

  hasImage(publicId) {
    return this.uploadedImages.has(publicId);
  }

  clear() {
    this.uploadedImages.clear();
  }
}


/**
 * Abstract Base Storage Provider
 * Defines contract for image storage providers.
 */
export class StorageProvider {
  /**
   * Upload an image buffer to persistent storage.
   *
   * @param {Object} params
   * @param {Buffer} params.buffer - Image binary data
   * @param {string} params.mimeType - MIME type (e.g. 'image/jpeg')
   * @param {string} params.extension - File extension (e.g. 'jpg')
   * @param {string} params.publicId - Managed object ID
   * @param {string} params.safeFilename - Sanitized filename
   * @returns {Promise<{ url: string, publicId: string, format: string, size: number }>}
   */
  async uploadImage(params) {
    throw new Error('uploadImage must be implemented by subclass.');
  }
}

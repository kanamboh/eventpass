import crypto from 'crypto';
import { StorageProvider } from './StorageProvider.js';
import { AppError } from '../../middleware/errorHandler.js';
import { logger } from '../../config/logger.js';

export class CloudinaryStorageProvider extends StorageProvider {
  /**
   * @param {Object} config
   * @param {string} [config.cloudName]
   * @param {string} [config.apiKey]
   * @param {string} [config.apiSecret]
   */
  constructor({ cloudName, apiKey, apiSecret } = {}) {
    super();
    this.cloudName = cloudName ? cloudName.trim() : '';
    this.apiKey = apiKey ? apiKey.trim() : '';
    this.apiSecret = apiSecret ? apiSecret.trim() : '';
  }

  isConfigured() {
    return Boolean(this.cloudName && this.apiKey && this.apiSecret);
  }

  /**
   * Generates SHA-1 signature for Cloudinary signed uploads.
   * Parameter keys are sorted alphabetically, formatted as key=value, and concatenated with the API secret.
   *
   * @param {Record<string, any>} params
   * @param {string} apiSecret
   * @returns {string}
   */
  generateSignature(params, apiSecret) {
    const keys = Object.keys(params)
      .filter(k => k !== 'file' && k !== 'api_key' && k !== 'resource_type' && k !== 'signature' && params[k] !== undefined && params[k] !== null)
      .sort();

    const serialized = keys.map(k => `${k}=${params[k]}`).join('&');
    return crypto.createHash('sha1').update(serialized + apiSecret).digest('hex');
  }

  async uploadImage({ buffer, mimeType, extension, publicId, safeFilename }) {
    if (!this.isConfigured()) {
      throw new AppError(
        'Cloud storage is not configured. Please configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in the backend environment, or specify an image URL directly.',
        503,
        'STORAGE_NOT_CONFIGURED'
      );
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'event_posters';

    const signingParams = {
      folder,
      public_id: publicId.replace(/^event_posters\//, ''),
      timestamp
    };

    const signature = this.generateSignature(signingParams, this.apiSecret);

    const formData = new FormData();
    formData.append('file', new Blob([buffer], { type: mimeType }), safeFilename);
    formData.append('api_key', this.apiKey);
    formData.append('timestamp', String(timestamp));
    formData.append('folder', folder);
    formData.append('public_id', signingParams.public_id);
    formData.append('signature', signature);

    const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(this.cloudName)}/image/upload`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        logger.error({
          status: response.status,
          error: body?.error?.message || 'Cloudinary upload failed'
        }, 'Cloudinary upload rejected');

        throw new AppError(
          body?.error?.message || 'Failed to upload image to cloud storage. Please verify storage credentials or use an image URL directly.',
          502,
          'STORAGE_UPLOAD_FAILED'
        );
      }

      return {
        url: body.secure_url || body.url,
        publicId: body.public_id,
        format: body.format || extension.toUpperCase(),
        size: body.bytes || buffer.length
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ error: err.message }, 'Unexpected network failure during cloud image upload');
      throw new AppError(
        'Unable to connect to cloud storage provider. Please check network connection or specify an image URL directly.',
        502,
        'STORAGE_NETWORK_ERROR'
      );
    }
  }
}

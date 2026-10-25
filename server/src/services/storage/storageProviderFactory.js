import { env } from '../../config/env.js';
import { CloudinaryStorageProvider } from './CloudinaryStorageProvider.js';
import { MockStorageProvider } from './MockStorageProvider.js';

let defaultInstance = null;

/**
 * Creates or retrieves a StorageProvider instance based on environment configuration.
 *
 * @param {Object} [overrideConfig] - Optional overrides for testing
 * @returns {import('./StorageProvider.js').StorageProvider}
 */
export function getStorageProvider(overrideConfig = null) {
  if (overrideConfig) {
    const providerType = overrideConfig.STORAGE_PROVIDER || 'CLOUDINARY';
    if (providerType === 'MOCK') {
      return new MockStorageProvider();
    }
    return new CloudinaryStorageProvider({
      cloudName: overrideConfig.CLOUDINARY_CLOUD_NAME,
      apiKey: overrideConfig.CLOUDINARY_API_KEY,
      apiSecret: overrideConfig.CLOUDINARY_API_SECRET
    });
  }

  if (!defaultInstance) {
    if (env.STORAGE_PROVIDER === 'MOCK') {
      defaultInstance = new MockStorageProvider();
    } else {
      defaultInstance = new CloudinaryStorageProvider({
        cloudName: env.CLOUDINARY_CLOUD_NAME,
        apiKey: env.CLOUDINARY_API_KEY,
        apiSecret: env.CLOUDINARY_API_SECRET
      });
    }
  }

  return defaultInstance;
}

export function resetStorageProvider() {
  defaultInstance = null;
}

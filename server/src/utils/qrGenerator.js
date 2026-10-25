import QRCode from 'qrcode';
import { logger } from '../config/logger.js';

/**
 * Generate a scannable QR Code as an SVG string
 * @param {string} payload - Text or credential payload to encode
 * @returns {Promise<string>} - SVG XML string
 */
export const generateQrSvg = async (payload) => {
  try {
    return await QRCode.toString(payload, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
  } catch (err) {
    logger.error({ msg: 'Failed to generate QR SVG', error: err.message });
    throw err;
  }
};

/**
 * Generate a scannable QR Code as a base64 Data URL (PNG)
 * @param {string} payload - Text or credential payload to encode
 * @returns {Promise<string>} - data:image/png;base64,...
 */
export const generateQrDataUrl = async (payload) => {
  try {
    return await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 256,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
  } catch (err) {
    logger.error({ msg: 'Failed to generate QR Data URL', error: err.message });
    throw err;
  }
};

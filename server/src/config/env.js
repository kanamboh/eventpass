import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env
dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('5000').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CLIENT_URL: z.string().default('http://localhost:3001'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  RESERVATION_TTL_SECONDS: z.string().default('600').transform((val) => parseInt(val, 10)),
  PAYMENT_PROVIDER: z.enum(['PAYSTACK', 'MOCK']).default('MOCK'),
  PAYMENTS_ENABLED: z
    .preprocess((val) => {
      if (typeof val === 'boolean') return val ? 'true' : 'false';
      if (typeof val === 'string') return val;
      return 'false';
    }, z.string().default('false'))
    .transform((val) => {
      const normalized = String(val || '').trim().toLowerCase();
      return normalized === 'true' || normalized === '1';
    }),
  REGISTRATION_ENABLED: z
    .preprocess((val) => {
      if (typeof val === 'boolean') return val ? 'true' : 'false';
      if (typeof val === 'string') return val;
      return 'true';
    }, z.string().default('true'))
    .transform((val) => {
      const normalized = String(val || '').trim().toLowerCase();
      return normalized === 'true' || normalized === '1';
    }),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional(),
  PAYSTACK_MERCHANT_COUNTRY: z.enum(['KE', 'ZA', 'NG', 'GH']).default('KE'),
  SCANNER_API_KEY: z.string().default('eventpass-gate-scanner-2026-key'),
  EMAIL_PROVIDER: z.enum(['MOCK', 'SMTP']).default('MOCK'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 587)),
  SMTP_SECURE: z.string().optional().transform((val) => val === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('tickets@eventpass.co.za'),
  SUPPORT_EMAIL: z.string().default('support@eventpass.co.za'),
  STORAGE_PROVIDER: z.enum(['CLOUDINARY', 'MOCK']).default('CLOUDINARY'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional()
}).refine((data) => {

  // Safety guard: Strictly forbid live keys in development or test environments
  if (data.NODE_ENV !== 'production' && data.PAYSTACK_SECRET_KEY && data.PAYSTACK_SECRET_KEY.startsWith('sk_live_')) {
    return false;
  }
  return true;
}, {
  message: 'CRITICAL SECURITY ERROR: Live Paystack secret key (sk_live_...) cannot be used in development or test environments.',
  path: ['PAYSTACK_SECRET_KEY']
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', JSON.stringify(parsedEnv.error.format(), null, 2));
  process.exit(1);
}

export const env = parsedEnv.data;

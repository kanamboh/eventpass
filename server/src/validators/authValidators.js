import { z } from 'zod';

// Phone format regex: E.164, local South African (0XX...), or standard international
const phoneRegex = /^\+?[0-9\s\-()]{7,20}$/;

// Strong password policy: min 8 chars, 1 uppercase, 1 lowercase, 1 number
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;

export const registerSchema = z.object({
  fullName: z.string({ required_error: 'Full name is required' })
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must not exceed 100 characters'),

  email: z.string({ required_error: 'Email is required' })
    .trim()
    .toLowerCase()
    .email('Please provide a valid email address')
    .max(255, 'Email must not exceed 255 characters'),

  phone: z.string({ required_error: 'Phone number is required' })
    .trim()
    .regex(phoneRegex, 'Please provide a valid phone number (e.g., +27 82 123 4567 or 0821234567)'),

  city: z.string({ required_error: 'City is required' })
    .trim()
    .min(2, 'City must be at least 2 characters')
    .max(100, 'City must not exceed 100 characters'),

  password: z.string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(passwordRegex, 'Password must include at least one uppercase letter, one lowercase letter, and one number'),

  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Terms of Service to register' })
  })
});

export const loginSchema = z.object({
  email: z.string({ required_error: 'Email is required' })
    .trim()
    .toLowerCase()
    .email('Please provide a valid email address'),

  password: z.string({ required_error: 'Password is required' })
    .min(1, 'Password cannot be empty')
    .max(128, 'Password is too long')
});

export const verifyEmailSchema = z.object({
  token: z.string({ required_error: 'Verification token is required' })
    .trim()
    .min(16, 'Invalid verification token format')
    .max(128, 'Invalid verification token format')
});

export const resendVerificationSchema = z.object({
  email: z.string()
    .trim()
    .toLowerCase()
    .email('Please provide a valid email address')
    .optional()
}).strict();


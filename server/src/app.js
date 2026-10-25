import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { sessionMiddleware } from './config/session.js';
import { requestLogger } from './middleware/requestLogger.js';
import { globalRateLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { verifyOrigin } from './middleware/authMiddleware.js';
import apiRoutes from './routes/index.js';

const app = express();

// Trust reverse proxy for single hop (e.g. Railway edge proxy)
// Allows express-rate-limit and req.ip to obtain authentic client IP without blindly trusting spoofed headers
app.set('trust proxy', 1);

// Security Headers with Helmet
app.use(helmet({
  contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: false
}));

// CORS Configuration supporting HttpOnly cookie credentials
const localDevOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001'
];

const allowedOrigins = [
  env.CLIENT_URL,
  ...(env.NODE_ENV !== 'production' ? localDevOrigins : [])
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    return callback(new Error('Blocked by CORS policy'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Request body size limits with exact raw byte buffer preservation for webhook HMAC verification
app.use(express.json({
  limit: '1mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Structured Request Logging
app.use(requestLogger);

// PostgreSQL-backed Session Middleware
app.use(sessionMiddleware);

// CSRF Origin verification defense-in-depth on mutating methods
app.use('/api', verifyOrigin);

// Global Rate Limiting
app.use('/api', globalRateLimiter);

// API Routes
app.use('/api', apiRoutes);

// Root informational endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'EventPass API',
    version: '1.0.0',
    documentation: '/api/health'
  });
});

// 404 handler
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);

export default app;

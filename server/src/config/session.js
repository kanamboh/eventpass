import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import pg from 'pg';
import { env } from './env.js';

const PgSession = connectPgSimple(session);

// Dedicated connection pool for session storage (tuned for serverless concurrency)
const isServerless = Boolean(process.env.VERCEL);
export const sessionPgPool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: isServerless ? 2 : (env.NODE_ENV === 'production' ? 5 : 10),
  idleTimeoutMillis: 30000
});

export const sessionMiddleware = session({
  store: new PgSession({
    pool: sessionPgPool,
    tableName: 'session',
    createTableIfMissing: false, // Managed by Prisma schema migrations
    // Disable background timer in serverless to prevent event-loop suspension delays
    pruneSessionInterval: isServerless ? false : 60 * 15
  }),
  name: 'eventpass.sid',
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true, // Refresh expiration on activity
  cookie: {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
  }
});

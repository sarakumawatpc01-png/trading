import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const adminApiKey = process.env.ADMIN_API_KEY || '';
const enforceAdminApiAuth = process.env.ADMIN_API_ENFORCE
  ? process.env.ADMIN_API_ENFORCE === 'true'
  : nodeEnv === 'production';

if (enforceAdminApiAuth && !adminApiKey) {
  throw new Error('ADMIN_API_KEY must be set when admin API protection is enforced');
}

export const config = {
  nodeEnv,
  port: Number(process.env.BACKEND_PORT || 8080),
  redisUrl: process.env.REDIS_URL || 'redis://redis:6379',
  clickhouseUrl: process.env.CLICKHOUSE_URL || 'http://clickhouse:8123',
  clickhouseUser: process.env.CLICKHOUSE_USER || 'default',
  clickhousePassword: process.env.CLICKHOUSE_PASSWORD || '',
  useInMemoryQueue: process.env.USE_INMEMORY_QUEUE === 'true',
  queueConcurrency: Number(process.env.QUEUE_CONCURRENCY || 5),
  pythonServiceUrl: process.env.PYTHON_SERVICE_URL || 'http://python-service:8000',
  adminApiKey,
  enforceAdminApiAuth,
  corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  requestBodyLimit: process.env.REQUEST_BODY_LIMIT || '1mb',
  trustProxy: Number(process.env.TRUST_PROXY || 1),
  adminRateLimitWindowMs: Number(process.env.ADMIN_RATE_LIMIT_WINDOW_MS || 60000),
  adminRateLimitMax: Number(process.env.ADMIN_RATE_LIMIT_MAX || 120)
};

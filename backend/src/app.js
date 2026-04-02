import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createApiRouter } from './routes/api.js';

export function createApp(deps) {
  const { config } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.corsAllowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    }
  }));
  app.use(express.json({ limit: config.requestBodyLimit }));
  app.use('/api/admin', createAdminAuthMiddleware(config));
  app.use('/api/admin', createAdminRateLimitMiddleware(config));
  app.use('/api', createApiRouter(deps));
  return app;
}

function createAdminAuthMiddleware(config) {
  return (req, res, next) => {
    if (!config.enforceAdminApiAuth) return next();
    const incomingKey = req.get('x-admin-key');
    if (!incomingKey || incomingKey !== config.adminApiKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return next();
  };
}

function createAdminRateLimitMiddleware(config) {
  return rateLimit({
    windowMs: config.adminRateLimitWindowMs,
    max: config.adminRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests' }
  });
}

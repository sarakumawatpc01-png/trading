import express from 'express';
import cors from 'cors';
import { createApiRouter } from './routes/api.js';

export function createApp(deps) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', createApiRouter(deps));
  return app;
}

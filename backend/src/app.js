import express from 'express';
import cors from 'cors';
import { createApiRouter } from './routes/api.js';

export function createApp(deps) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', createApiRouter(deps));
  return app;
}

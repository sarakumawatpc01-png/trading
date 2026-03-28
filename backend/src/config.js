import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.BACKEND_PORT || 8080),
  redisUrl: process.env.REDIS_URL || 'redis://redis:6379',
  clickhouseUrl: process.env.CLICKHOUSE_URL || 'http://clickhouse:8123',
  clickhouseUser: process.env.CLICKHOUSE_USER || 'default',
  clickhousePassword: process.env.CLICKHOUSE_PASSWORD || '',
  useInMemoryQueue: process.env.USE_INMEMORY_QUEUE === 'true',
  queueConcurrency: Number(process.env.QUEUE_CONCURRENCY || 5),
  pythonServiceUrl: process.env.PYTHON_SERVICE_URL || 'http://python-service:8000'
};

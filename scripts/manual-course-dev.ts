import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { createApp } from '../apps/api/src/app/app.js';
import { loadConfig } from '../apps/api/src/infrastructure/config/config.js';
import { connectDatabase } from '../apps/api/src/infrastructure/database/database.js';
const mongo = await MongoMemoryServer.create();
const port = Number(process.env.VAANI_PREVIEW_API_PORT ?? '3101');
const config = loadConfig({
  NODE_ENV: 'test',
  MONGODB_URI: mongo.getUri(),
  ACCESS_TOKEN_SECRET: randomBytes(48).toString('hex'),
  REFRESH_TOKEN_PEPPER: randomBytes(48).toString('hex'),
  WEB_ORIGINS: process.env.VAANI_PREVIEW_ORIGIN ?? 'http://localhost:5174',
  API_PORT: String(port),
  AUTH_RATE_MAX: '1000',
  REFRESH_RATE_MAX: '1000',
});
await connectDatabase(config.MONGODB_URI);
const server = createApp(config).listen(port, () =>
  console.info(`Isolated course test API: http://localhost:${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(() => {
      void mongoose
        .disconnect()
        .then(() => mongo.stop())
        .then(() => process.exit(0));
    }),
  );

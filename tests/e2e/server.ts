import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../apps/api/src/app/app.js';
import { loadConfig } from '../../apps/api/src/infrastructure/config/config.js';
import { User } from '../../apps/api/src/features/auth/auth.model.js';
import { AuthSession } from '../../apps/api/src/features/auth/auth-session.model.js';
import { LearningSession } from '../../apps/api/src/features/sessions/sessions.model.js';
import { importContent } from '../../apps/api/src/features/content/content.import.js';

const mongo = await MongoMemoryServer.create();
await mongoose.connect(mongo.getUri());
await Promise.all([User.init(), AuthSession.init(), LearningSession.init()]);
await importContent();
const config = loadConfig({
  NODE_ENV: 'test',
  API_PORT: process.env.E2E_API_PORT ?? '3187',
  MONGODB_URI: mongo.getUri(),
  ACCESS_TOKEN_SECRET: randomBytes(48).toString('hex'),
  REFRESH_TOKEN_PEPPER: randomBytes(48).toString('hex'),
  WEB_ORIGINS: process.env.E2E_WEB_ORIGIN ?? 'http://localhost:5187',
});
const server = createApp(config).listen(config.API_PORT, () => {
  console.info(`E2E API ready on ${config.API_PORT}; disposable database`);
});
let closing = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    server.close(() => {
      void mongoose
        .disconnect()
        .then(() => mongo.stop())
        .then(() => process.exit(0));
    });
  });
}

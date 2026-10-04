import 'dotenv/config';
import mongoose from 'mongoose';
import { loadConfig } from '../infrastructure/config/config.js';
import { localDevelopmentEnv } from '../infrastructure/config/local-env.js';
import { connectDatabase } from '../infrastructure/database/database.js';
import { createApp } from './app.js';

async function start() {
  const config = loadConfig(localDevelopmentEnv());
  await connectDatabase(config.MONGODB_URI);
  const server = createApp(config).listen(config.API_PORT, () =>
    console.info(`Vaani API listening on port ${config.API_PORT}`),
  );
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      server.close(() => {
        void mongoose.disconnect().then(() => process.exit(0));
      });
    });
  }
}
void start().catch(async () => {
  // Database errors can contain connection details; never serialize them.
  console.error(
    'Unable to start Vaani API. Check environment configuration and MongoDB connectivity.',
  );
  await mongoose.disconnect();
  process.exitCode = 1;
});

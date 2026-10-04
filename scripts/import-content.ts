import 'dotenv/config';
import mongoose from 'mongoose';
import { loadConfig } from '../apps/api/src/infrastructure/config/config.js';
import { localDevelopmentEnv } from '../apps/api/src/infrastructure/config/local-env.js';
import { importContent } from '../apps/api/src/features/content/content.import.js';
try {const c=loadConfig(localDevelopmentEnv());await mongoose.connect(c.MONGODB_URI,{autoIndex:false});console.log(JSON.stringify(await importContent(),null,2));}catch{console.error('Import failed; validate content and database configuration.');process.exitCode=1;}finally{await mongoose.disconnect();}

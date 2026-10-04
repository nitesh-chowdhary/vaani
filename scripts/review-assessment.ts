import 'dotenv/config';
import { readFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { loadConfig } from '../apps/api/src/infrastructure/config/config.js';
import { localDevelopmentEnv } from '../apps/api/src/infrastructure/config/local-env.js';
import { reviewAssessment } from '../apps/api/src/features/assessments/assessments.service.js';
try {const path=process.argv[2];if(!path)throw new Error('Review file required');const c=loadConfig(localDevelopmentEnv());await mongoose.connect(c.MONGODB_URI);console.log(await reviewAssessment(JSON.parse(readFileSync(path,'utf8'))));}catch{console.error('Review failed. Check the review file, capability descriptors, and database configuration.');process.exitCode=1;}finally{await mongoose.disconnect();}

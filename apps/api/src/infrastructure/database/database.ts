import { LearningSession } from '../../features/sessions/sessions.model.js';
import mongoose from 'mongoose';
import { User } from '../../features/auth/auth.model.js';
import { AuthSession } from '../../features/auth/auth-session.model.js';
export async function connectDatabase(uri: string) {
  await mongoose.connect(uri, { autoIndex: false });
  await Promise.all([User.createIndexes(), AuthSession.createIndexes(), LearningSession.createIndexes()]);
}

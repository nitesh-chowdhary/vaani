import type { LearningEvent } from '@vaani/learning-core';
import { LearningSession } from '../sessions/sessions.model.js';
// Events are append-only within bounded session aggregates. There is no mutable progress authority.
export async function learnerEvents(userId:string):Promise<LearningEvent[]>{const sessions=await LearningSession.find({userId}).sort({startedAt:1}).select('events').lean();return sessions.flatMap(s=>s.events).sort((a,b)=>a.sequence-b.sequence);}

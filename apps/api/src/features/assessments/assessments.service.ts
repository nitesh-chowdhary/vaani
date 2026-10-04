import { z } from 'zod';
import { loadContent } from '../content/content.service.js';
import { learnerEvents } from '../learning-events/learning-events.service.js';
import { LearningSession } from '../sessions/sessions.model.js';
import { ApiError } from '../../infrastructure/errors/api-error.js';
import type { LearningEvent } from '@vaani/learning-core';
const reviewSchema=z.object({reviewId:z.string().uuid(),userId:z.string().min(1),attemptId:z.string().uuid(),reviewer:z.string().min(1),passed:z.boolean(),capabilities:z.array(z.string()).min(1)}).strict();
// Trusted operator entry point only; never exposed as a learner API.
export async function reviewAssessment(input:unknown,now=Date.now()){
 const review=reviewSchema.parse(input);const events=await learnerEvents(review.userId);const attempt=events.find(e=>e.type==='assessment_attempted'&&e.id===review.attemptId);
 if(!attempt?.assessmentId||!attempt.level||!attempt.unseen)throw new ApiError(400,'invalid_assessment','Unseen attempt required.');
 if(events.some(e=>e.type==='assessment_reviewed'&&e.assessmentId===attempt.assessmentId))throw new ApiError(409,'already_reviewed','Attempt already reviewed.');
 const {catalog}=loadContent();const permitted=[...(catalog.master.levelExitCapabilities[attempt.level] as string[]),...((catalog.master.c2ExitCriteriaDetailed as {mustDemonstrateRepeatedlyOnUnseenMaterial:string[]}).mustDemonstrateRepeatedlyOnUnseenMaterial)];
 if(review.capabilities.some(c=>!permitted.includes(c)))throw new ApiError(400,'invalid_capability','Use exact master capability descriptors.');
 const s=await LearningSession.findOne({_id:attempt.sessionId,userId:review.userId});if(!s)throw new ApiError(404,'session_not_found','Session not found.');
 const event:LearningEvent={id:review.reviewId,sessionId:s.id,sequence:Math.max(now*1000,(events.at(-1)?.sequence??0)+1),at:now,type:'assessment_reviewed',assessmentId:attempt.assessmentId,level:attempt.level,capabilities:review.capabilities,verified:true,unseen:true,evidence:review.passed?'independent':'incorrect',response:`Reviewed by ${review.reviewer}`};
 const result=await LearningSession.updateOne({_id:s.id,version:s.version},{$push:{events:event},$inc:{version:1}});if(!result.modifiedCount)throw new ApiError(409,'concurrent_update','Try review again.');return {reviewId:event.id};
}

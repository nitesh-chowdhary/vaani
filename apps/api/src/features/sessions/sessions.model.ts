import { Schema, model } from 'mongoose';
import type { Activity, LearningEvent, Plan } from '@vaani/learning-core';
export interface SessionRecord {userId:string;status:'active'|'completed';sourceHash:string;plan:Plan;cursor:number;current:Activity|null;events:LearningEvent[];version:number;startedAt:Date;completedAt?:Date;}
const schema=new Schema<SessionRecord>({userId:{type:String,required:true},status:{type:String,enum:['active','completed'],required:true},sourceHash:{type:String,required:true},plan:{type:Schema.Types.Mixed,required:true},cursor:{type:Number,default:0},current:{type:Schema.Types.Mixed,default:null},events:{type:Schema.Types.Mixed,default:[]},version:{type:Number,default:0},startedAt:{type:Date,required:true},completedAt:Date});
schema.index({userId:1,status:1},{unique:true,partialFilterExpression:{status:'active'}});schema.index({userId:1,startedAt:1});
export const LearningSession=model<SessionRecord>('LearningSession',schema);

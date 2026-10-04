import { Schema, model } from 'mongoose';
const schema=new Schema({courseId:{type:String,required:true},section:{type:String,required:true},sourceHash:{type:String,required:true},payload:{type:Schema.Types.Mixed,required:true}},{timestamps:true});
schema.index({courseId:1,section:1},{unique:true});
export const ContentSection=model('ContentSection',schema);

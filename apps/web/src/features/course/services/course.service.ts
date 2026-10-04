import { apiClient } from '../../../lib/api-client';
import type { Course, Session, ActionResult, Target } from '../types/course.types';
export const courseService={
 home:()=>apiClient.request<Course>('/course'),
 start:(minutes=60)=>apiClient.request<Session>('/sessions',{method:'POST',body:JSON.stringify({minutes})}),
 session:(id:string)=>apiClient.request<Session>(`/sessions/${id}`),
 act:(id:string,input:object)=>apiClient.request<ActionResult>(`/sessions/${id}/events`,{method:'POST',body:JSON.stringify(input)}),
 finish:(id:string)=>apiClient.request<Session>(`/sessions/${id}/finish`,{method:'POST',body:JSON.stringify({eventId:crypto.randomUUID()})}),
 assessment:()=>apiClient.request<{assessment:Target|null}>('/assessments/next'),
 submitAssessment:(id:string,response:string)=>apiClient.request<{message:string}>(`/assessments/${id}/attempts`,{method:'POST',body:JSON.stringify({response})}),
};

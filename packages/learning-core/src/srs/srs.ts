import type { Evidence, ConceptState } from '../events/types.js';
export const DAY=86400000;
export function nextInterval(milestone:number,days:number[]):number {return milestone<days.length?days[milestone]*DAY:days[days.length-1]*DAY*Math.pow(1.5,milestone-days.length+1);}
export function schedule(state:ConceptState,evidence:Evidence,now:number,days:number[],sameSession:number[]):Pick<ConceptState,'dueAt'|'milestone'|'reinforcement'> {
 if(evidence==='unverified')return {dueAt:state.dueAt,milestone:state.milestone,reinforcement:state.reinforcement};
 if(['incorrect','relearned'].includes(evidence))return {dueAt:now+4*60000,milestone:Math.max(0,state.milestone-1),reinforcement:state.reinforcement};
 if(['hinted','hesitant','self_reported'].includes(evidence))return {dueAt:now+(evidence==='hesitant'?12:4)*60000,milestone:state.milestone,reinforcement:state.reinforcement};
 if(now<state.dueAt)return {dueAt:state.dueAt,milestone:state.milestone,reinforcement:state.reinforcement};
 const next=state.reinforcement+1;
 if(next<sameSession.length && now-state.introducedAt<60*60000)return {dueAt:Math.max(now+60000,state.introducedAt+sameSession[next]*60000),milestone:state.milestone,reinforcement:next};
 const milestone=now-state.introducedAt>=DAY?state.milestone+1:state.milestone;
 // Milestones are absolute days since exposure, then extend geometrically forever.
 return {dueAt:(state.introducedAt+nextInterval(milestone,days)>now?state.introducedAt+nextInterval(milestone,days):now+DAY),milestone,reinforcement:sameSession.length};
}

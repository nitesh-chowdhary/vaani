import type { ConceptState, Dimension, Evidence } from '../events/types.js';
export const evidenceWeight:Record<Evidence,number>={independent:1,hesitant:0.6,hinted:0.25,incorrect:-0.6,relearned:0.1,self_reported:0.15,unverified:0};
export function applyEvidence(state:ConceptState,dimension:Dimension,evidence:Evidence):Partial<Record<Dimension,number>> {
 const weight=evidenceWeight[evidence]*(dimension==='transfer_to_unseen_context'?1.5:1);
 return {...state.dimensions,[dimension]:Math.max(0,Math.min(10,(state.dimensions[dimension]??0)+weight))};
}
export function speakingStrength(state:ConceptState):number {return Math.min(state.dimensions.spoken_production??0,state.dimensions.independent_recall??0,state.dimensions.delayed_recall??0);}

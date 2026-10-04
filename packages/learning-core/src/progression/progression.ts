import { levels, type Catalog, type Level } from '../content/types.js';
import type { LearningEvent } from '../events/types.js';
export function progression(catalog:Catalog,events:LearningEvent[]):{level:Level;completedC2:boolean;missing:string[]} {
 let current:Level='A0';let missing:string[]=[];
 for(const level of levels){
 const capabilities=catalog.master.levelExitCapabilities[level] as string[];
 const reviews=events.filter(e=>e.type==='assessment_reviewed'&&e.verified&&e.unseen&&e.level===level&&e.evidence==='independent');
 const days=new Set(reviews.map(e=>Math.floor(e.at/86400000)));
 missing=capabilities.filter(c=>reviews.filter(e=>e.capabilities?.includes(c)).length<2);
 const distinct=new Set(reviews.map(e=>e.assessmentId)).size;
 if(missing.length||days.size<2||distinct<2)return {level:current,completedC2:false,missing:missing.length?missing:['Repeated unseen performance on separate days']};
 if(level==='C2'){
 const detailed=catalog.master.c2ExitCriteriaDetailed as {mustDemonstrateRepeatedlyOnUnseenMaterial:string[]};
 const absent=detailed.mustDemonstrateRepeatedlyOnUnseenMaterial.filter(c=>reviews.filter(e=>e.capabilities?.includes(c)).length<2);
 return {level:'C2',completedC2:absent.length===0,missing:absent};}
 current=levels[levels.indexOf(level)+1];
 }
 return {level:current,completedC2:false,missing};
}

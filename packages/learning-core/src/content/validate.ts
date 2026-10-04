import { requiredSections } from './sections.js';
import { levels, type Master, type RecordData } from './types.js';
export class ContentValidationError extends Error { constructor(public issues:string[]){super(issues.join('\n'));} }
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
export function validateMaster(input:unknown):Master {
 const issues:string[]=[];if(!object(input))throw new ContentValidationError(['Master must be an object']);
 for(const section of requiredSections)if(!(section in input))issues.push(`Missing section: ${section}`);
 const ids=new Map<string,string>();const references:[string,string,string][]=[];
 function visit(value:unknown,path:string){if(Array.isArray(value)){value.forEach((v,i)=>visit(v,`${path}[${i}]`));return;}if(!object(value))return;
 if('id' in value){if(typeof value.id!=='string'||!value.id.trim())issues.push(`Invalid ID at ${path}`);else if(ids.has(value.id))issues.push(`Duplicate ID ${value.id}`);else ids.set(value.id,path);}
 if('level' in value && !levels.includes(value.level as never))issues.push(`Invalid level at ${path}`);
 for(const [key,v] of Object.entries(value)){
 if(['sourceSentenceId','sourceDialogueId','sourceListeningId'].includes(key))references.push([String(v),path,key]);
 if(path!=='master' && path!=='master.displayPolicy' && !path.includes('.variants[') && ['meaning','meaningPattern','exampleMeaning','summary','interpretationGuide','instruction'].includes(key) && (!object(v)||typeof v.en!=='string'||!v.en.trim()))issues.push(`Missing language-keyed English at ${path}.${key}`);
 visit(v,`${path}.${key}`);}}
 visit(input,'master');
 for(const [id,path,key] of references){const target=ids.get(id);const expected={sourceSentenceId:'sentenceBank',sourceDialogueId:'dialogues',sourceListeningId:'listeningScripts'}[key];if(!target||!target.startsWith(`master.${expected}[`))issues.push(`Invalid reference ${id} at ${path}`);}
 const arrays=['lexicalConcepts','sentenceBank','utterancePatterns','grammarInUse','dialogues','listeningScripts','exerciseInstances','unseenSpeakingAssessments','readingCorpus'];
 for(const name of arrays)if(!Array.isArray(input[name])||!(input[name] as unknown[]).length)issues.push(`Missing records: ${name}`);
 for(const family of ['lexicalConcepts','sentenceBank','collocations','idiomsAndColloquialSpeech','utterancePatterns','listeningScripts']){
 for(const r of (Array.isArray(input[family])?input[family]:[]) as RecordData[]){const text=r.telugu??r.teluguPattern??r.transcriptTelugu;const roman=r.romanization??r.romanizationPattern;if(typeof text!=='string'||!/[\u0C00-\u0C7F]/.test(text))issues.push(`Missing Telugu: ${r.id}`);if(typeof roman!=='string'||!roman.trim())issues.push(`Missing romanization: ${r.id}`);}}
 for(const family of ['lexicalConcepts','sentenceBank','collocations','idiomsAndColloquialSpeech','readingCorpus','utterancePatterns','listeningScripts']){
 for(const r of (Array.isArray(input[family])?input[family]:[]) as RecordData[]){
 if(typeof r.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(r.id))issues.push(`Missing stable ID: ${family}`);
 const gloss=r.meaning??r.meaningPattern??r.summary;
 if(!object(gloss)||typeof gloss.en!=='string'||!gloss.en.trim())issues.push(`Missing English meaning: ${r.id}`);
 }
 }
 const declared=new Map<string,string[]>();
 function dependencyVisit(value:unknown){if(Array.isArray(value)){value.forEach(dependencyVisit);return;}if(!object(value))return;if(typeof value.id==='string'&&Array.isArray(value.dependencies)){const dependencies=value.dependencies.map(String);declared.set(value.id,dependencies);for(const id of dependencies)if(!ids.has(id))issues.push(`Unknown dependency ${id}`);}Object.values(value).forEach(dependencyVisit);}
 dependencyVisit(input);
 const completed=new Set<string>();function cycle(id:string,path:Set<string>){if(path.has(id)){issues.push(`Dependency cycle at ${id}`);return;}if(completed.has(id))return;const next=new Set(path).add(id);for(const child of declared.get(id)??[])cycle(child,next);completed.add(id);}for(const id of declared.keys())cycle(id,new Set());
 const policy=input.srsPolicy as Record<string,unknown>|undefined;const milestones=policy?.delayedRecallMilestoneDays;
 if(!Array.isArray(milestones)||![1,2,3,5,7,14,30,60,120,240,365].every(d=>milestones.includes(d))||milestones.some((n,i)=>typeof n!=='number'||(i>0&&n<=milestones[i-1])))issues.push('Invalid delayed SRS milestones');
 if(policy?.continuesBeyond365Days!==true)issues.push('SRS must continue indefinitely');
 if(JSON.stringify(policy?.sameSessionReinforcementMinutes)!==JSON.stringify([0,4,12,25,45]))issues.push('Invalid same-session milestones');
 const binding=input.engineBinding as Record<string,unknown>|undefined;
 if((input.sessionPolicy as Record<string,unknown>|undefined)?.dailyNewItemHardCap!==null||binding?.dailyHardCap!==null)issues.push('Daily hard caps are forbidden');
 if(JSON.stringify(binding?.delayedRecallDays)!==JSON.stringify(milestones)||JSON.stringify(binding?.sameSessionRecallMinutes)!==JSON.stringify(policy?.sameSessionReinforcementMinutes))issues.push('SRS policies disagree');
 if((input.baseLanguage as Record<string,unknown>|undefined)?.default!=='en')issues.push('Current base language must be en');
 if((input.targetLanguage as Record<string,unknown>|undefined)?.code!=='te')issues.push('Expected Telugu master');
 for(const ex of (Array.isArray(input.exerciseInstances)?input.exerciseInstances:[]) as RecordData[]){if(['sourceSentenceId','sourceDialogueId','sourceListeningId'].filter(k=>typeof ex[k]==='string').length!==1)issues.push(`Exercise must have exactly one source: ${ex.id}`);if(!ex.requiresExplainedSource&&['A0','A1','A2'].includes(String(ex.level)))issues.push(`Missing explained source requirement: ${ex.id}`);}
 const expectedLevels=(Array.isArray(input.levels)?input.levels:[]).map(v=>object(v)?v.level:undefined);
 if(JSON.stringify(expectedLevels)!==JSON.stringify(levels))issues.push('Course must contain ordered A0-C2 checkpoints');
 const byId=new Map<string,RecordData>();for(const family of ['sentenceBank','dialogues','listeningScripts'])for(const r of (Array.isArray(input[family])?input[family]:[]) as RecordData[])byId.set(String(r.id),r);
 for(const ex of (Array.isArray(input.exerciseInstances)?input.exerciseInstances:[]) as RecordData[]){const source=byId.get(String(ex.sourceSentenceId??ex.sourceDialogueId??ex.sourceListeningId));if(source&&source.level!==ex.level)issues.push(`Exercise/source level mismatch: ${ex.id}`);}
 if(issues.length)throw new ContentValidationError(issues);return input as Master;
}

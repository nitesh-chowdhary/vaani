import type { ConceptMedia } from './types.js';

const VISUAL_TOPICS=['action','animal','body','clothing','colour','color','communication','emergency','family','food','health','home','number','object','people','place','quantity','shopping','study','transport','travel','work'];
const licenseUrl='https://unsplash.com/license';
const curated:Record<string,Pick<ConceptMedia,'url'|'query'|'attribution'>>={
 'te.lex.water':{url:'/media/telugu/beginner/water.jpg',query:'clear glass of drinking water',attribution:{creator:'manu schwendener',creatorUrl:'https://unsplash.com/@manuschwendener?utm_source=vaani&utm_medium=referral',sourceName:'Unsplash',sourceUrl:'https://unsplash.com/photos/zFEY4DP4h6c?utm_source=vaani&utm_medium=referral',licenseUrl}},
 'te.lex.tea':{url:'/media/telugu/beginner/tea.jpg',query:'single cup of tea',attribution:{creator:'Sixteen Miles Out',creatorUrl:'https://unsplash.com/@sixteenmilesout?utm_source=vaani&utm_medium=referral',sourceName:'Unsplash',sourceUrl:'https://unsplash.com/photos/lzQCA9sWpw0?utm_source=vaani&utm_medium=referral',licenseUrl}},
 'te.lex.coffee':{url:'/media/telugu/beginner/coffee.jpg',query:'single cup of coffee',attribution:{creator:'Ante Samarzija',creatorUrl:'https://unsplash.com/@antesamarzija?utm_source=vaani&utm_medium=referral',sourceName:'Unsplash',sourceUrl:'https://unsplash.com/photos/lsmu0rUhUOk?utm_source=vaani&utm_medium=referral',licenseUrl}},
 'te.lex.rice-food':{url:'/media/telugu/beginner/rice.jpg',query:'plain cooked rice in a bowl',attribution:{creator:'Pille R. Priske',creatorUrl:'https://unsplash.com/@pillepriske?utm_source=vaani&utm_medium=referral',sourceName:'Unsplash',sourceUrl:'https://unsplash.com/photos/xmuIgjuQG0M?utm_source=vaani&utm_medium=referral',licenseUrl}},
};

export function mediaForConcept(input:{id:string;topic?:string;english?:string;imageUrl?:string}):ConceptMedia|undefined {
 const topic=(input.topic??'').toLowerCase();
 const selected=curated[input.id];
 if(!selected&&!input.imageUrl&&!VISUAL_TOPICS.some(candidate=>topic.includes(candidate)))return undefined;
 const query=(selected?.query??[input.english,topic].filter(Boolean).join(' ')).trim();
 return {kind:'image',key:input.id,alt:`Photograph representing ${input.english??input.id}`,url:selected?.url??input.imageUrl,fallback:'/media/learning-image-placeholder.svg',query,source:selected?'local':input.imageUrl?'authored':'placeholder',...(selected?.attribution?{attribution:selected.attribution}:{})};
}

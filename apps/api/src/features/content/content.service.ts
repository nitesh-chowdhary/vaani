import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildCatalog, type Catalog } from '@vaani/learning-core';
export const masterPath=fileURLToPath(new URL('../../../../../VAANI_TELUGU_A0_C2_FINAL_MASTER.json',import.meta.url));
let cached:{catalog:Catalog;hash:string}|undefined;
export function loadContent(){if(!cached){const bytes=readFileSync(masterPath);cached={catalog:buildCatalog(JSON.parse(bytes.toString('utf8'))),hash:createHash('sha256').update(bytes).digest('hex')};}return cached;}

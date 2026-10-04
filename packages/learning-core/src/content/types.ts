export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export type RecordData = { [key: string]: Json };
export const levels = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type Level = (typeof levels)[number];
export type Meaning = Record<string, string>;
export type SourceRecord = RecordData & { id: string; level?: Level };
export interface Master extends RecordData {
  courseId: string;
  schemaVersion: string;
  title: string;
  lexicalConcepts: SourceRecord[];
  sentenceBank: SourceRecord[];
  exerciseInstances: SourceRecord[];
  dialogues: SourceRecord[];
  listeningScripts: SourceRecord[];
  srsPolicy: RecordData;
  sessionPolicy: RecordData;
  engineBinding: RecordData;
  masteryDimensions: string[];
  levelExitCapabilities: RecordData;
}
export interface Gloss {
  id: string;
  text: string;
  romanization: string;
  meaning: Meaning;
  kind: 'lexical' | 'chunk';
}
export interface ConceptMedia {
  kind: 'image';
  provider?: string;
  assetId?: string;
  width?: number;
  height?: number;
  resolutionStatus?: 'ready' | 'unavailable';
  resolvedAt?: number;
  key: string;
  alt: string;
  url?: string;
  fallback: string;
  query: string;
  source: 'authored' | 'local' | 'remote' | 'placeholder';
  presentation?: { fit: 'cover' | 'contain'; position?: string };
  intent?: {
    subject: string;
    category: 'object' | 'animal' | 'person' | 'action' | 'place';
    framing: string;
    isolated: boolean;
    allowPeople: boolean;
    exclude: string[];
  };
  attribution?: {
    creator: string;
    creatorUrl?: string;
    sourceName: string;
    sourceUrl: string;
    licenseUrl: string;
    licenseName?: string;
  };
}
export interface ContentItem {
  id: string;
  family: string;
  level: Level;
  telugu: string;
  romanization: string;
  meaning: Meaning;
  prompt: Meaning;
  context?: Gloss;
  glosses: Gloss[];
  dependencies: string[];
  acceptedAnswers: string[];
  acceptedMeanings?: Record<string, string[]>;
  register: string;
  reviewStatus: string;
  audio?: string;
  audioSpeed: string;
  productionReady: boolean;
  explicitInference: boolean;
  unseen: boolean;
  openResponse: boolean;
  media?: ConceptMedia;
  dependencyComplete: boolean;
  raw: SourceRecord;
}
export interface Catalog {
  master: Master;
  items: Record<string, ContentItem>;
  order: string[];
  sections: Record<string, Json>;
  counts: Record<string, number>;
  warnings: string[];
}
export function localized(meaning: Meaning, language = 'en'): string {
  return meaning[language] ?? meaning.en ?? '';
}
export function normalizeAnswer(value: string): string {
  return value
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

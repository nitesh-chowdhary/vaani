import type { Level } from '../content/types.js';
export const dimensions = [
  'meaning_recognition',
  'listening_recognition',
  'independent_recall',
  'spoken_production',
  'phrase_recall',
  'sentence_construction',
  'contextual_response',
  'delayed_recall',
  'transfer_to_unseen_context',
  'reading_recognition',
  'written_production',
] as const;
export type Dimension = (typeof dimensions)[number];
export type Evidence =
  | 'independent'
  | 'hesitant'
  | 'hinted'
  | 'incorrect'
  | 'relearned'
  | 'self_reported'
  | 'unverified';
export interface LearningEvent {
  id: string;
  sessionId: string;
  sequence: number;
  at: number;
  type:
    | 'concept_exposed'
    | 'activity_answered'
    | 'hint_used'
    | 'audio_played'
    | 'session_completed'
    | 'assessment_attempted'
    | 'assessment_reviewed'
    | 'activity_skipped'
    | 'speech_verification_pending';
  conceptId?: string;
  activityId?: string;
  dimension?: Dimension;
  evidence?: Evidence;
  latencyMs?: number;
  response?: string;
  inputMode?: 'text' | 'speech' | 'self';
  contextId?: string;
  level?: Level;
  capabilities?: string[];
  assessmentId?: string;
  verified?: boolean;
  unseen?: boolean;
  reviewPurpose?: 'due' | 'reinforcement';
  selfRating?: 'again' | 'good';
  speechVerificationPending?: boolean;
  memoryConceptIds?: string[];
  activityType?: string;
  evaluationSkill?:
    | 'comprehension'
    | 'listening'
    | 'speaking'
    | 'contextual_response'
    | 'reading'
    | 'writing';
}
export interface ConceptState {
  speechVerificationPending?: boolean;
  introducedAt: number;
  lastAt: number;
  dueAt: number;
  milestone: number;
  reinforcement: number;
  failures: number;
  attempts: number;
  dimensions: Partial<Record<Dimension, number>>;
  contexts: string[];
}
export interface LearnerState {
  concepts: Record<string, ConceptState>;
  events: LearningEvent[];
  level: Level;
  completedC2: boolean;
}

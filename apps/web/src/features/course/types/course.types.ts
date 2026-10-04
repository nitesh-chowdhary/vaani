import type {
  Activity,
  AnswerClassification,
  ConceptMedia,
  Gloss,
  Meaning,
} from '@vaani/learning-core';
export interface Target {
  id: string;
  family: string;
  level: string;
  telugu: string;
  romanization: string;
  meaning: Meaning;
  prompt: Meaning;
  context?: Gloss;
  glosses: Gloss[];
  media?: ConceptMedia;
  register: string;
  reviewStatus: string;
  openResponse: boolean;
  notes?: unknown;
  turns?: {
    speaker: string;
    telugu: string;
    romanization: string;
    meaning: Meaning;
  }[];
  questions?: Meaning[];
  rubric?: string[];
  gradingRule?: string;
}
export interface CoursePresentation {
  targetLanguage: {
    code: string;
    name: string;
    nativeName?: string;
    speechLocale: string;
    hasRomanization: boolean;
  };
  baseLanguage: { code: string; name: string };
}
export interface Session {
  id: string;
  status: 'active' | 'completed';
  version: number;
  cursor: number;
  total: number;
  allowance: number;
  level: string;
  presentation?: CoursePresentation;
  summary: {
    introduced: number;
    attempts: number;
    independent: number;
    speaking: number;
    listening: number;
    reviews: number;
    minutes: number;
  };
  activity:
    | (Activity & {
        target: Target | null;
        support?: { romanizationDefault: boolean };
        tiles?: { id: string; text: string }[];
        dialogueCues?: {
          speaker: string;
          telugu: string;
          romanization: string;
          meaning: Meaning;
        }[];
        learnerRole?: string | null;
        stimulus: { telugu: string; romanization: string } | null;
        mediaCue?: ConceptMedia | null;
        recallCue?: string | null;
        contextCue?: {
          meaning: string;
          meaningVisible?: boolean;
          text?: string;
          romanization?: string;
        } | null;
        choices?: Target[];
        audio: {
          text: string;
          language: string;
          speed: string;
          url: string | null;
        } | null;
        openResponse: boolean;
        canReveal: boolean;
        hinted: boolean;
      })
    | null;
}
export interface Progress {
  level: string;
  completedC2: boolean;
  introduced: number;
  lexicalIntroduced: number;
  due: number;
  weak: number;
  listening: number;
  speaking: number;
  delayedRetention: number;
  nextCheckpoint: string[];
  pendingAssessments: number;
}
export interface Course {
  id: string;
  title: string;
  baseLanguage: string;
  presentation?: CoursePresentation;
  preview?: Target[];
  progress: Progress;
  activeSession: Session | null;
}
export interface ActionResult {
  session: Session;
  feedback: string;
  target: Target | null;
  evidence?: string;
  classification?: AnswerClassification;
}

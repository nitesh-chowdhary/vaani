interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string; confidence?: number };
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
export interface SpeechProvider {
  available(): boolean;
  start(
    onText: (text: string) => void,
    onError: (message: string) => void,
    onEnd: () => void,
    language?: string,
  ): (cancel?: boolean) => void;
}
export const browserSpeech: SpeechProvider = {
  available() {
    const w = window as SpeechWindow;
    return !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
  },
  start(onText, onError, onEnd, language) {
    const w = window as SpeechWindow;
    const Constructor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Constructor) {
      onError('Voice input is not available here. Listen and repeat instead.');
      return () => {};
    }
    const recognition = new Constructor();
    recognition.lang = language ?? navigator.language;
    recognition.interimResults = false;
    recognition.continuous = false;
    let delivered = false;
    let failed = false;
    let cancelled = false;
    const reportMissingSpeech = () => {
      if (cancelled || delivered || failed) return;
      failed = true;
      onError("Couldn't quite catch that.");
    };
    recognition.onresult = (event) => {
      if (cancelled || delivered) return;
      const text = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0].transcript.trim())
        .filter(Boolean)
        .join(' ');
      if (!text) return;
      const confidence = Array.from(event.results).find(
        (result) => result.isFinal,
      )?.[0].confidence;
      if (confidence !== undefined && confidence > 0 && confidence < 0.5) {
        reportMissingSpeech();
        return;
      }
      delivered = true;
      onText(text);
    };
    recognition.onerror = () => {
      if (cancelled || delivered || failed) return;
      failed = true;
      onError("Couldn't quite catch that.");
    };
    recognition.onend = () => {
      if (cancelled) return;
      reportMissingSpeech();
      onEnd();
    };
    recognition.start();
    // Stop lets the browser deliver its final short-word result. Cancellation is
    // reserved for leaving/resetting an activity so stale results cannot submit.
    return (cancel = false) => {
      if (cancel) {
        cancelled = true;
        recognition.abort();
      } else {
        recognition.stop();
      }
    };
  },
};
// Native mobile clients can supply these interfaces without changing learning-core.
export interface PronunciationFeedbackProvider {
  assess(
    audio: Blob,
    target: string,
  ): Promise<{ feedback: string; confidence: number }>;
}

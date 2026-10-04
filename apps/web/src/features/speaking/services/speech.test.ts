import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserSpeech } from './speech';

class RecognitionMock {
  static current: RecognitionMock;
  lang = '';
  interimResults = false;
  continuous = false;
  onresult:
    | ((event: {
        results: {
          isFinal: boolean;
          0: { transcript: string; confidence?: number };
        }[];
      }) => void)
    | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  constructor() {
    RecognitionMock.current = this;
  }
  result(transcript: string, isFinal = true) {
    this.onresult?.({ results: [{ isFinal, 0: { transcript } }] });
  }
}

describe('short spoken targets', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: RecognitionMock,
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(window, 'SpeechRecognition');
  });

  function capture() {
    const onText = vi.fn();
    const onError = vi.fn();
    const onEnd = vi.fn();
    const stop = browserSpeech.start(onText, onError, onEnd, 'te-IN');
    return {
      onText,
      onError,
      onEnd,
      stop,
      recognition: RecognitionMock.current,
    };
  }

  it('finishes rather than aborting tea recording on manual stop', () => {
    const captureResult = capture();
    captureResult.stop();
    expect(captureResult.recognition.stop).toHaveBeenCalledOnce();
    expect(captureResult.recognition.abort).not.toHaveBeenCalled();
    captureResult.recognition.result(' టీ ');
    captureResult.recognition.onend?.();
    expect(captureResult.onText).toHaveBeenCalledExactlyOnceWith('టీ');
    expect(captureResult.onError).not.toHaveBeenCalled();
    expect(captureResult.recognition.lang).toBe('te-IN');
  });

  it('ignores empty/interim results and submits the final word once', () => {
    const result = capture();
    result.recognition.result('టీ', false);
    result.recognition.result(' ');
    expect(result.onText).not.toHaveBeenCalled();
    result.recognition.result('టీ');
    result.recognition.result('టీ');
    expect(result.onText).toHaveBeenCalledOnce();
  });

  it('offers retry when recognition ends without hearing a word', () => {
    const result = capture();
    result.recognition.onend?.();
    expect(result.onError).toHaveBeenCalledOnce();
    expect(result.onText).not.toHaveBeenCalled();
    expect(result.onEnd).toHaveBeenCalledOnce();
  });

  it('cancels stale results when leaving an activity', () => {
    const result = capture();
    result.stop(true);
    result.recognition.result('టీ');
    result.recognition.onend?.();
    expect(result.recognition.abort).toHaveBeenCalledOnce();
    expect(result.onText).not.toHaveBeenCalled();
    expect(result.onError).not.toHaveBeenCalled();
    expect(result.onEnd).not.toHaveBeenCalled();
  });

  it('does not report the same microphone failure twice', () => {
    const result = capture();
    result.recognition.onerror?.({ error: 'no-speech' });
    result.recognition.onend?.();
    expect(result.onError).toHaveBeenCalledOnce();
  });
  it('low-confidence recognition offers fallback rather than submitting a learner error', () => {
    const result = capture();
    result.recognition.onresult?.({
      results: [{ isFinal: true, 0: { transcript: 'టీ', confidence: 0.1 } }],
    });
    result.recognition.onend?.();
    expect(result.onText).not.toHaveBeenCalled();
    expect(result.onError).toHaveBeenCalledExactlyOnceWith(
      "Couldn't quite catch that.",
    );
  });
});

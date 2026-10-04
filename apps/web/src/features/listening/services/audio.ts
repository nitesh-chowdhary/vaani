export interface AudioRequest {
  text: string;
  language: string;
  url?: string | null;
  speed?: string;
}
export interface AudioProvider {
  play(request: AudioRequest, onStarted: () => void): Promise<void>;
  stop(): void;
}
let activeAudio: HTMLAudioElement | undefined;
export const browserAudio: AudioProvider = {
  async play(request, onStarted) {
    this.stop();
    if (request.url) {
      activeAudio = new Audio(request.url);
      activeAudio.onplaying = onStarted;
      await activeAudio.play();
      return;
    }
    if (!('speechSynthesis' in window))
      throw new Error('Audio playback is unavailable on this device.');
    const code = request.language.toLowerCase();
    const voice =
      window.speechSynthesis
        .getVoices()
        .find((v) => v.lang.toLowerCase() === code) ??
      window.speechSynthesis
        .getVoices()
        .find((v) => v.lang.toLowerCase().split('-')[0] === code.split('-')[0]);
    if (!voice)
      throw new Error(
        'Audio is not available on this device yet. You can keep practising with the text.',
      );
    const utterance = new SpeechSynthesisUtterance(request.text);
    utterance.lang = request.language;
    utterance.voice = voice;
    utterance.rate = request.speed === 'clear' ? 0.8 : 1;
    utterance.onstart = onStarted;
    window.speechSynthesis.speak(utterance);
  },
  stop() {
    activeAudio?.pause();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  },
};

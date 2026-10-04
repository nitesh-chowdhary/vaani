// Interface copy is independent of the authored course and learner's base language.
// English is the currently shipped interface; additional dictionaries can be added here.
const en = {
  listen: 'Listen',
  listenAgain: 'Listen again',
  slower: 'Slower',
  say: 'Say it',
  choose: 'Choose',
  build: 'Build the sentence',
  write: 'Write this in {language}',
  response: 'Your response',
  placeholder: 'Your answer',
  check: 'Check',
  help: 'Show answer',
  answer: 'Answer:',
  pronunciation: 'Show pronunciation',
  later: 'Practise later',
  meaning: 'Meaning',
  continue: 'Continue',
  retry: 'Try again',
  type: 'Type instead',
  repeat: 'Listen and repeat',
  said: 'I said it',
  listening: 'Listening…',
  processing: 'One moment…',
  stop: 'Stop recording',
  session: 'Your session',
  progress: 'Session progress',
  exit: 'Finish session',
  back: 'Back to course',
  play: 'Play {language} audio',
  playSlow: 'Play {language} audio slowly',
  speak: 'Speak {language}',
  reveal: 'Reveal meaning / romanization',
  words: 'Build with words',
};
export function learningCopy(_interfaceLanguage = 'en') {
  return en;
}
export const learningText = learningCopy();
export function languageLabel(template: string, language: string) {
  return template.replace('{language}', language);
}

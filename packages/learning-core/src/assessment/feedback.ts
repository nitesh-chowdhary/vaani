// Feedback copy is separate from evaluation rules; the current interface is English.
const en = {
  correct: 'Correct',
  incorrect: 'Try again',
  writingNear: 'Almost — check the spelling.',
  saved: 'Saved',
  repeat: 'Listen again',
  continue: 'Continue',
  say: 'Say it',
};
export function evaluationFeedback(_interfaceLanguage = 'en') {
  return en;
}

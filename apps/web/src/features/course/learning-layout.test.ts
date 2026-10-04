import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const learningCss = readFileSync(
  `${process.cwd()}/src/styles/learning.css`,
  'utf8',
);

let host: HTMLDivElement;
let stylesheet: HTMLStyleElement;
afterEach(() => {
  host?.remove();
  stylesheet?.remove();
});

function layout(className: string) {
  stylesheet = document.createElement('style');
  stylesheet.textContent = learningCss;
  document.head.append(stylesheet);
  host = document.createElement('div');
  host.className = 'learning-stage';
  const content = document.createElement('div');
  content.className = className;
  host.append(content);
  document.body.append(host);
  return content;
}

describe('photograph layout inside the session flex stage', () => {
  it.each(['concept-layout', 'choice-grid'])(
    '%s fills available width rather than collapsing around percentage-sized photographs',
    (className) => {
      const content = layout(className);
      expect(getComputedStyle(host).display).toBe('flex');
      expect(getComputedStyle(content).width).toBe('100%');
      expect(getComputedStyle(content).minWidth).toBe('0');
    },
  );

  it('anchors the photograph inside its reserved aspect-ratio frame', () => {
    const content = layout('concept-layout');
    const frame = document.createElement('div');
    frame.className = 'photo-frame';
    const image = document.createElement('img');
    frame.append(image);
    content.append(frame);
    expect(getComputedStyle(frame).position).toBe('relative');
    expect(getComputedStyle(frame).aspectRatio).toBe('3 / 2');
    expect(getComputedStyle(image).position).not.toBe('absolute');
    expect(getComputedStyle(image).aspectRatio).toBe('inherit');
    expect(getComputedStyle(image).width).toBe('100%');
    expect(getComputedStyle(image).height).toBe('auto');
  });
});

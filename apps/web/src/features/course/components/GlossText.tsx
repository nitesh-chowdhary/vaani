import { useId, useState } from 'react';
import {
  normalizeAnswer,
  type Gloss,
  type Meaning,
} from '@vaani/learning-core';
export function GlossText({
  text,
  meaning,
  romanization = '',
  glosses = [],
  language,
}: {
  text: string;
  meaning: Meaning;
  romanization?: string;
  glosses?: Gloss[];
  language: string;
}) {
  const [active, setActive] = useState<Gloss | null>(null);
  const tooltipId = useId();
  const fallback: Gloss = {
    id: 'context',
    text,
    meaning,
    romanization,
    kind: 'chunk',
  };
  return (
    <span
      className="relative block"
      onMouseLeave={() => setActive(null)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setActive(null);
      }}
    >
      {text.split(/(\s+)/).map((word, index) => {
        if (!word.trim()) return word;
        const gloss =
          glosses.find(
            (g) => normalizeAnswer(g.text) === normalizeAnswer(word),
          ) ?? fallback;
        return (
          <button
            key={index}
            type="button"
            className="gloss-word"
            onMouseEnter={() => setActive(gloss)}
            onFocus={() => setActive(gloss)}
            onClick={() => setActive(gloss)}
            aria-label={`Meaning of ${word}`}
            aria-expanded={active?.id === gloss.id}
            aria-describedby={active?.id === gloss.id ? tooltipId : undefined}
          >
            {word}
          </button>
        );
      })}
      {active && (
        <span
          id={tooltipId}
          role="tooltip"
          lang={language}
          dir="auto"
          className="gloss-popover"
        >
          <span className="block text-xs text-slate-400">
            {active.kind === 'chunk' ? 'Phrase meaning' : 'Word meaning'}
          </span>
          {active.meaning[language] ?? ''}
          {active.romanization && (
            <span className="mt-1 block text-slate-300">
              {active.romanization}
            </span>
          )}
          <button
            type="button"
            className="support-button"
            onClick={() => setActive(null)}
          >
            Close meaning
          </button>
        </span>
      )}
    </span>
  );
}

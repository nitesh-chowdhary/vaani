import { learningText } from '../../course/services/learning-copy';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LearningIcon } from '../../course/components/LearningIcon';
import type { CoursePresentation } from '../../course/types/course.types';

export function SessionProgress({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const value = total
    ? Math.min(100, Math.max(0, Math.round((completed / total) * 100)))
    : 0;
  return (
    <div
      className="session-progress"
      role="progressbar"
      aria-label={learningText.progress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

export function LearningShell({
  languages,
  completed = 0,
  total = 0,
  onExit,
  busy,
  children,
}: {
  languages: CoursePresentation;
  completed?: number;
  total?: number;
  onExit?: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="learning-page">
      <header className="learning-header">
        <Link className="vaani-brand" to="/app" aria-label={learningText.back}>
          <LearningIcon name="voice" />
          <span>Vaani</span>
        </Link>
        <span className="header-course">
          {languages.targetLanguage.name} <span>· {learningText.session}</span>
        </span>
        {onExit ? (
          <button
            type="button"
            className="icon-button"
            aria-label={learningText.exit}
            disabled={busy}
            onClick={onExit}
          >
            <LearningIcon name="close" />
          </button>
        ) : (
          <Link
            className="icon-button"
            aria-label={learningText.back}
            to="/app"
          >
            <LearningIcon name="close" />
          </Link>
        )}
      </header>
      <SessionProgress completed={completed} total={total} />
      <div className="learning-stage">{children}</div>
    </section>
  );
}

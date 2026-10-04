import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth';
import { ConceptMediaView } from '../components/ConceptMedia';
import { LearningButton } from '../components/LearningButton';
import { LearningIcon } from '../components/LearningIcon';
import { courseService } from '../services/course.service';
import { currentCoursePresentation } from '../services/presentation';
import type { Course } from '../types/course.types';

export function CourseHome() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => {
    setError('');
    void courseService
      .home()
      .then(setCourse)
      .catch(() =>
        setError('We could not load your course. Please try again.'),
      );
  };
  useEffect(() => {
    void courseService
      .home()
      .then(setCourse)
      .catch(() =>
        setError('We could not load your course. Please try again.'),
      );
  }, []);
  const languages = course?.presentation ?? currentCoursePresentation;
  const languageName = languages.targetLanguage.name;
  async function start() {
    setBusy(true);
    setError('');
    try {
      const session = await courseService.start();
      navigate(`/app/session/${session.id}`);
    } catch {
      setError('We could not start your session. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="course-home">
      <header className="course-header">
        <span className="vaani-brand">
          <LearningIcon name="voice" />
          <span>Vaani</span>
        </span>
        <div className="course-account">
          {user && <span className="course-email">{user.email}</span>}
          <LearningButton
            tone="quiet"
            onClick={() => void logout().catch(() => {})}
          >
            Log out
          </LearningButton>
        </div>
      </header>
      <div className="course-body">
        <p className="course-greeting">A little more familiar, every time.</p>
        <section className="course-hero">
          <div>
            <p className="eyebrow">Your language journey</p>
            <h1>{course?.title ?? `${languageName} Course`}</h1>
            <p className="course-description">
              Hear it. Understand it.
              <br />
              Make it yours.
            </p>
            <LearningButton
              disabled={busy || !course}
              onClick={() => void start()}
            >
              {busy ? 'Preparing…' : `Continue ${languageName}`}
              <LearningIcon name="arrow" />
            </LearningButton>
            <p className="course-time">
              About an hour. Stay for a little, or a little longer.
            </p>
          </div>
          <div
            className="course-mosaic"
            aria-label="Everyday moments in your course"
          >
            {course?.preview
              ?.slice(0, 3)
              .map(
                (target) =>
                  target.media && (
                    <ConceptMediaView key={target.id} media={target.media} />
                  ),
              )}
            {!course && (
              <div
                className="loading-photo"
                role="status"
                aria-label="Preparing your course"
              />
            )}
          </div>
        </section>
        {error && (
          <p role="alert" className="learning-notice">
            {error}
            <button
              type="button"
              className="support-button ml-3"
              onClick={load}
            >
              Retry
            </button>
          </p>
        )}
        {course && (
          <>
            <section
              className="course-overview"
              aria-label="Your learning at a glance"
            >
              <div className="overview-item">
                <LearningIcon name="leaf" />
                <div>
                  <strong>
                    {course.progress.lexicalIntroduced
                      ? `${course.progress.lexicalIntroduced} words made familiar`
                      : 'A fresh beginning'}
                  </strong>
                  <span>
                    {course.progress.lexicalIntroduced
                      ? 'One useful word at a time'
                      : 'No experience needed'}
                  </span>
                </div>
              </div>
              <div className="overview-item">
                <LearningIcon name="refresh" />
                <div>
                  <strong>
                    {course.progress.due
                      ? `${course.progress.due} ready to revisit`
                      : 'Ready when you are'}
                  </strong>
                  <span>
                    {course.progress.due
                      ? 'We’ll weave them into your session'
                      : 'Your next session is waiting'}
                  </span>
                </div>
              </div>
              <div className="overview-item">
                <LearningIcon name="headphones" />
                <div>
                  <strong>Listen. Recall. Speak.</strong>
                  <span>Small steps into real conversation</span>
                </div>
              </div>
            </section>
            <footer className="course-bottom">
              <p>One continuous course. Your own pace.</p>
              {course.progress.lexicalIntroduced > 0 && (
                <Link className="support-button" to="/app/checkpoint">
                  Speaking check-in
                  <LearningIcon name="arrow" />
                </Link>
              )}
            </footer>
          </>
        )}
      </div>
    </section>
  );
}

# Vaani Playwright testing

Run from the repository root:

```sh
npm ci
npx playwright install chromium
npm run test:e2e
npm run test:e2e:smoke
npm run test:e2e:ui
npm run typecheck:e2e
```

Playwright starts Vite on port 5187 and the real Express API on port 3187.
The API uses a disposable MongoDB process, creates real indexes, and imports
canonical course content. It never reads local database credentials or uses
personal learner data. Ports may be configured with `E2E_WEB_PORT` and
`E2E_API_PORT`. Reuse dedicated test servers only with `E2E_REUSE_SERVERS=1`;
leave this unset for automatic clean startup and teardown.

Both desktop (1280×800) and mobile (390×844) Chromium projects run a fresh
learner through signup, 30 generated activities, wrong/correct choices,
listening controls, synthetic target-language speech, generated sentence
construction, progress/reload, summary, logout/login, and another session.
Activities are read from actual API responses; answers come from canonical
content. No course/auth/session API is mocked. Pending-choice screenshots
briefly hold a real request before forwarding it unchanged. Selected/correct state measurements allow the intentional small scale treatment but fail material reflow; action-row movement is limited to 12px.

A second flow disables browser speech recognition and checks listen/repeat
self-assessment without default typing. Synthetic speech exercises the real
speech adapter callbacks and API evaluation, not actual microphone accuracy.
Real Telugu recognition, pronunciation and permission dialogs still need a
human microphone check. Typing is used only when generated intent is writing.
Unsupported interactions fail explicitly instead of being silently skipped.

Layout assertions check loaded photographic images, nonzero dimensions,
consistent choice geometry, restrained card scale changes, action-position
stability, viewport overflow, accessible names, primary touch targets,
keyboard selection, and feedback icons/states. Screenshots must also be
reviewed by a person: photographic semantics cannot be proven by metadata.

Screenshots and activity/modality JSON are attached to the HTML report.
Failures retain screenshots, trace and video under `test-results/e2e/`:

```sh
npx playwright show-report
npx playwright show-trace test-results/e2e/<test-directory>/trace.zip
```

Artifacts are ignored by Git. They contain disposable test-account network
traffic; do not run these flows against production accounts or publish traces
from real accounts. Console/page errors and unexpected API failures fail the
flow. The expected unauthenticated startup refresh 401 and Chromium's
`ERR_ABORTED` after an already received successful HTTP 204 (no response body)
are excluded; failed requests without a successful response are not excluded.

The first 30 activities currently generate choices, listening, speech and a
sentence builder, not explicit writing. The helper accepts typing only for
writing intent; a generated writing activity still needs a dedicated later
learner fixture. The existing coffee photo is artistic and merits editorial
review; these tests prove image loading/layout, not photographic relevance.

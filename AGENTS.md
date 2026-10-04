# Vaani — Architectural Decisions

## Project

- Name: Vaani
- Clean new project
- Feature-based architecture
- npm-workspaces monorepo

## Technology

Frontend:

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui

Backend:

- Node.js
- TypeScript
- Express

Database:

- MongoDB
- Mongoose

## Architecture

- Feature-based frontend
- Feature-based backend
- Pure `learning-core`, independent from React, Express, MongoDB, Mongoose, and browser APIs
- Language content outside application code
- Telugu is currently the only language being developed
- Architecture must remain extensible to future languages

## Development rule

We are defining the product incrementally. Authentication and the one continuous Telugu course are explicitly approved and implemented. Other product features remain in PLANNING.

Do not invent product requirements.
Do not implement major features unless explicitly instructed.
Do not infer requirements from folder names.
Future requirements will be added gradually.
When a future requirement changes an architectural decision, update `AGENTS.md`.

## Implemented authentication decisions

- API-first authentication at `/api/v1/auth`: signup, login, refresh, logout, and me.
- Signup/login use only email and password. User identity is separate from learner/course data.
- User and AuthSession Mongoose models live inside the auth feature.
- Normalize email by trimming and lowercasing; enforce uniqueness in MongoDB.
- Passwords use Argon2id; length is 8–128 characters without composition rules. Validation uses Zod.
- HS256 access tokens default to 15 minutes, verify issuer/audience/signature/expiration, and remain only in web memory.
- Opaque 256-bit refresh credentials use HMAC-SHA256 with a separate pepper; only hashes are persisted.
- Refresh uses atomic rotation, fixed 30-day default session expiry, and session revocation on recognized token replay. Multiple independent sessions are supported.
- Browser refresh cookies are HttpOnly, SameSite=Strict, scoped to `/api/v1/auth`, and Secure in production.
- Browser auth mutations require JSON, `X-Vaani-Client: 1`, and an explicit allowlisted Origin. Credentialed CORS never uses a wildcard.
- Native transport uses `X-Auth-Transport: native` with a JSON refresh credential; browser-cookie adaptation stays outside the shared auth service.
- Disabled users are rejected by login, refresh, and access-token middleware; middleware resolves current User identity on each authorized request.
- Helmet, configurable auth rate limits, bounded request bodies, no-store auth responses, stable errors, and no credential logging protect the API.
- Root npm commands cover both apps. Production secrets/configuration come from environment variables; local credential files are ignored and used only in development.
- Do not implement recovery, verification, social login, MFA, mobile apps, learner data, or course features without explicit approval.

## Auth presentation

The app uses a dark theme. Login and signup include an accessible eye button to show or hide the password; passwords remain hidden initially.

## Learner presentation

- One continuous course, with an immersive session UI and no gamification or Explore.
- Generic learning views consume target/base-language metadata and presentation adapters; authored Telugu fields and the canonical master JSON remain unchanged.
- New concepts are explained before testing. Meaning and romanization remain accessible; support is reduced only with demonstrated capability or when the activity requires recall.
- Concrete concepts use real licensed photographs, stable media selection, attribution, and graceful loading/error states. Images do not blink or disappear during audio playback.
- Free-text evaluation accepts authored alternatives and normalized equivalents, with conservative typo feedback. Internal evaluation and evidence terminology stays out of the learner UI.
- Sequencing, dependencies, learner events, SRS, mastery, and adaptive pacing stay outside React presentation components.

## Listening and speaking pedagogy

- Listening/comprehension, speech, and contextual communication lead the course; reading and writing develop separately as secondary skills.
- Activities carry explicit cue, response, skill, answer intent and spelling sensitivity. A shared pure selector chooses review modality independently of existing SRS timing.
- Routine vocabulary retrieval uses photographs, audio, authored context, target choices and speech rather than typed base-language translations.
- Spelling feedback belongs to explicit writing activities. Safe support-language typos do not weaken comprehension evidence.
- Browser speech defaults to an oral interaction with listen/repeat/self-check fallback; typed fallback and self-reports do not earn independent spoken evidence.
- Repeated oral failures rebuild explanation/recognition before retry. Generic interface copy is separate from pedagogical logic.

# Authentication Implementation

## Scope and architecture

Authentication is the first implemented Vaani product feature. Signup/login require only email and password. No learner data, demographics, profile fields, course logic, or Telugu content was implemented.

Auth owns its User/AuthSession models, password utility, validation, service, controllers, middleware, routes, types, and tests under `apps/api/src/features/auth`. Express composition, configuration, database startup, and error handling remain in app/infrastructure folders. The web auth feature owns forms, provider, hooks, protected route, pages, and auth service integration. The shared web API client remains reusable for future APIs. Other features and learning packages retain their placeholders.

## API endpoints

All endpoints are versioned JSON APIs at `/api/v1/auth`.

| Method | Endpoint   | Input                                        | Success                                     |
| ------ | ---------- | -------------------------------------------- | ------------------------------------------- |
| POST   | `/signup`  | `{ email, password }`                        | 201: sanitized user, accessToken, expiresIn |
| POST   | `/login`   | `{ email, password }`                        | 200: sanitized user, accessToken, expiresIn |
| POST   | `/refresh` | Browser cookie or native `{ refreshToken }`  | 200: refreshed auth state                   |
| POST   | `/logout`  | Browser cookie or native `{ refreshToken? }` | 204, idempotent revocation                  |
| GET    | `/me`      | `Authorization: Bearer <access token>`       | 200: `{ user }`                             |

Browser POSTs include `Content-Type: application/json`, `X-Vaani-Client: 1`, a trusted browser Origin, and credentials. `X-Auth-Transport: web` is explicit in the web client and is the API default. Empty browser refresh/logout bodies use `{}`.

Native clients explicitly send `X-Auth-Transport: native` and `X-Vaani-Client: 1`, use JSON, and omit browser Origins/cookies. Signup/login/refresh responses then include `refreshToken` and `refreshExpiresAt`. Native refresh/logout pass the credential in JSON. This transport adapter calls the same cookie-independent service. No mobile app or platform secure-storage implementation is included.

Sanitized users contain only `id`, `email`, `status`, and `createdAt`. No password/session hashes are returned. Auth responses use `Cache-Control: no-store`.

Errors use `{ "error": { "code": "...", "message": "..." } }`. Codes include `invalid_input`, `invalid_json`, `payload_too_large`, `account_unavailable`, `invalid_credentials`, `invalid_refresh`, `unauthorized`, `untrusted_origin`, `csrf_rejected`, `invalid_transport`, `rate_limited`, `not_found`, and `internal_error`. Unexpected errors never return stack traces or internal details.

## User schema

- `_id`: MongoDB ObjectId.
- `email`: trimmed, lowercased email, maximum 254 characters.
- `emailNormalized`: same normalization, required unique index.
- `passwordHash`: Argon2id encoded hash, excluded from normal queries.
- `emailVerifiedAt`: optional Date reserved for future work; no verification flow exists.
- `status`: `active` or `disabled`, defaults to `active`.
- `createdAt`, `updatedAt`: Mongoose timestamps.

Identity contains no learner/course state. Strict Zod payloads reject extra signup/login fields. Password policy is 8–128 characters without composition requirements. Input types, email format/length, JSON syntax, and payload size are validated centrally. Argon2id defaults are 19,456 KiB memory, two iterations, one parallel lane; configuration cannot reduce these below the chosen baseline. Login verifies a dummy hash for unknown accounts and returns the same failure for unknown emails, wrong passwords, and disabled users.

## AuthSession schema

- `_id`: internal ObjectId, encoded as the non-secret lookup prefix of an otherwise opaque refresh credential; clients never submit a separate session ID.
- `userId`: indexed reference to User.
- `refreshTokenHash`: required, unique HMAC-SHA256 digest; excluded from normal queries.
- `usedTokenHashes`: indexed array of prior credential digests, excluded from normal queries, for replay detection.
- `expiresAt`: absolute expiry with a TTL cleanup index.
- `lastUsedAt`: updated on successful refresh.
- `revokedAt`: optional revocation timestamp.
- `deviceLabel`: optional schema field; no device-management UI is implemented.
- `createdAt`, `updatedAt`: timestamps.

Only hashes are persisted. TTL cleanup is asynchronous, so the service independently rejects expired sessions. Multiple devices/logins have separate sessions.

## Tokens and rotation

Access tokens are HS256 JWTs with a configurable default lifetime of 900 seconds (15 minutes). Configuration bounds the lifetime to 60–900 seconds. Verification constrains algorithm, issuer (`vaani-api`), audience (`vaani-clients`), signature, and expiration. Auth middleware fetches current User identity, rejects disabled/deleted accounts, and attaches `req.auth.userId` plus the sanitized user. It loads no learner state.

Refresh credentials contain a random 256-bit secret and session lookup prefix. HMAC-SHA256 with a separate environment pepper hashes these high-entropy credentials; this is not password hashing. Sessions default to 2,592,000 seconds (30 days), with configurable 60-second to 90-day limits.

Refresh checks format, stored hash, revocation, absolute expiry, and user status. A conditional atomic MongoDB update replaces the current hash, retains the previous hash, and updates `lastUsedAt`. Exactly one concurrent presentation can rotate. Expiry never slides forward. Recognized old-credential replay revokes the affected session, including its latest token; random incorrect credentials cannot revoke someone else's session. Replay history is capped at 4,096 rotations, after which the session is revoked and login is required. This bounds document growth.

Logout revokes the matching current/previous credential's session and clears the browser cookie. Repeated logout, missing credentials, and malformed browser credentials are safe. Logout never requires a separate raw database ID.

## Web client and token storage

Routes are `/login`, `/signup`, and protected `/app`. The authenticated placeholder shows only signed-in email and logout. Forms use Tailwind and shadcn/ui-style Button/Input primitives, ask only email/password, and display validation/API errors.

Access tokens exist only in module memory. No access or refresh credentials are persisted in localStorage/sessionStorage. On startup, the provider refreshes through the cookie, then fetches `/me`. The browser never reads the refresh credential.

The `vaani_refresh` cookie is HttpOnly, SameSite=Strict, host-only (no Domain), scoped to `/api/v1/auth`, and expires at the session's fixed absolute expiry. It is Secure in production; HTTP development is supported locally. The production web/API must use HTTPS and same-site hosts. Arbitrary cross-site cookie deployment is not supported by this configuration.

The reusable API client attaches access tokens and sends credentialed requests automatically. A single in-flight refresh promise deduplicates refreshes within one tab. An authorized GET/HEAD that fails with 401 refreshes and retries once. POST/mutations are never automatically retried. Refresh failure or a second unauthorized response clears auth state and redirects protected navigation to login. Logout waits for pending rotation before revoking the latest cookie. Identity changes invalidate stale refresh results.

## CSRF, CORS, headers, and abuse controls

Browser auth mutations require an explicit allowlisted Origin, JSON content type, and `X-Vaani-Client: 1`. Forms cannot supply the custom header; cross-origin JavaScript must pass a preflight. Credentialed CORS accepts only configured explicit origins, methods, and headers. SameSite=Strict provides another layer. Switching to native transport cannot bypass browser Origin checks; native mode rejects any Origin or existing refresh cookie.

Production origin configuration requires HTTPS and rejects wildcard origins. Helmet supplies API security headers. JSON bodies are limited to 16 KiB. Generated request IDs are returned as `X-Request-Id`.

Signup/login share an IP limit of 50 attempts per 15 minutes; refresh permits 120 attempts per 15 minutes. Limits/window are configurable. Trusted proxy hop count defaults to zero and must match the deployment's exact trusted proxy layout. Rate-limit errors use the API error envelope.

The API logs no request bodies, headers, user emails, passwords, tokens, hashes, or serialized internal errors. Startup failures are reported generically to avoid exposing database connection details. No request logger was added.

## Environment variables

`.env.example` lists placeholders only; no real `.env` was created.

| Variable                    | Purpose/default                                                         |
| --------------------------- | ----------------------------------------------------------------------- |
| `NODE_ENV`                  | development/test/production                                             |
| `API_PORT`                  | API port, 3000                                                          |
| `MONGODB_URI`               | Database connection URI                                                 |
| `ACCESS_TOKEN_SECRET`       | Required independent random signing secret, at least 32 characters      |
| `REFRESH_TOKEN_PEPPER`      | Required distinct random refresh hashing secret, at least 32 characters |
| `ACCESS_TOKEN_TTL_SECONDS`  | 900                                                                     |
| `REFRESH_TOKEN_TTL_SECONDS` | 2592000                                                                 |
| `WEB_ORIGINS`               | Comma-separated explicit browser origin allowlist                       |
| `ARGON2_MEMORY_KIB`         | 19456                                                                   |
| `ARGON2_TIME_COST`          | 2                                                                       |
| `ARGON2_PARALLELISM`        | 1                                                                       |
| `AUTH_RATE_WINDOW_MS`       | 900000                                                                  |
| `AUTH_RATE_MAX`             | 50 shared signup/login attempts                                         |
| `REFRESH_RATE_MAX`          | 120 refresh attempts                                                    |
| `TRUST_PROXY_HOPS`          | 0; configure only for known proxies                                     |
| `VITE_API_BASE_URL`         | Web build configuration; defaults to `http://localhost:3000/api/v1`     |

Root `npm run dev` starts both apps and reads a root `.env` only if the developer creates one. Exported variables take precedence. Development only may read ignored `creds.md`/`cred.md`, including dash-separated username/password lines, and select database `vaani`. If omitted, local MongoDB is the fallback. Development may generate process-lifetime signing secrets/pepper; use configured stable random secrets to preserve sessions across API restarts. Production/test never read local credential files or generate fallback secrets. Production rejects example placeholder secrets.

The supplied `cred.md` connection was verified with a read-only MongoDB ping after correcting its dash-separated field parsing. Credentials are ignored by Git and formatting tools and never copied into this document. Tests do not use this database.

## Dependencies and files

API runtime dependencies: Express, Mongoose, Argon2, jose, Zod, cookie-parser, cors, Helmet, express-rate-limit, dotenv. Web runtime dependencies: React/React DOM, React Router, Zod, Radix Slot, class-variance-authority, clsx, tailwind-merge. Vite, Tailwind's Vite integration, TypeScript, tsx, Vitest, Supertest, mongodb-memory-server, jsdom, Testing Library, ESLint, typescript-eslint, React Hooks lint rules, Prettier, and type declarations provide development/testing support. Exact installed versions are pinned by `package-lock.json`.

Created/updated code covers auth feature directories, web UI primitives/API client, app entrypoints, API infrastructure configuration/database/errors, and build/test configs. Root package scripts, `dev.mjs`, `.env.example`, ignore/format/lint settings, TypeScript config, lockfile, README, AGENTS, PRODUCT_SPEC, ARCHITECTURE, and this report document the implementation. Learning-core, shared packages, and unrelated features remain placeholder code. The initial repository-wide formatter also normalized whitespace in the user-supplied `telugu_course_master.json`; no course data was added or changed semantically. That reference file is now excluded from formatting.

## Validation

Run all commands from the repository root:

- `npm test`: backend integration/service tests plus frontend tests.
- `npm run typecheck`: both apps.
- `npm run lint`: apps, packages, and root launcher/config.
- `npm run format:check`: repository formatting, excluding credentials/reference content.
- `npm run build`: API compilation and Vite production build.
- `npm run check`: all of the above in sequence.

API tests use real Mongoose models and a temporary isolated MongoDB server. They cover normalization/unique-index races, input validation, Argon2 storage, sanitized responses, generic login failures, disabled accounts, independent sessions, atomic rotation/replay, malformed/expired/revoked credentials, idempotent logout, token claims, native/service transport independence, cookie attributes, CSRF/CORS, security headers, rate limits, logging safety, and local configuration parsing.

Frontend tests cover both forms, successful signup/login, generic errors, protected-route restoration, logout, StrictMode bootstrap, refresh success/failure, token attachment, one-time safe retry, refresh deduplication, stale-result rejection, logout/rotation ordering, and absence of browser token persistence.

Final root `npm run check` passed on 2026-10-03:

| Check                                   | Result                                |
| --------------------------------------- | ------------------------------------- |
| API integration/service/security tests  | 47 passed                             |
| Frontend form/provider/API-client tests | 24 passed                             |
| TypeScript typecheck                    | API and web passed                    |
| ESLint                                  | Passed                                |
| Prettier formatting check               | Passed                                |
| Production builds                       | API compilation and Vite build passed |
| Supplied MongoDB credentials            | Read-only connection/ping passed      |

Vite emitted non-failing Rollup annotation warnings from the installed Zod dependency. The build completed successfully. Temporary MongoDB tests required local-port access outside the managed sandbox.

## Known limitations

- Password recovery, email verification, social login, MFA, admin/device UI, logout-all, and mobile apps are intentionally absent.
- Duplicate signup returns 409 and can reveal account availability; login failures remain generic.
- Logout revokes refresh authentication, not already-issued access tokens. Those expire within the configured short TTL; disabled users are rejected immediately by database-backed middleware.
- Concurrent refreshes across separate browser tabs may trigger strict replay revocation. Deduplication is currently within one tab; cross-tab coordination is not implemented.
- Rate limits use process-local memory. A multi-instance deployment needs a shared rate-limit store and correct proxy configuration.
- Failed network logout clears local memory but cannot guarantee server revocation/cookie deletion; the session may be restorable until expiry or a later successful logout.
- Signup User creation and session creation are not a multi-document transaction. If session persistence fails, the account may exist and login can establish a new session.
- Temporary development secrets invalidate sessions after restart unless stable secrets are configured.
- Database index creation runs at startup; deployment must grant appropriate permissions or provision equivalent indexes beforehand.
- Automated frontend tests use jsdom, not a full browser end-to-end suite. Production deployment/TLS is not part of this task.

## Auth presentation

The app uses a dark theme. Login and signup include an accessible eye button to show or hide the password; passwords remain hidden initially.

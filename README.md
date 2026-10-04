# Vaani

Feature-based npm-workspaces monorepo. Authentication is the first implemented feature; other product requirements remain in planning. Read `AGENTS.md` before modifying the project.

## Run from the repository root

Requires Node.js 22+ and npm. Install dependencies with `npm install` (or `npm ci` with the committed lockfile).

| Command                               | Scope                                                       |
| ------------------------------------- | ----------------------------------------------------------- |
| `npm run dev`                         | Starts both API and web; stopping it stops both             |
| `npm test`                            | API integration/service tests and frontend tests            |
| `npm run typecheck`                   | Both apps                                                   |
| `npm run lint`                        | Both apps and packages                                      |
| `npm run format:check`                | Repository formatting                                       |
| `npm run format`                      | Formats repository files                                    |
| `npm run build`                       | API TypeScript output and web production build              |
| `npm run check`                       | Typecheck, lint, formatting check, tests, production builds |
| `npm run dev:api` / `npm run dev:web` | Optional individual development processes                   |

Web: `http://localhost:5173`. API: `http://localhost:3000/api/v1`.

Configuration is documented in `.env.example`. No real `.env` is included. Export environment variables to override defaults. The root dev launcher also loads a local root `.env` if you choose to create one yourself.

Local development reads the ignored root `creds.md` or `cred.md` when `MONGODB_URI` is absent. It accepts a MongoDB URI plus separate `username` and `password` lines, replaces URI credentials safely, and selects the `vaani` database. Without a credential file, it uses a local MongoDB instance. Never commit credential files. Local development generates temporary secrets if no signing secret/refresh pepper is configured; restarting the API then invalidates existing auth. Configure stable, independent random secrets to preserve sessions across restarts. Production has no credential-file fallback or generated secrets and requires explicit configuration.

The API fails safely if MongoDB is inaccessible or rejects credentials. The first integration test run may download a MongoDB binary. Tests use an isolated temporary MongoDB instance and never the supplied cloud database.

## Structure

- `apps/web`: React, TypeScript, Vite, Tailwind CSS, shadcn/ui primitives.
- `apps/api`: Node.js, TypeScript, Express; MongoDB through Mongoose.
- `packages/learning-core`: reserved for pure TypeScript learning logic, independent of UI, server, database, and browser APIs.
- `packages/shared`, `packages/test-utils`: placeholders.
- `content/te`: empty Telugu content folders outside application code.

See `docs/AUTH_IMPLEMENTATION.md` for API usage, security decisions, tests, and limitations. No course or learning features are implemented.

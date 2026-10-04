# Architecture

This specification is being defined incrementally. Do not infer requirements that have not yet been explicitly approved.

## Repository

npm workspaces cover `apps/*` and `packages/*`. Frontend and backend use feature-based architecture. `learning-core` remains an empty, pure-TypeScript package independent of React, Express, MongoDB, Mongoose, and browser APIs. Language content remains outside application code; only empty Telugu folders exist.

## Authentication

`apps/api/src/features/auth` owns models, validation, password hashing, token/session business logic, transport controllers, routes, middleware, types, and tests. App/infrastructure folders own Express composition, MongoDB startup, configuration, and centralized API errors. No global controller/service/model/route collection was introduced.

The User model stores identity and account status only. AuthSession stores user identity, hashed refresh credentials, absolute expiry, use timestamps, and revocation; rotated hashes are retained for replay detection. No learner/course state is attached to either model.

All clients use `/api/v1/auth`. The service issues short-lived access tokens and rotating opaque refresh credentials independently of Express/cookies. Web controllers set an HttpOnly cookie and omit the refresh credential from JSON. Explicit native transport receives/presents a JSON credential for eventual secure platform storage. It does not accept browser Origins or cookies.

The web auth feature owns forms, auth state, protected routes, and auth service calls. A reusable API client owns bearer-header attachment, credentialed requests, one shared refresh attempt, safe one-time GET/HEAD retry, and auth failure notification. Tokens have no localStorage/sessionStorage persistence. Tailwind and shadcn/ui-style Button/Input primitives provide minimal UI.

Browser mutation requests require an allowlisted Origin, JSON, and a custom header. SameSite=Strict is defense in depth; credentialed CORS uses explicit origins. Production browser deployment must use HTTPS and same-site web/API hosts. Helmet and configurable per-IP rate limits protect requests; credentials and personal data are not logged.

Access middleware verifies token claims and resolves current account status from MongoDB, attaching a small `req.auth` identity context. Disabled accounts are immediately rejected. Logout revokes refresh authentication; previously issued access tokens remain valid until their short expiry unless the account becomes disabled.

Full operational details and limitations are in `AUTH_IMPLEMENTATION.md`.

# Product Specification

This specification is being defined incrementally. Do not infer requirements that have not yet been explicitly approved.

## Authentication

Signup and login require only email and password. Authentication identifies the user; it stores no names, demographics, preferences, language levels, or course state.

The versioned JSON API supports signup, login, refresh, logout, and current-user identity. Successful signup/login creates a session. Refresh rotates its credential. Logout revokes that session and clears the browser cookie. Multiple sessions can coexist. Disabled accounts cannot log in, refresh, or authorize requests.

The web client provides `/signup`, `/login`, and an authenticated `/app` placeholder containing only the signed-in email and logout button. Protected navigation restores a session through refresh and current-user fetch. Errors are displayed without disclosing login account existence.

Passwords are 8–128 characters with no arbitrary composition requirements. Browser access tokens remain in memory; refresh credentials are HttpOnly cookies. The same auth service supports a JSON credential transport for future native clients; no mobile app is implemented.

Email verification, password recovery, social login, MFA, onboarding, course logic, and all other product features remain undefined and unimplemented.

## Auth presentation

The app uses a dark theme. Login and signup include an accessible eye button to show or hide the password; passwords remain hidden initially.

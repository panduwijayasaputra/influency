# US-006: Log In with Telegram

**Status:** backlog
**Priority:** high
**Feature:** telegram-auth

## Description

As a visitor, I want to log in with my Telegram account, so that I can buy Koin and access premium content without creating a new password.

## Acceptance Criteria

- [ ] Clicking "Login with Telegram" starts an OIDC Authorization Code + PKCE (S256) flow with `state` and `nonce` bound to the login attempt
- [ ] The callback exchanges the code on the server and rejects ID tokens with an invalid signature, wrong issuer, wrong audience, expired token, or mismatched/replayed `state` or `nonce`
- [ ] A first-time login creates a user identified by `(provider, provider_sub)`; a returning user is matched by the same pair, never by username
- [ ] The Telegram client secret and ID token are never sent to the browser
- [ ] A failed or cancelled login shows a friendly error and creates no session

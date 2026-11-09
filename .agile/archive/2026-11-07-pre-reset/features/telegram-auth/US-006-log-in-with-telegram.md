# US-006: Log In with Telegram

**Status:** ready_for_uat
**Priority:** high
**Feature:** telegram-auth

## Description

As a visitor, I want to log in with my Telegram account, so that I can buy Koin and access premium content without creating a new password.

## Acceptance Criteria

- [x] Clicking "Login with Telegram" starts an OIDC Authorization Code + PKCE (S256) flow with `state` and `nonce` bound to the login attempt
- [x] The callback exchanges the code on the server and rejects ID tokens with an invalid signature, wrong issuer, wrong audience, expired token, or mismatched/replayed `state` or `nonce`
- [x] A first-time login creates a user identified by `(provider, provider_sub)`; a returning user is matched by the same pair, never by username
- [x] The Telegram client secret and ID token are never sent to the browser
- [x] A failed or cancelled login shows a friendly error and creates no session

## Tasks

### TASK-015: Auth schema, env config and dependencies
**Status:** done

### TASK-016: TelegramOidcClient (authorization URL, code exchange, ID token verification)
**Status:** done

### TASK-017: Auth module: start and callback endpoints, user and identity, session cookie
**Status:** done

### TASK-018: Web: API proxy and /login page
**Status:** done

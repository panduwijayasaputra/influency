# Feature: App Foundation (Light Social)

**Slug:** app-foundation
**Handoff phase:** Cross-cutting UI over Phase 2 (public route + auth). This is the first feature after the backlog reset on 2026-11-07. See [roadmap.md](../../roadmap.md).

## Overview

This feature lays down the visual and navigation foundation that every later feature builds on:

- Light Social coral tokens
- shared Bottom Sheet and Toast
- the app shell with a 4-tab bottom nav
- the Home top bar
- the right account drawer
- the Login landing
- the guest access rules in the shell

There are no backend stories in this feature. Auth (`/auth/me`, logout, OIDC, returnTo) already exists. The drawer's Koin balance stays dummy until `koin-wallet`.

## Sources

- [design/HANDOFF.md](../../../design/HANDOFF.md) gives the tokens, the bottom nav, the Home-only top bar with hide-on-scroll-down, and the drawer.
- [design/artboards/System.dc.html](../../../design/artboards/System.dc.html) gives the type scale, controls and component map.
- [design/artboards/Login.dc.html](../../../design/artboards/Login.dc.html) is the Login landing.
- [design/artboards/S08-Account-Drawer.dc.html](../../../design/artboards/S08-Account-Drawer.dc.html) and the drawer in [Home.dc.html](../../../design/artboards/Home.dc.html) show the drawer.

The `.dc.html` files are reference only. Never copy them into the app.

## Decisions

- Copy is in Bahasa Indonesia, using the labels in [roadmap.md](../../roadmap.md).
- Existing code is restyled or replaced in place and its API wiring is kept. This includes the uncommitted Dark Social pass: `bottom-nav`, `account-menu`, `site-header`, `purchase-sheet`, `koin`, and the discover/library/wallet/subscriptions placeholders.
- Pages that don't exist yet show a "Segera hadir" placeholder until their feature lands.
- New reserved slugs: `me` and `notifications`.

## Stories

| ID | Title | Priority |
|---|---|---|
| US-001 | Light Social Design Tokens | high |
| US-002 | Bottom Sheet & Toast | high |
| US-003 | App Shell & 4-Tab Bottom Nav | high |
| US-004 | Home Top Bar | high |
| US-005 | Right Account Drawer | high |
| US-006 | Login Landing | high |
| US-007 | Guest Access Rules in the Shell | medium |

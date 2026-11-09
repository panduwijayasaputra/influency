# Feature: Post Unlocks & Creator Subscriptions

**Slug:** content-purchases
**Handoff phase:** Phase 4 — Coin wallet and purchase engine

## Overview

Users spend Koin on per-post timed unlocks or creator-wide subscriptions (manual renewal only). Every purchase atomically debits Koin, grants access and records creator revenue with a commission snapshot.

## ⚠ Rewrite before planning (Monetization Spec v1, LOCKED)

Stories below predate the spec. Before `/tech-lead`, rewrite them to match:
- Per-post unlock is permanent (no duration/expiry); price 5–1,000 Koin; duplicate purchase returns the existing entitlement.
- Exactly one subscription plan per creator, price 10–5,000 Koin, fixed 30×24h (creator does not pick duration).
- Early renewal = one scheduled period starting at the current `endsAt` (max one); cancelling it before start refunds 100% Koin once.
- Commission LOCKED: premium 20%, subscription 15%; tips (new, 1–1,000 Koin, 0% fee, eligibility rules §6).
- Archive access rules live in US-050.

## Stories

- US-025: Unlock a Premium Post with Koin (high)
- US-026: Creator Subscription Plans (high)
- US-027: Subscribe to a Creator (high)
- US-028: Manual Renewal & Expiry (high)
- US-029: My Library & Subscriptions (medium)
- US-030: Revenue Allocation on Purchase (high)

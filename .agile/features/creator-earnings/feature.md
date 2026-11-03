# Feature: Creator Earnings & Payouts

**Slug:** creator-earnings
**Handoff phase:** Phase 6 — Creator earnings, admin and payout simulation

## Overview

Creators see their earnings by state and request payouts. Payouts are a manual/simulated admin workflow — no real bank transfers in the MVP. Payout rules (minimums, fees, KYC) are TBD.

## ⚠ Rewrite before planning (Monetization Spec v1, LOCKED)

- Earnings in IDR; 14-day pending (scheduled renewals: from period start); stages PENDING → AVAILABLE → RESERVED_FOR_PAYOUT → PAID_OUT.
- Minimum withdrawal Rp100,000; manual payouts on business-day Fridays; actual transfer cost borne by creator, shown before confirming.
- Chargeback liability, 7-day appeal and up-to-100% offset of newly matured earnings (§10) need new stories.

## Stories

- US-037: Creator Earnings Dashboard (high)
- US-038: Request a Payout (medium)
- US-039: Admin Processes Payouts (Simulated) (medium)

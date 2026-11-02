# INFLUENCY — MASTER CONTEXT & MVP ENGINEERING HANDOFF

> **Untuk:** Claude / AI coding agent / engineering team  
> **Tanggal konteks:** 2 November 2026  
> **Versi:** 1.0 — Web-first + Telegram OIDC + Midtrans Sandbox  
> **Status:** Product architecture locked; development not yet started  
> **Bahasa:** Bahasa Indonesia, dengan nama API, kode, dan istilah engineering berbahasa Inggris.

---

## 0. CARA CLAUDE HARUS MEMBACA DOKUMEN INI

Dokumen ini adalah **single source of context** untuk pembangunan MVP **Influency**. Gunakan sebagai product brief, PRD awal, software architecture, implementation contract, dan acceptance criteria. Pengguna telah berdiskusi panjang tentang Telegram Mini App, creator page, subscription, Koin, dan payment gateway. **Keputusan terbaru menggantikan ide sebelumnya.** Jangan mengimplementasikan alternatif lama hanya karena pernah muncul dalam diskusi.

**Instruksi kepada Claude:**

1. Baca seluruh dokumen terlebih dahulu sebelum membuat scaffold atau menulis kode.
2. Bedakan **[LOCKED]** (diputuskan user), **[RECOMMENDED]** (pilihan engineering yang dapat dievaluasi), **[TBD]** (keputusan bisnis belum dibuat), dan **[BLOCKER FOR LIVE]** (butuh verifikasi sebelum menerima uang sungguhan).
3. Jangan menganggap adanya repository atau source code existing. Periksa workspace aktual terlebih dahulu.
4. Implementasikan incrementally, milestone demi milestone; mulai dari vertical slice terkecil, jangan sekaligus seluruh proyek tanpa test.
5. Semua operasi pembayaran, wallet, subscription, dan payout harus server-authoritative, transaksional, idempotent, dan dapat diaudit.
6. Gunakan **Midtrans Sandbox** untuk pengembangan. Jangan melakukan pembayaran live, transfer payout riil, atau mengganti production keys tanpa izin eksplisit pengguna.
7. Jika detail API/provider berbeda dari informasi di sini, ikuti dokumentasi resmi terkini, catat perbedaannya, dan jangan mengarang endpoint atau field.
8. Jangan menebak kebijakan bisnis kritis (komisi final, harga Koin final, refund, verifikasi umur, dan metode payout). Gunakan placeholder/config yang jelas sambil tetap membangun MVP fungsional.
9. Hindari overengineering: monorepo + modular monolith cukup. Tidak perlu Kubernetes, Kafka, atau microservices untuk MVP.
10. Saat mulai implementasi, sampaikan plan ringkas, daftar asumsi, dan pilih task pertama. Setiap milestone harus memiliki bukti test dan instruksi menjalankan project.

---

## 1. EXECUTIVE SUMMARY

**Influency** adalah platform web independen untuk monetisasi konten dari banyak creator. Creator memiliki halaman profil masing-masing, misalnya:

- `https://influency.com/claudiandreya`
- `https://influency.com/creatorlain`

Creator dapat menerbitkan:

1. **Free content:** seluruh pengunjung yang memenuhi kebijakan akses dapat melihat tanpa Koin.
2. **Paid content (post unlock):** satu posting diakses dengan harga Koin dan durasi yang ditetapkan creator. Contoh: **5 Koin untuk 7 hari**.
3. **Creator subscription (account-wide):** pelanggan membayar Koin untuk akses **seluruh konten premium** milik creator tersebut selama durasi paket. Contoh: **30 Koin untuk 30 hari**.

Pengguna membeli **paket prepaid Koin** dengan uang rupiah melalui **payment gateway Midtrans Sandbox** pada tahap MVP. Koin disimpan dalam wallet internal Influency. Semua pembayaran diterima oleh **Influency**, bukan langsung oleh creator. Ketika Koin dipakai untuk konten/subscription, Influency menghitung porsi pendapatan creator dan komisi platform dalam revenue ledger. Creator dapat melihat earnings dan kelak meminta payout.

Identitas user/creator menggunakan **Telegram Login berbasis OIDC** di website. Influency memiliki **satu bot Telegram resmi** untuk notifikasi kepada pengguna yang telah memberikan izin. **Tidak ada bot Telegram per creator** dan **tidak ada Telegram Mini App sebagai runtime atau checkout utama dalam MVP.**

### 1.1 Ringkasan keputusan [LOCKED]

| Area | Keputusan |
|---|---|
| Product | Influency, independent web-first creator subscription platform |
| Platform | Browser web (termasuk browser di Instagram/TikTok bila kompatibel) |
| Creator URL | `influency.com/{creator_slug}` |
| Multi-tenancy | Banyak creator dalam satu aplikasi/backend/database |
| Bot | Tepat satu bot resmi Influency; tidak ada creator-owned bot |
| Login | Telegram Login / OpenID Connect (OIDC) untuk user dan creator |
| User roles | Subscriber/user dan creator memakai akun dasar sama; admin punya role tambahan |
| Checkout | External payment gateway; untuk MVP **Midtrans Sandbox (Snap)** |
| Koin | Internal prepaid platform credits; digunakan untuk unlock/subscription |
| Content | Free post, premium post, creator-wide subscription |
| Pricing | Creator menentukan harga Koin dan periode akses dalam batas sistem |
| Subscription | Manual renewal untuk MVP; **bukan automatic charge ke payment gateway** |
| Payment receiver | Influency centralized merchant account |
| Creator commission | Influency mengambil komisi; creator earnings dicatat internal |
| Storage | Storage terpisah dari Telegram; private image/video delivery |
| Notifications | Telegram bot jika pengguna mengizinkan pesan |
| MVP testing | Payment Gateway Sandbox; no real-money transactions |

### 1.2 Superseded / JANGAN diimplementasikan

- ~~Telegram Mini App sebagai aplikasi utama.~~
- ~~Telegram Stars sebagai payment system utama.~~
- ~~Lynk.id sebagai penyedia checkout MVP.~~ (dipertimbangkan sementara lalu dibatalkan)
- ~~QRIS langsung dalam Telegram Mini App.~~
- ~~Satu Telegram Bot untuk tiap creator / creator input bot token.~~
- ~~Telegram Channel sebagai tempat utama menyimpan atau streaming konten.~~
- ~~Pengunjung Instagram Bio harus dibawa ke Telegram sebelum melihat profil creator.~~

**Kesimpulan:** Instagram Bio → website Influency → login Telegram bila perlu → top-up melalui Midtrans Sandbox → belanjakan Koin → akses konten.

---

## 2. TUJUAN PRODUK, PENGGUNA, DAN SCOPE MVP

### 2.1 Product goals

- Memberi creator sebuah landing/profile URL dengan feed dan monetisasi konten tanpa membuat website sendiri.
- Menurunkan friksi pengunjung sosial media (klik link bio langsung buka web).
- Memberi pengguna satu saldo Koin yang dapat dipakai pada banyak creator.
- Mendukung penjualan akses per post dengan masa berlaku dan subscription seluruh konten per creator.
- Memisahkan uang masuk, kewajiban Koin user, komisi platform, dan hak pembayaran kepada creator secara akuntabel.
- Membangun fondasi platform berkelanjutan, bukan sekadar contoh tampilan.

### 2.2 Personas

**Visitor (anonymous):** klik link dari Instagram/TikTok, lihat profil creator dan konten free/preview yang memang publik. Tidak boleh melihat media premium asli.

**Subscriber (logged-in user):** login via Telegram, top-up Koin, melihat saldo dan riwayat, unlock konten, subscribe creator, melihat akses yang aktif/berakhir, menerima notifikasi opt-in.

**Creator (approved user):** seluruh kemampuan subscriber + profil, pengaturan slug, membuat/mengubah posting, upload media, membuat offer harga/durasi, mengelola paket account-wide, melihat transaksi/earnings, mengajukan payout (di MVP bisa simulasi/manual).

**Admin (authorized):** memverifikasi creator, mengelola moderasi konten, katalog paket Koin, pengaturan komisi, laporan transaksi, penanganan refund/dispute, approval payout, operasi platform.

### 2.3 MVP must-have

- Website responsif mobile-first dan URL creator publik.
- Telegram OIDC login, secure session, user auto-provisioning, login return-to-URL.
- User profile + creator application/approval (approval sederhana via admin).
- Creator profile + unique slug + free/premium feed.
- Upload gambar dan setidaknya satu format media; video storage/processing dapat dibuat via adapter dengan target integrasi Cloudflare Stream.
- Private content entitlement dan akses file aman.
- Paket prepaid Koin, wallet balance, ledger dan top-up order.
- Midtrans Snap Sandbox, webhook verification, sandbox simulator, retry/reconciliation.
- Unlock per post menggunakan Koin, durasi tertentu.
- Subscription semua premium posts dari satu creator menggunakan Koin, manual renewal.
- Revenue allocation internal + admin/creator earnings dashboard sederhana.
- Telegram bot notifikasi minimal top-up success (untuk user yang mengizinkan).
- Basic content moderation and reporting policy, transaction audit, structured logs, unit/integration/e2e tests.

### 2.4 Not in MVP

- Mobile Android/iOS native wrapper.
- Telegram Mini App runtime.
- Native Telegram Stars checkout.
- Native recurring payment / automatic deduction Koin tanpa consent.
- Multi-currency, international payout, crypto/NFT/TON, transfer Koin antaruser.
- Multi-gateway failover; provider abstraction boleh dipersiapkan tetapi satu implementasi cukup.
- Live streaming, live chat, group messaging, fan tips, creator discovery recommendation algorithm.
- Advanced affiliate/referral, tipping, multi-level subscription tiers, geoblocking advanced.
- Real payouts otomatis tanpa merchant/compliance approval.
- DRM setingkat studio film; MVP pakai private media + short-lived tokens.

---

## 3. UX, IA, DAN ROUTING

### 3.1 URL structure [RECOMMENDED]

| Page | Example | Audience |
|---|---|---|
| Home/Discover | `/` atau `/discover` | Visitor, user |
| Creator page | `/{creatorSlug}` | Visitor, user |
| Single post | `/{creatorSlug}/posts/{postId}` | Visitor preview, authorized user full |
| Login | `/login` | Visitor |
| OAuth callback | `/auth/telegram/callback` (API or web route) | OIDC flow |
| Wallet | `/wallet` | User |
| Top-up status | `/wallet/topups/{orderId}` | User |
| Subscriptions | `/subscriptions` | User |
| My purchases | `/library` | User |
| Creator apply | `/become-creator` | User |
| Creator studio | `/studio` | Approved creator |
| Creator content studio | `/studio/posts` | Approved creator |
| Creator plans | `/studio/plans` | Approved creator |
| Creator earnings | `/studio/earnings` | Approved creator |
| Creator payout | `/studio/payouts` | Approved creator |
| Admin | `/admin` | Admin only |

**Routing conflict:** reserve path prefixes seperti `login`, `wallet`, `studio`, `admin`, `auth`, `api`, `discover`, `subscriptions`, `library`, `terms`, `privacy`, `help`. Reject reserved slugs, normalize lowercase, whitelist permitted characters. Slugs harus unik case-insensitively.

### 3.2 Instagram Bio experience

- Creator memasang `https://influency.com/claudiandreya` di Instagram.
- Link membuka halaman web Claudia langsung, tanpa redirect ke Telegram Mini App.
- Halaman menampilkan avatar/banner, bio, kategori, daftar free content, premium previews, harga paket subscription.
- Pengunjung anonymous dapat membaca preview publik tanpa login.
- Untuk transaksi, user menekan login via Telegram; selesai login kembali ke URL/post semula menggunakan server-validated return path.
- OIDC redirect di Instagram in-app browser mungkin memiliki keterbatasan; siapkan fallback **"Open in browser"** dan tes di perangkat nyata.
- Jangan tampilkan asset premium asli dalam HTML/JSON publik, termasuk metadata CDN yang dapat dipakai untuk membuka file tanpa entitlement.

### 3.3 Key screens

1. Landing Creator (public)
2. Auth/login and consent
3. Content details / paywall
4. Wallet + packages + payment pending/success/fail
5. My subscriptions / purchased posts
6. Creator onboarding
7. Creator studio and upload
8. Creator subscription plan editor
9. Creator earnings + payout request
10. Admin moderation + finance console

### 3.4 UX principles

- Mobile-first, cepat, navigasi sederhana dan responsif di Instagram in-app browser.
- Jangan mewajibkan login untuk membaca profil dan konten free.
- Sebelum unlock, tampilkan harga Koin, durasi, tanggal expired estimasi, serta apakah subscription creator yang aktif sudah mencakup post tersebut.
- Sebelum membeli Koin, tampilkan nilai IDR, jumlah Koin, aturan refund, dan masa berlaku Koin (policy TBD).
- Konfirmasi transaksi yang sudah berjalan; cegah double tap dengan pending state namun backend tetap harus idempotent.
- Status pembayaran web hanya indikator UI; sumber kebenaran adalah backend yang merekonsiliasi gateway.
- Format tanggal UI `Asia/Jakarta` bila pasar Indonesia; simpan timestamp database dalam UTC.

---

## 4. TECH STACK & INFRASTRUCTURE

### 4.1 Proposed stack [RECOMMENDED]

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js LTS (pin version in `.nvmrc`) | Cek compatibility package |
| Language | TypeScript strict | Shared types linted |
| Repo | pnpm workspace monorepo | One repository |
| Web | Next.js App Router + React | SSR public creator pages |
| UI | Tailwind CSS + shadcn/ui | Accessible mobile-first components |
| Validation | Zod, or NestJS class-validator with strict DTOs | Choose one consistent pattern |
| Server | NestJS with Fastify adapter | Modular monolith |
| REST contract | OpenAPI/Swagger | Typed client generated if desired |
| DB | PostgreSQL | Source of truth |
| ORM | Prisma (compatible stable release) | Migrations in VCS |
| Background jobs | BullMQ + Redis | Payment reconciliation, notifications, media tasks |
| Auth | Telegram OIDC via standards-compliant library | Server validates tokens |
| Bot | grammY | One official bot, notification-oriented |
| Payments | Midtrans Snap **Sandbox** | Adapter `PaymentGatewayProvider` |
| Image storage | Cloudflare R2 / S3 compatible private bucket | Signed upload/read URLs |
| Video | Cloudflare Stream (private videos) | Adapter optional early MVP |
| Testing | Vitest/Jest + Playwright + Supertest | Unit, integration, e2e |
| CI | GitHub Actions | Lint, typecheck, tests |
| Observability | Structured logs + Sentry (optional) | Avoid secrets/PII in logs |
| Development | Docker Compose | PostgreSQL, Redis |
| Deployment later | Vercel frontend + VPS/containerized API/worker | No live keys until approval |

### 4.2 Architecture: modular monolith

```mermaid
flowchart TD
  IG[Instagram / TikTok Bio Link] --> WEB[Next.js Web]
  BROWSER[Direct Browser] --> WEB
  WEB --> API[NestJS REST API]
  TELEGRAM_LOGIN[Telegram OIDC] <--> API
  API --> PG[(PostgreSQL)]
  API --> R2[Cloudflare R2 / Image Storage]
  API --> STREAM[Cloudflare Stream / Video]
  API <--> MIDTRANS[Midtrans Snap Sandbox]
  API --> REDIS[(Redis / BullMQ)]
  REDIS --> WORKER[Notification / Reconciliation Worker]
  WORKER --> BOT[Influency Telegram Bot]
```

### 4.3 Suggested monorepo layout

```text
influency/
  apps/
    web/
      src/app/
        (public)/
        (auth)/
        (subscriber)/
        studio/
        admin/
      src/components/
      src/lib/
    api/
      src/modules/
        auth/
        users/
        creators/
        posts/
        media/
        wallets/
        coin-packages/
        topups/
        payments/
        subscriptions/
        entitlements/
        financial-ledger/
        payouts/
        telegram-bot/
        notifications/
        admin/
      prisma/
    worker/                    # can be combined with api app initially
  packages/
    shared/                    # types, schemas, error codes
    config/
  infra/
    docker-compose.yml
  docs/
    ADR/
  .env.example
  pnpm-workspace.yaml
  package.json
  README.md
```

### 4.4 Data ownership and boundaries

- **Next.js:** presentational UI + server rendering, no financial logic or secret provider calls in the browser.
- **NestJS:** authentication, authorization, business rules, source of truth, wallet, payment webhook, subscription, media authorization.
- **PostgreSQL:** authoritative balances, ledger, entitlements, payments, payouts, status history.
- **Redis/BullMQ:** asynchronous delivery only; not source of truth for balances.
- **Midtrans:** payment processor; do not assume browser return means successful payment.
- **Telegram:** identity provider and optional outbound notifications, not storage/checkout/runtime.
- **R2/Stream:** media bytes; permissions decided by API prior to short-lived delivery token.

---

## 5. AUTHENTICATION, ACCOUNT, CREATOR ROLES

### 5.1 Telegram Login OIDC [LOCKED]

Use **Authorization Code + PKCE (S256)** with OIDC discovery at:

`https://oauth.telegram.org/.well-known/openid-configuration`

Recommended scopes: `openid profile`; request `telegram:bot_access` with explicit consent when bot direct messages are desired. Do not require phone number without clear reason. Register allowed origins/redirect URLs using @BotFather's Telegram Login configuration. Telegram account identity is user identity; role is managed internally by Influency.

**Security requirements:**

- Generate and validate `state` (CSRF), `nonce` if used, and PKCE verifier/challenge; securely bind to auth attempt.
- Exchange authorization code server-side with client secret, never expose secret in frontend.
- Verify ID token JWKS signature, issuer `https://oauth.telegram.org`, expected audience/client ID, expiry, iat/nonce as appropriate.
- Persist stable provider subject (`sub`) and, where supplied/verified, Telegram numeric ID as a string-safe identifier. Never use username as unique account identity.
- Do not rely on a non-existent generic UserInfo endpoint; Telegram documents claims in ID token.
- Create server-managed sessions; HttpOnly, Secure, SameSite-appropriate cookies, expiration, logout and session revocation.
- Validate return-to URL against same-origin relative path whitelist to avoid open redirects.
- Minimize user personal data; store only fields needed.
- Login ≠ approval to become creator/admin; roles and creator status are separate.
- Respect logout and do not expose provider tokens to JS.
- Provide fallback login UX for Instagram in-app browser limitations.

**Recommended default identity design:** `users.id` UUID internal, `auth_identities` unique `(provider, provider_subject)`.

### 5.2 Creator onboarding

1. Logged-in user selects **Become a Creator**.
2. Provides display name, unique desired slug, profile info, acceptance of creator agreement and content policy; payout/KYC info may be deferred until payout, per compliance rules.
3. `creator_profiles.status = PENDING_REVIEW`.
4. Admin approves/rejects; record who decided and timestamp.
5. Approved creator receives Studio access.
6. Creator can still buy/subscribe to other creators' content using same account.

### 5.3 Role model

- `USER` is default authenticated role.
- `CREATOR` is capability granted only for approved profile (not merely JWT claim from Telegram).
- `ADMIN` explicitly granted in database/seed or protected bootstrap, never from public signup.
- Endpoint authorization must be based on server-side identity and object ownership.

### 5.4 Bot notification consent

- Bot belongs to Influency only; no creator bot tokens.
- Telegram can message users only when platform authorization/permissions allow; request bot access in OIDC or use `/start` linking flow.
- Store `notifications.telegram_enabled`/permission state. Handle 403 blocked bot by disabling deliveries and stop retry storms.
- Never send premium media or sensitive payout data in unsecured notifications; send summary + link to Influency website.

---

## 6. CONTENT, MONETIZATION, ENTITLEMENTS

### 6.1 Content model

A creator can publish a `post` containing description/caption and one or more media assets; post visibility:

- `FREE` — viewable without payment (subject to policy/moderation).
- `PREMIUM` — viewable if user owns valid post entitlement **OR** active account-wide creator subscription.

Recommended post status: `DRAFT`, `PROCESSING`, `PENDING_REVIEW`, `PUBLISHED`, `HIDDEN`, `REMOVED`.

`post_offer` provides snapshot-able Koin price and duration for per-post unlocks; include `offer_version`, `effective_from`, `duration_seconds` or `access_days`, `active`. Creator changes affect **future purchases only**.

### 6.2 Per-post unlock

- Example: 5 Koin for 7 days.
- At purchase, server reads current published offer and available wallet balance.
- Server creates entitlement with `starts_at` and `ends_at = purchased_at + duration` in UTC.
- Server debits exactly the offer's Koin amount in the same DB transaction as entitlement and revenue allocation.
- User with active creator subscription should not be charged again merely to view covered content.
- Existing post entitlement remains valid even after creator subscription expires if post entitlement itself has not expired.
- Already-purchased content can become unavailable for valid moderation, legal, deletion, or platform policy reasons; refund policy is TBD.

### 6.3 Creator-wide subscription

- Example: 30 Koin, access to **all current and future premium posts** by **one creator** during 30 days.
- Subscription is scoped to user + creator + plan, not a global premium subscription.
- **MVP: manual renew only.** Do not silently charge user wallet when expired.
- The creator can edit price/duration for **future** purchases; historic subscriber purchase terms immutable.
- When existing subscription is active and user manually renews: [RECOMMENDED] add duration from `max(now, current_end)` rather than truncating prepaid time, unless product decides otherwise.
- A creator subscription does not grant access to other creators.
- Creator content that should be excluded from subscription is **not in MVP**. All premium posts are included.

### 6.4 Entitlement check (server only)

```ts
canView =
  post.status === 'PUBLISHED' &&
  userIsAllowedByPolicy &&
  (
    post.visibility === 'FREE' ||
    userIsPostOwner ||
    activePostEntitlement(userId, postId, now) ||
    activeCreatorSubscription(userId, post.creatorId, now)
  );
```

Auth is required for non-public premium media. **`now` must be server time.** Avoid trusting UI state or client-provided entitlement data. Media signed URLs/tokens should be minted only after successful entitlement check.

### 6.5 Edge cases

- User owns per-post unlock and creator subscription: no double charge; access continues if either remains valid.
- Subscription expiry mid-playback: old short-lived token may remain usable until expiry; short TTL + next-request entitlement checks mitigate.
- User rapidly clicks purchase twice: unique idempotency key and transaction locks prevent double debit/duplicate entitlement.
- Creator changes price: purchase uses server-side current version, shows confirmation if price changed since UI loaded.
- User has insufficient Koin: return a domain error with required/current amount; do not create entitlement.
- Post is unpublished or removed: block playback and handle entitlement/refund according to policy.
- A creator subscribes to own account: [RECOMMENDED] disallow charge to self; owner already has management access.

---

## 7. KOIN WALLET — FINANCIAL REQUIREMENTS

### 7.1 Concept [LOCKED]

- Koin adalah **internal prepaid application credit** yang dibeli user dari Influency menggunakan IDR melalui payment gateway.
- Koin digunakan untuk membeli hak akses digital (post unlock atau creator subscription) di Influency.
- Koin bukan cryptocurrency, bukan TON token, dan tidak dijual/dipertukarkan antaruser.
- Subscriber **tidak boleh** mentransfer Koin ke subscriber lain dan **tidak dapat cash out** sebagai uang.
- Creator **tidak dibayar dalam Koin pengguna**; creator mendapat pencatatan kewajiban revenue share tersendiri yang nantinya dibayar dalam IDR sesuai kebijakan settlement.
- Top-up user bukan otomatis creator revenue. Creator revenue baru dialokasikan ketika Koin dibelanjakan.

### 7.2 Example package pricing — ONLY ILLUSTRATIVE, NOT LOCKED

| Package | Coins | IDR price |
|---|---:|---:|
| Starter | 25 | Rp25.000 |
| Standard | 60 | Rp60.000 |
| Plus | 150 | Rp150.000 |

**DO NOT treat the example as final price.** Actual pricing, bonus Koin, and validity can be configured by admin. MVP may use fixed 1 Koin = Rp1.000 equivalent for simplicity **as a temporary assumption for simulation**, not universal accounting truth or final exchange rate.

### 7.3 Ledger design requirements

- Database fields for quantities: **integers** (`BIGINT` if large) for Koin; IDR money: integer minor units or a fixed decimal type (no JS floats).
- Wallet balance either computed from immutable ledger or cached atomically alongside the ledger. In both cases ledger is source of audit truth.
- Every wallet movement includes `transaction_id`, `wallet_id`, `amount_signed`, `type`, `source_type`, `source_id`, timestamps, and idempotency key.
- No direct `UPDATE balance = balance + ...` from controller without ledger and transaction.
- **Unique constraint** for sources that may only post once (e.g. `(source_type, source_id, entry_type)`).
- Ensure serialized/concurrent-safe debit: row lock (`SELECT ... FOR UPDATE`), serializable transaction, or equivalent Prisma transaction strategy; retry serialization failures as appropriate.
- Balance must never go negative during normal purchase.
- Optionally use **double-entry ledger** for internal Koin movements (user wallet vs outstanding credit liability) to improve auditability. At minimum, an append-only movement ledger plus reconciliation must exist.
- Store top-up lot/source references (`coin_lots`, `coin_lot_allocations`) to track cost basis, prepaid value, discounts and refunds across purchases.
- Never allow admin to edit ledger rows in place; corrections are compensating transactions with reason + actor.

### 7.4 Recommended wallet journal events

| Event | Wallet | Notes |
|---|---|---|
| Successful top-up | CREDIT +N | Only after verified gateway event |
| Post unlock | DEBIT −price | In same tx as entitlement, revenue record |
| Creator subscription | DEBIT −price | Same tx as subscription, revenue record |
| Refund of unused top-up | DEBIT/reversal | Policy-driven, must account for spent Koin |
| Admin goodwill | CREDIT +N | Distinguish promotional Koin with no cash proceeds |
| Correction | REVERSAL | Link original transaction, audit trail |

### 7.5 Koin source lots and allocation

If user tops up multiple packages with discounts/bonuses, the realized IDR value per Koin can differ. Store purchase `gross_idr`, gateway fees if known, number of paid and bonus Koin, source top-up ID, and remaining balance per lot. When Koin spent, use deterministic lot consumption (e.g. FIFO) and record allocation to enable fair refunds and revenue calculations.

**[TBD]** Commercial policy determining payout basis: nominal list IDR/Koin vs realized net cash per consumed lot. Do not quietly hardcode one as the final production policy. For MVP use a documented deterministic simulation policy and show earnings as **estimated/pending** until settled.

---

## 8. MIDTRANS SANDBOX — PAYMENT FLOW [LOCKED FOR MVP]

### 8.1 Scope

Use **Midtrans Snap Sandbox** with API credentials belonging to Influency's sandbox merchant account. Primary currency is **IDR**. Use gateway's hosted/embedded Snap checkout and server-side API creation. User may select sandbox-supported payment methods including simulated QRIS, VA, e-wallet, cards, depending on enabled test methods.

**Critical distinction:** We changed from Telegram Mini App to independent website specifically to use third-party checkout. **Do not re-enable Mini App checkout** without re-evaluating Telegram digital-goods payment rules.

### 8.2 Top-up lifecycle

```mermaid
flowchart TD
    A[User opens Wallet] --> B[Select Koin package]
    B --> C[API validates package + logged-in user]
    C --> D[Create immutable topup order PENDING]
    D --> E[Midtrans Snap: create transaction]
    E --> F[Return checkout token/redirect]
    F --> G[User completes simulated payment]
    G --> H[Gateway webhook to API]
    H --> I[Verify signature + order + amount + status]
    I --> J{Accepted successful payment?}
    J -->|No| K[Update pending/failed/expired as appropriate]
    J -->|Yes| L{Already credited?}
    L -->|Yes| M[No-op success / audit]
    L -->|No| N[DB transaction: mark PAID + ledger CREDIT]
    N --> O[Commit and queue notification]
    O --> P[Wallet reflects new Koin]
```

### 8.3 Top-up invariants

1. Package ID and pricing must come from database; reject client-supplied amounts for authorization.
2. Create an internal globally unique `topup_orders.order_number` and use it as Midtrans `order_id` (follow provider format constraints).
3. Persist immutable snapshot: `coin_quantity`, `gross_amount_idr`, currency, user ID, package version at order creation.
4. Midtrans **Server Key never leaves backend**; client key may be used in Snap JS according to integration docs.
5. Verification is performed on backend against `signature_key`, merchant context, `order_id`, `gross_amount`, `transaction_status`, and `fraud_status` when present; follow official provider rules. Formula for Midtrans notification signature as documented: `SHA512(order_id + status_code + gross_amount + ServerKey)` (string formatting must match exact payload).
6. Successful statuses: usually `settlement`, or qualifying `capture` (e.g. card with accepted fraud status); never assume all `capture` are automatically acceptable without provider guidance.
7. Gateway webhook delivery can be duplicate, delayed, out of order, or missing. `creditOnce(orderId)` must be idempotent and transactionally safe.
8. Use transaction status API for reconciliation of pending/ambiguous orders; if provider's GET status returns not-found before payment method is chosen, keep order pending and retry appropriately.
9. Frontend payment success callback, browser redirect, or query parameter **does not authorize wallet credit**.
10. Do not credit if amount/order/merchant/currency mismatches; create fraud flag and operator review.
11. Gateway webhook endpoint should acknowledge verified events promptly; run slow notifications in queue. Handle failure/retry correctly (avoid 200 on event you failed to durably store).
12. Maintain exact state transitions, terminal state rules, and `created_at`, `paid_at`, `credited_at`, provider transaction ID.

### 8.4 Suggested payment status machine

```text
CREATED -> PENDING -> PAID -> CREDITED
                   -> EXPIRED
                   -> FAILED / DENIED
                   -> CANCELED
CREDITED -> REFUND_PENDING -> REFUNDED / PARTIALLY_REFUNDED (policy dependent)
```

Payment provider statuses map into our **internal normalized** status, not direct DB names with assumptions. Partial refunds require dedicated handling if provider method permits them.

### 8.5 Refunds, chargebacks, duplicates

- Refunds cannot simply erase payment or remove historic post entitlements without trace.
- Upon verified refund: append adjustment entry, reconcile coin lots, mark entitlement/revenue reversal if required by policy, preserve audit history.
- If user already spent Koin from a subsequently refunded top-up, mark wallet/account risk flag or debt adjustment and prevent further spending until reconciled. **Do not silently allow negative spendable balance**.
- Never credit twice for repeated `settlement` or a `capture` followed by `settlement` for same order.
- Payment compensation should also adjust creator pending/available earnings; if already paid out, create a debt/hold/dispute case rather than mutating historic payout.
- Reconcile daily: gateway paid total vs credited Koin vs ledger vs internal pending orders.

### 8.6 Midtrans official sandbox endpoints / references

- Snap sandbox create transaction: `POST https://app.sandbox.midtrans.com/snap/v1/transactions` (backend; basic auth with Server Key).
- Snap JS client sandbox URL and keys: verify current docs before implementation.
- Payment notification webhook URL configured in merchant dashboard.
- Use provider official simulator and merchant sandbox keys. **Never commit credentials**.
- Documentation sources at end of document.

### 8.7 Environment variables (names are suggestions)

```dotenv
NODE_ENV=development
WEB_ORIGIN=http://localhost:3000
API_ORIGIN=http://localhost:4000
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/influency
REDIS_URL=redis://localhost:6379
SESSION_SECRET=SET_LOCALLY_DO_NOT_COMMIT

TELEGRAM_OIDC_CLIENT_ID=SET_LOCALLY
TELEGRAM_OIDC_CLIENT_SECRET=SET_LOCALLY
TELEGRAM_OIDC_REDIRECT_URI=http://localhost:4000/auth/telegram/callback
TELEGRAM_BOT_TOKEN=SET_LOCALLY
TELEGRAM_BOT_WEBHOOK_SECRET=SET_LOCALLY

PAYMENT_PROVIDER=midtrans
MIDTRANS_IS_PRODUCTION=false
MIDTRANS_SERVER_KEY=SANDBOX_KEY_ONLY
MIDTRANS_CLIENT_KEY=SANDBOX_KEY_ONLY
MIDTRANS_MERCHANT_ID=SET_LOCALLY
MIDTRANS_WEBHOOK_URL=https://YOUR_PUBLIC_DEV_URL/webhooks/payments/midtrans

R2_ACCOUNT_ID=SET_LOCALLY
R2_ACCESS_KEY_ID=SET_LOCALLY
R2_SECRET_ACCESS_KEY=SET_LOCALLY
R2_BUCKET=SET_LOCALLY
CLOUDFLARE_STREAM_ACCOUNT_ID=SET_LOCALLY
CLOUDFLARE_STREAM_TOKEN=SET_LOCALLY
```

For local OAuth testing, use a registered HTTPS callback or approved dev/staging URL as required by Telegram; don't assume `localhost` will be accepted in BotFather. The above local callback is illustrative. For Midtrans notifications use public HTTPS tunnel/staging URL; localhost is not reachable by provider.

---

## 9. REVENUE SHARING, FINANCIAL LEDGER, PAYOUT

### 9.1 Business model [LOCKED]

- Subscriber pays Influency in IDR when purchasing Koin.
- User spends Koin on a creator's post or subscription.
- Influency allocates platform commission and creator earnings for the consumption event.
- Creator has `PENDING`, then `AVAILABLE` earnings, plus payout history.
- All creator payments are **Influency obligations**, not gateway split settlements in MVP.

### 9.2 Commission [TBD]

Illustration only: commission 20% and creator share 80%. Do not hardcode actual commercial terms. Represent commission as integer basis points (`2000` = 20.00%) with version/snapshot on transaction. The fee basis must be agreed: e.g. after gateway fee / taxes vs gross value.

Illustrative example:

- User tops up 100 Koin with Rp100.000.
- User buys content for 5 Koin.
- **Temporary illustration:** value equivalent Rp5.000.
- 20% platform allocation = Rp1.000, 80% creator allocation = Rp4.000 **before fees/taxes**, not necessarily withdrawable.
- Gateway cash proceeds and liability to user must be accounted for separately.

### 9.3 Financial states

**Top-up:** IDR received / prepaid credit obligation. Not creator earnings.

**Koin spend:** booking into `content_purchase`, `wallet_ledger`, `entitlement`, and `revenue_ledger` in one transaction, or use a transactional outbox with rigorously consistent financial linkage. Recommended simpler approach: same DB transaction.

**Creator earnings pending:** estimated/accrued allocation not yet eligible for payout (refund risk, access service period, compliance review, and receipt settlement).

**Creator earnings available:** eligible after policy-based settlement and adjustments.

**Payout:** request/approve/disburse/confirm through recorded state transitions. For MVP use admin **simulation or manual action logging**, not external automatic bank transfer. Never mark as PAID from button click alone; require operator-confirmed transfer reference (for real mode, after legal approval).

### 9.4 Suggested creator payout state machine

```text
REQUESTED -> IN_REVIEW -> APPROVED -> PROCESSING -> PAID
                       -> REJECTED
            -> ON_HOLD
PROCESSING -> FAILED -> retry/manual remediation
```

### 9.5 Required ledger properties

- Append-only journal entries with `id`, external/internal source reference, user, creator, gross/fee/net amount, currency, status, timestamp.
- Idempotent event-to-ledger mapping. Unique financial source key.
- Earnings adjustments through new entries, never delete old rows.
- Show separate `estimated`, `pending`, `available`, `paid` and `on_hold` numbers.
- Capture terms/commission rate at purchase time; changing default rate does not rewrite historical economics.
- Final creator withdrawal formula + processing fees + settlement minimums remain [TBD].
- Refund/dispute can reverse **pending** earnings immediately, place available earnings on hold, and create negative adjustments if already paid out.

### 9.6 Account policy [BLOCKER FOR LIVE]

Before charging real IDR, obtain appropriate advice/confirmation on:

- Local regulatory classification of Influency's prepaid Koin in a multi-creator platform (relevant Bank Indonesia payment-system rules).
- Payment-gateway merchant acceptance of creator content marketplace, prepaid credits, internal wallet, and payout model.
- Creator agreements, rev-share, taxes, KYC, minimum payout threshold, refund rights, reporting.
- Marketplace moderation and prohibited content, and any age-restricted content controls if relevant.

Midtrans official business restrictions include adult/pornography-related businesses; do **not** infer that any proposed content category is accepted. Build a content policy and complete merchant onboarding before switching from sandbox to live.

---

## 10. DATABASE MODEL — LOGICAL SPECIFICATION

Use UUIDs for internal primary keys. Store timestamps in UTC (`timestamptz`). Koin amount as integer; IDR as integer exact nominal unit or fixed decimal. Foreign keys and unique indices are part of the spec, not optional embellishments.

| Table | Key fields / constraints | Purpose |
|---|---|---|
| `users` | `id`, `display_name`, `created_at`, `status` | Base account |
| `auth_identities` | `id`, `user_id`, `provider`, `provider_sub`; UNIQUE `(provider, provider_sub)` | Stable Telegram identity |
| `sessions` | `id`, `user_id`, `token_hash`, `expires_at`, `revoked_at` | Session storage if needed |
| `user_roles` | `user_id`, `role`; UNIQUE `(user_id, role)` | RBAC |
| `creator_profiles` | `id`, `user_id` UNIQUE, `slug` UNIQUE, `status`, `bio`, `avatar_key` | Creator identity |
| `creator_applications` | `id`, `user_id`, `status`, `reviewer_id`, `reviewed_at` | Approval trail |
| `posts` | `id`, `creator_id`, `visibility`, `status`, `caption`, `published_at` | Content |
| `media_assets` | `id`, `post_id`, `storage_provider`, `object_key`/`video_uid`, `visibility`, `processing_status` | Image/video metadata |
| `post_offers` | `id`, `post_id`, `price_coins`, `duration_seconds`, `version`, `active` | Post unlock pricing |
| `creator_plans` | `id`, `creator_id`, `name`, `price_coins`, `duration_seconds`, `version`, `active` | Account subscriptions |
| `coin_packages` | `id`, `coins`, `price_idr`, `active`, `version` | Top-up catalog |
| `topup_orders` | `id`, `order_number` UNIQUE, `user_id`, `package_id`, `coins_snapshot`, `price_idr_snapshot`, `status` | Purchases of Koin |
| `payment_transactions` | `id`, `topup_id`, `provider`, `provider_transaction_id` UNIQUE, `gateway_status`, `verified_at` | Gateway activity |
| `webhook_events` | `id`, `provider`, `event_fingerprint` UNIQUE, `payload_hash`, `received_at`, `processing_status` | Durable processing |
| `coin_wallets` | `id`, `user_id` UNIQUE, `balance_coins`, `version` | Spendable Koin |
| `coin_lots` | `id`, `user_id`, `topup_id`, `remaining_coins`, `origin_coins`, `cash_basis_idr` | Credit provenance |
| `coin_lot_allocations` | `id`, `lot_id`, `purchase_id`, `coins_consumed`, `cash_basis_idr` | FIFO consumption trace |
| `coin_ledger` | `id`, `wallet_id`, `amount_signed`, `event_type`, `source_type`, `source_id`, unique idempotency | Wallet journal |
| `content_purchases` | `id`, `user_id`, `post_id` nullable, `plan_id` nullable, `coins_spent`, `offer_version`, `idempotency_key` UNIQUE | Purchase snapshot |
| `post_entitlements` | `id`, `user_id`, `post_id`, `purchase_id`, `starts_at`, `ends_at`, `status` | Per-post access |
| `creator_subscriptions` | `id`, `user_id`, `creator_id`, `plan_id`, `starts_at`, `ends_at`, `status` | Creator-wide access |
| `revenue_ledger` | `id`, `purchase_id`, `creator_id`, `gross_idr`, `fee_idr`, `net_idr`, `state`, `source_key` UNIQUE | Earnings allocation |
| `creator_payouts` | `id`, `creator_id`, `requested_idr`, `status`, `approved_by`, `transfer_reference` | Payout requests |
| `notification_preferences` | `user_id` UNIQUE, `telegram_allowed`, `opt_out_types` | Notification consent |
| `notification_jobs` | `id`, `user_id`, `event_type`, `status`, `idempotency_key` UNIQUE | Delivery records |
| `audit_logs` | `id`, `actor_id`, `action`, `resource_type`, `resource_id`, `created_at` | Sensitive ops audit |
| `moderation_cases` | `id`, `reporter_id`, `post_id`, `status`, `reviewer_id` | UGC moderation |

**Normalize design further during implementation**, e.g. separate subscription lifecycle events, package versioning, creator withdrawal accounts, upload sessions. Table above is logical contract, not an exact Prisma schema. Avoid redundant mutable balances without reconciliation.

### 10.1 Critical indexes / constraints

- Unique Telegram OIDC provider subject; unique creator slug (case-normalized).
- Unique `(provider, provider_transaction_id)` where transaction ID is present.
- Unique top-up order number per merchant; unique credit-source `(topup_order_id, CREDIT)`.
- Unique `wallet_ledger.idempotency_key` for business operation.
- Unique `content_purchases.idempotency_key` per user/request.
- Appropriate indexes on `(user_id, status, ends_at)` for entitlements/subscriptions.
- FK check creator ownership for post/plan and payout.
- `CHECK (balance_coins >= 0)` where semantics allow; never rely on check alone for race safety.
- `CHECK (price_coins > 0)` for premium offer; `duration_seconds > 0` unless lifetime offer explicitly supported.
- Unique active payout request policy if necessary; don't release same available balance twice.

### 10.2 Event and lifecycle illustrations

```mermaid
sequenceDiagram
  autonumber
  actor U as Subscriber
  participant W as Next.js Web
  participant A as NestJS API
  participant D as PostgreSQL
  participant M as Midtrans Sandbox
  participant B as Telegram Bot
  U->>W: Choose Koin package
  W->>A: POST /wallet/topups
  A->>D: Create PENDING order
  A->>M: Create Snap transaction
  M-->>A: Snap token / redirect URL
  A-->>W: Checkout details
  U->>M: Simulate payment
  M->>A: Signed payment notification
  A->>A: Verify signature, order, amount, status
  A->>D: Atomic payment + Koin credit
  A-->>M: 2xx acknowledgement
  A->>B: Queue notification
  W->>A: GET /wallet
  A-->>W: Updated Koin balance
```

```mermaid
sequenceDiagram
  autonumber
  actor U as Subscriber
  participant W as Web
  participant A as API
  participant D as Database
  participant S as Private Storage
  U->>W: Click Unlock Post
  W->>A: POST /posts/:id/unlock with idempotency key
  A->>D: Begin transaction + lock wallet
  A->>D: Validate current offer and existing access
  A->>D: Debit Koin + purchase + entitlement + revenue
  D-->>A: Commit success
  A-->>W: Purchase result and expiry
  W->>A: GET /posts/:id/media-access
  A->>D: Check entitlement using server time
  A->>S: Create short-lived signed URL/token
  S-->>A: Token
  A-->>W: Authorized media URL
  W-->>U: Display premium media
```

---

## 11. REST API CONTRACT (INITIAL)

Prefix suggested: `/api/v1` (confirm routing framework). Validate all input with schemas. Use consistent error objects, pagination, and auth middleware. Some endpoints public; write operations require sessions.

### 11.1 Authentication

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/auth/telegram/start?returnTo=...` | Public | Begin OIDC |
| GET | `/auth/telegram/callback` | Public | OIDC code exchange, secure session |
| GET | `/auth/me` | User | Current identity/roles |
| POST | `/auth/logout` | User | Revoke session |

### 11.2 Public and creators

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/creators/:slug` | Public | Public profile |
| GET | `/creators/:slug/posts` | Public | Safe preview/feed with pagination |
| GET | `/posts/:id` | Public | Public metadata + entitlement indicator if logged in |
| POST | `/creators/apply` | User | Creator application |
| PATCH | `/creators/me` | Approved creator | Profile edits |
| POST | `/posts` | Approved creator | Create draft |
| PATCH | `/posts/:id` | Owner | Edit draft/current offer per rules |
| POST | `/posts/:id/publish` | Owner | Publish or submit for review |
| POST | `/media/upload-url` | Owner | Signed upload for safe mime/size |
| GET | `/posts/:id/media-access` | Entitled user | Mint short-lived media token |
| POST | `/creators/me/plans` | Approved creator | Create subscription offer |

### 11.3 Wallet, purchase, subscription

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/wallet` | User | Balance and summary |
| GET | `/wallet/transactions` | User | Wallet ledger history |
| GET | `/wallet/packages` | Public | Active prepaid packages |
| POST | `/wallet/topups` | User | Create top-up order and Snap token |
| GET | `/wallet/topups/:id` | Order owner | Order status |
| POST | `/webhooks/payments/midtrans` | Provider verified | Webhook handling |
| POST | `/posts/:id/unlock` | User | Atomic purchase + entitlement |
| POST | `/creators/:id/subscribe` | User | Buy/extend creator subscription |
| GET | `/me/entitlements` | User | Purchases and access |
| GET | `/me/subscriptions` | User | Subscription list and expiry |

### 11.4 Earnings, payout and operations

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/studio/earnings` | Creator | Earnings summary |
| GET | `/studio/transactions` | Creator | Only their relevant revenue entries |
| POST | `/studio/payouts` | Creator | Submit payout request (simulated/manual MVP) |
| GET | `/studio/payouts` | Creator | Payout history |
| POST | `/admin/creators/:id/approve` | Admin | Approve creator |
| POST | `/admin/creators/:id/reject` | Admin | Reject creator |
| GET | `/admin/payments` | Admin | Reconciliation |
| POST | `/admin/topups/:id/reconcile` | Admin | Provider check + durable result |
| GET | `/admin/moderation` | Admin | Content queue |
| POST | `/admin/payouts/:id/approve` | Admin | Payout approval |
| POST | `/webhooks/telegram` | Telegram verified | Bot events |

### 11.5 Error response [RECOMMENDED]

```json
{
  "error": {
    "code": "INSUFFICIENT_COINS",
    "message": "Saldo Koin tidak cukup.",
    "requestId": "req_...",
    "details": { "required": 5, "available": 3 }
  }
}
```

Common domain errors: `AUTH_REQUIRED`, `FORBIDDEN`, `CREATOR_NOT_APPROVED`, `POST_NOT_AVAILABLE`, `OFFER_CHANGED`, `ALREADY_ENTITLED`, `INSUFFICIENT_COINS`, `TOPUP_NOT_FOUND`, `PAYMENT_PENDING`, `PAYMENT_VERIFICATION_FAILED`, `DUPLICATE_REQUEST`, `PAYOUT_ON_HOLD`.

**Idempotency contract:** client submits `Idempotency-Key` header for purchase/top-up creation; server stores key, request fingerprint, user, and result. Same key+same payload returns original result; same key+different payload is rejected. Even if client forgets key, database source uniqueness must prevent duplicate financial events.

---

## 12. SECURITY, PRIVACY, AND CONTENT PROTECTION

### 12.1 Security baseline

- TLS/HTTPS in staging and production; secure secrets and rotate on exposure.
- OIDC state/PKCE/nonce verification, strict issuer/audience/JWKS and expiration checks.
- Server session cookies: HttpOnly, Secure on HTTPS, SameSite appropriate to login redirect and CSRF protection for mutations.
- Backend authorization on every operation. Public `slug`, `userId`, `creatorId`, `postId` are identifiers, **not access tokens**.
- Rate-limit auth, purchase, top-up, upload, payout, and bot endpoints.
- No SSRF through arbitrary URL ingestion; validate uploaded file type from bytes, size, extension, malware/content policy, and storage key.
- Prevent cross-creator data leaks (creator studio can only manage own posts, plans, earnings).
- All admin finance actions require role checks, audit logs, and for live payouts stronger approval controls (recommended dual control).
- Never log bearer tokens, OIDC ID tokens, payment server keys, webhook secrets, signed media URLs, or full sensitive PII.
- Limit CORS to approved website origin, configure CSP, safe headers, safe JSON parsing.
- Use DB parameterization/ORM; sanitize rich-text/HTML content; strict file upload validation.
- Secret handling: `.env.example` placeholders only; `.env` ignored by git. Separate sandbox and production secrets.
- Backups for PostgreSQL and documented restore test; migrate safely.

### 12.2 Private media

- Private premium originals **must not** be accessible via public permanent URL, search indexing, or metadata API.
- Cloudflare R2: private buckets, presigned upload URLs with limited scope, access duration, file limits. For reads, server checks entitlement before generating presigned GET URL.
- Cloudflare Stream: set private videos to require signed URLs/tokens. Generate short-lived signed playback token after entitlement check.
- Avoid pre-signed media tokens in public SSR HTML, logs, analytics, or link previews.
- Public thumbnails should be deliberately created as safe previews/watermarked crops if needed; do not leak premium-original content.
- Tokenized media playback discourages casual sharing but does not prevent screen recording or determined copying. Do not promise absolute piracy prevention.

### 12.3 Privacy and data rights

- Privacy Policy, Terms of Service, Creator Agreement, Refund Policy, and Content Policy required before live operation.
- Support user account closure/deletion request, subject to applicable financial record retention requirements.
- Prefer not to collect phone number via Telegram if not necessary.
- Protect creator payout information and do not display it in social previews.
- Maintain consent records for bot messages and unsubscribe/opt-out path.

### 12.4 Content safety and moderation

- Creator-submitted media requires prohibited-content policy and reporting process.
- No non-consensual sexual content, exploitation or child sexual abuse material; enforce platform and payment-provider restrictions.
- Consider age gating where required by content category; do not assume any adult content is supported by Midtrans or host providers.
- Admin can suspend user/creator, hide media, quarantine uploads, revoke access where legally required, handle appeals and refunds.
- Moderation actions must be logged and should not silently rewrite finance history.

---

## 13. ASYNCHRONOUS JOBS AND NOTIFICATIONS

### 13.1 Worker jobs

| Job | Trigger | Retry policy |
|---|---|---|
| `payment.reconcile` | Pending/ambiguous gateway order | Backoff, respect provider limits |
| `notification.topup-success` | Transaction credit committed | Idempotent, no payment rollback on send fail |
| `notification.subscription-expiring` | Scheduled ahead of expiry | Deduplicate user/creator/period |
| `notification.new-post` | Published post | Opt-in only, throttle |
| `media.process` | Upload completed | Retry deterministic failures carefully |
| `earnings.settle` | Scheduled financial review | No auto-release without policy |
| `payout.review` | New creator request | Alert/admin workflow |

**Transactional outbox [RECOMMENDED]:** write `outbox_events` record in same DB transaction as wallet payment/purchase, then worker consumes it. Avoid the edge case where payment commits but notification job was never enqueued. Notification failure must never undo financial transaction.

### 13.2 Notification examples

- Subscriber: "Top-up berhasil: 60 Koin masuk. Buka Wallet: https://influency.com/wallet".
- Subscriber: "Akses subscription Claudia akan berakhir ...".
- Creator: "Post premium baru saja terjual" (aggregate/throttle to avoid spam).
- Creator: "Payout request sedang diperiksa".

Use one bot; signed links lead to **website**, not Telegram Mini App. Bot may fail if user has not allowed access or has blocked bot; store delivery failure and honor opt-out.

---

## 14. SYSTEM FLOWCHARTS FOR ENGINEERING

### 14.1 End-to-end visitor journey

```mermaid
flowchart TD
    A[Instagram Bio URL] --> B[Public Creator Page]
    B --> C[View Free Posts + Premium Preview]
    C --> D{Want Premium?}
    D -->|No| E[Continue Browsing]
    D -->|Yes| F{Logged in?}
    F -->|No| G[Telegram OIDC Login]
    G --> H[Validate & Create Session]
    F -->|Yes| I[Check Entitlement]
    H --> I
    I --> J{Has Access?}
    J -->|Yes| K[Private Media Token]
    J -->|No| L{Enough Koin?}
    L -->|No| M[Top-up via Midtrans Sandbox]
    M --> N[Verified Webhook Credits Wallet]
    N --> L
    L -->|Yes| O[Purchase Post / Subscription]
    O --> P[Atomic Debit + Entitlement + Revenue]
    P --> K
    K --> Q[View Premium Content]
```

### 14.2 Creator content publishing

```mermaid
flowchart TD
    A[Approved Creator enters Studio] --> B[Create Draft]
    B --> C[Upload image/video to private storage]
    C --> D[Media Processing / Validation]
    D --> E{Content Type}
    E -->|Free| F[Mark FREE]
    E -->|Premium| G[Set Koin price and duration]
    F --> H[Publish / Submit for moderation]
    G --> H
    H --> I{Review Passed?}
    I -->|No| J[Hold / Fix / Reject]
    I -->|Yes| K[Creator Page Feed]
```

### 14.3 Creator revenue and payout

```mermaid
flowchart TD
    A[User spends Koin] --> B[Create Purchase and Access]
    B --> C[Allocate Commission and Creator Earnings]
    C --> D[Earnings PENDING]
    D --> E[Refund Risk + Settlement + Compliance]
    E --> F{Eligible for payout?}
    F -->|No| G[Remain Pending / Hold]
    F -->|Yes| H[Earnings AVAILABLE]
    H --> I[Creator Requests Payout]
    I --> J[Admin Review]
    J --> K{Approved?}
    K -->|No| L[Hold / Reject]
    K -->|Yes| M[Manual/simulated payout MVP]
    M --> N[Confirm transfer reference]
    N --> O[Mark PAID; append ledger]
```

---

## 15. TEST STRATEGY — NON-NEGOTIABLE

### 15.1 Automated unit tests

- `validateTelegramOidcToken`: invalid signature, wrong issuer, wrong audience, expired token, missing state/nonce/PKCE, replayed login state.
- Slug rules: reserved paths, duplicate case variants, invalid symbols, rename policy.
- Access: free, individual unlock, active creator subscription, expired both, deleted post, private media token issuance.
- Wallet: initial zero, top-up credit, debit, insufficient balance, bonus lot, FIFO allocation, refund reversal.
- Subscription: initial purchase, manual renew while active, renewal after expiry, subscription creator isolation.
- Revenue: fee calculation with integer basis points, fee snapshot, no creator earnings on top-up, refund adjustment.

### 15.2 Payment integration tests (sandbox + mocks)

| Scenario | Expected result |
|---|---|
| Gateway successful payment | Credits exact ordered Koin once |
| Payment pending | No credit |
| Payment fails/denied/expired | No credit |
| Spoofed webhook signature | Rejected, no credit |
| Correct signature but wrong gross amount | Quarantine, no credit |
| Wrong merchant ID / order | Reject/quarantine |
| Duplicate settlement webhook 10x | Exactly one credit |
| `capture` then `settlement` | Never double credit |
| Webhook arrives after user closes browser | Still credit once |
| Browser says success but no verified payment | No credit |
| Webhook delayed | Reconciliation eventually matches |
| Concurrent webhook processing | Exactly one credit |
| Credit DB transaction fails | Retry safe; not partially credited |
| Refund after unspent top-up | Appropriate compensating entry |
| Refund after coins already spent | Account hold/reconcile, no silent negative spend |

### 15.3 Concurrent purchase integration tests

- Two unlock requests at the same time with wallet balance only sufficient for one -> exactly one succeeds, no negative balance.
- Duplicate idempotency key -> one purchase result, not two debits.
- Two subscriptions from different creators -> user can hold both independently.
- Admin changes offer price while request in flight -> atomic confirmation/snapshot policy applied, no inconsistent charge.
- User attempts to buy same post when already entitled -> no accidental duplicate charge; extension/repurchase policy explicit.

### 15.4 End-to-end Playwright journey

1. Open public Claudia page while logged out.
2. Confirm free post visible, premium original protected.
3. Login via test OIDC adapter/mock in CI; verify session and return path.
4. Visit wallet, select package and create Midtrans test order.
5. Simulate gateway successful notification in integration fixture or real sandbox.
6. Verify balance increment exactly once.
7. Unlock 5 Koin post, verify balance deduction and entitlement expiry.
8. Visit premium post from different user; ensure forbidden.
9. Subscribe Claudia for 30 Koin, verify all Claudia premium content opens.
10. Ensure other creator premium content remains locked.
11. Verify purchase creates creator revenue allocation, payout not automatically paid.
12. Verify notification queues only for consented Telegram users.

### 15.5 User acceptance demonstration

**Required demo data:** Creator Claudia (`claudiandreya`), Creator B (`creatorb`), anonymous visitor, subscriber A, subscriber B, admin; at least 1 free post and 2 premium posts per creator; at least 1 active creator plan.

**E2E success goal:**

`Instagram/Browser → Claudia profile → Telegram login → Midtrans Sandbox top-up → Koin wallet → 5 Koin/7-day post unlock → media playback → revenue ledger → bot notification`.

Second goal: `30 Koin/30-day creator subscription → all Claudia premium posts accessible → Creator B remains restricted → manual expiry handling`.

---

## 16. PHASED IMPLEMENTATION PLAN FOR CLAUDE

### Phase 0 — Discovery & decisions

**Deliverables:** confirm workspace, versions, missing environment values, decision register, architecture ADRs. Identify regulatory/merchant issues blocking live deployment (not prototype). **Do not start with production financial operations.**

### Phase 1 — Repository foundation

- Initialize pnpm monorepo, TypeScript config, lint/formatter, Next.js app, NestJS app, shared package.
- Docker Compose PostgreSQL and Redis; Prisma schema/migrations scaffolding.
- Health checks and `/api/v1/health` endpoint, request ID/structured error handling.
- CI lint + typecheck + tests, `.env.example`, dev README.

**Done when:** `pnpm install`, docker services, web and API boot locally, CI passes; no real credentials committed.

### Phase 2 — Telegram Login and public creator route

- One Influency BotFather bot for Telegram Login credentials.
- OIDC code + PKCE, ID token verification, secure cookie session.
- User model and creator profiles; seed approved Claudia and other creator.
- Responsive `/{creatorSlug}` and free previews; login returns to creator URL.
- Admin-approved creator flag, basic Studio route guard.

**Done when:** test user can open Claudia from public URL, login, return to Claudia, view free content, cannot access protected admin/creator routes without authorization.

### Phase 3 — Content, media and entitlement

- Draft/edit/publish creator posts, pricing/duration config, status.
- Image upload via private R2 adapter; optional local dev storage adapter.
- Video integration via Cloudflare Stream/private token if provider access available; otherwise define interface and stub protected fixture for core MVP tests.
- Entitlement Engine and private media endpoint.

**Done when:** free content works anonymously and premium originals remain protected for unauthorized user.

### Phase 4 — Coin wallet and purchase engine (simulated funding)

- Coin packages, wallet ledger, atomic balance changes, lot tracking, idempotency.
- Fake top-up provider in development to test business rules; never use fake provider in production.
- Post unlock purchase, creator subscription, expiry and manual renewal.
- Revenue ledger and fee snapshots.

**Done when:** all race/duplicate tests pass with simulated top-ups; no gateway dependency required.

### Phase 5 — Midtrans Sandbox integration

- `PaymentGatewayProvider` interface and `MidtransSnapSandboxProvider` implementation.
- Top-up order + Snap token, checkout UI, verified webhook, reconciliation.
- Payment status API, sandbox simulator, failure/duplicate/out-of-order testing.
- Queue outbox notification after commit.

**Done when:** real Midtrans Sandbox simulated payment credits exact Koin once; all negative cases pass; production remains disabled.

### Phase 6 — Creator earnings, admin, and payout simulation

- Creator earnings dashboard: pending/available/paid (properly labeled).
- Admin transactions, moderation queue, manual payout request/approval state machine.
- Reconciliation reporting; refund and adjustment flow, operator audit.

**Done when:** each purchase creates consistent creator revenue and commission; no actual bank transfer; payouts have review trails.

### Phase 7 — Production readiness (separate business decision)

- Compliance, merchant onboarding, content policy, creator KYC, tax/legal review, real payout provider, incident runbooks, alerting, backups, rate limit, penetration testing.
- Domain/SSL, staging deployment, provider callback settings.
- **Do not flip to Midtrans production until all compliance and merchant gates cleared and owner approves.**

---

## 17. DEFINITION OF DONE — MVP

The MVP is ready for a **sandbox demo**, not necessarily live commercial release, when:

- [ ] Independent web-first website works on mobile and normal browsers.
- [ ] Public `/{creatorSlug}` page resolves directly from Instagram Bio link.
- [ ] Telegram OIDC works with correct server-side token verification and secure session.
- [ ] One user can be subscriber and approved creator.
- [ ] Free and premium content modes work; premium media protected.
- [ ] Creator may set post price/duration and creator-wide plan price/duration.
- [ ] Top-up package creates Midtrans Sandbox order.
- [ ] Verified payment credits Koin exactly once; duplicate webhook cannot add balance twice.
- [ ] Wallet shows balance and immutable transaction history.
- [ ] Post unlock debits Koin once and grants time-bound access.
- [ ] Account-wide subscription debits Koin once and grants all premium posts by target creator.
- [ ] Expiration enforced server-side, manual renewal works.
- [ ] Cross-user and cross-creator authorization tests pass.
- [ ] Purchases generate commission and creator pending earnings with captured terms.
- [ ] Payout workflow exists at least as manual/simulated state machine.
- [ ] Telegram bot notifies opt-in user without being a payment system.
- [ ] Payment/financial failure modes and concurrent requests are covered by automated tests.
- [ ] README, `.env.example`, local run instructions and sandbox test guide are complete.
- [ ] No production API keys and no live payment/payouts are activated.

---

## 18. DECISION REGISTER — LOCKED vs OPEN

### 18.1 Locked decisions

1. Influency = independent web-first app.
2. Every creator has `influency.com/{slug}`.
3. Telegram Login as primary sign-in.
4. One Influency bot for opt-in notifications only.
5. No creator bot integration.
6. Influency receives user payments centrally.
7. Prepaid Koin wallet for user purchases.
8. Free / post unlock / creator-wide subscription.
9. Creator controls price and duration within system limits.
10. Platform commission and creator earnings tracked internally.
11. Midtrans **Sandbox** for MVP tests (not Lynk.id).
12. Manual subscription renewal for MVP.
13. Private content access controlled by Influency server.

### 18.2 Recommended technical decisions (can evolve via ADR)

1. Next.js + TypeScript + Tailwind + shadcn/ui.
2. NestJS + Fastify modular monolith.
3. PostgreSQL + Prisma.
4. BullMQ + Redis.
5. Cloudflare R2 for images, Cloudflare Stream for video.
6. pnpm monorepo.
7. One normalized PaymentGatewayProvider interface.
8. Server-side short-lived media tokens, typed contracts, comprehensive automated tests.
9. Manual/admin simulation for payout MVP.

### 18.3 Open decisions / do not fabricate

| ID | Topic | Provisional design for sandbox | Production decision needed |
|---|---|---|---|
| D-01 | Koin package prices | 25/60/150 Koin examples | Actual IDR price, discount, Koin equivalence |
| D-02 | Creator commission | Example 20% | Final rate and fee/tax basis |
| D-03 | Revenue recognition | Pending on purchase; release by policy | Treatment of 7/30-day service period |
| D-04 | Creator payout | Simulated/manual | Supported payout rails, minimum, KYC, fees |
| D-05 | Refund policy | Compensating entries, operator review | User rights, duration, reversal allocation |
| D-06 | Coin expiry | No automatic expiry assumed for prototype | Legal/business validity and breakage rules |
| D-07 | Content categories | Safe general creator content only | Content policy and payment provider acceptance |
| D-08 | Age verification | No age-sensitive content in prototype | Policy based on actual content and jurisdiction |
| D-09 | Creator application | Manual admin approval | Requirements and identities/KYC |
| D-10 | Media limits | Conservative dev limits | Max file sizes, streaming budget, moderation |
| D-11 | Production payment gateway | Midtrans sandbox adapter | Merchant approval for Koin/UGC marketplace |
| D-12 | Koin legal classification | Build prototype only | Indonesian payment-system legal review |
| D-13 | Creator subscription renew | Manual, extension from current expiry | Final overlap/renewal semantics |
| D-14 | Post re-purchase | If active, return existing entitlement | Can user extend/stack an active post unlock? |
| D-15 | Design system/branding | Neutral responsive creator-focused UI | Final visual brand identity and copy |

**Do not block scaffold and sandbox demo for unresolved commercial questions.** Mark values as `EXAMPLE`, configurable, and disable live features until reviewed.

---

## 19. DEVELOPMENT SAFETY RULES FOR CLAUDE

### 19.1 Do not

- Do not treat Telegram OAuth login token as permission to access premium content.
- Do not expose Telegram bot token, Telegram OIDC secret, Midtrans Server Key, R2 keys, or signing keys to frontend.
- Do not create per-creator bots.
- Do not redirect users from public creator page into a Mini App as a prerequisite.
- Do not use Telegram Stars API for MVP purchases.
- Do not use Lynk.id for MVP payments.
- Do not trust browser payment success, amount or price field.
- Do not update wallet balances without durable ledger and atomic transaction.
- Do not use floats for money/Koin.
- Do not process duplicate webhook credits more than once.
- Do not promise creator payout based on gross Koin or arbitrary Rupiah conversion.
- Do not make premium media permanently public.
- Do not perform real disbursement or enable production gateway credentials without confirmation.
- Do not implement a full banking ledger or tax engine prematurely; use sound accounting boundaries and explicit TBDs.

### 19.2 Always

- Keep frontend responsive/mobile-first.
- Make all financial flows idempotent, auditable and tested.
- Follow provider official docs; type all external payloads and validate runtime schemas.
- Protect user data and separate creator tenancy.
- Use migration discipline and seed demo identities/creators/posts.
- Write automated tests for critical business rules before declaring a milestone done.
- Explain commands for running, testing and resetting local sandbox.
- Report any mismatch between this handoff and actual codebase/provider docs.

---

## 20. OFFICIAL TECHNICAL REFERENCES / CHECK BEFORE IMPLEMENTING

**Telegram OIDC:**
- [Log In With Telegram — OIDC, BotFather, scopes, PKCE, JWKS](https://core.telegram.org/bots/telegram-login)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Telegram Bots overview](https://core.telegram.org/bots)

**Midtrans:**
- [Midtrans Snap Backend Integration](https://docs.midtrans.com/reference/backend-integration)
- [Testing Payment on Sandbox](https://docs.midtrans.com/docs/testing-payment-on-sandbox)
- [HTTP(S) Notification / Webhooks](https://docs.midtrans.com/docs/https-notification-webhooks)
- [Snap Integration Guide](https://docs.midtrans.com/docs/snap-snap-integration-guide)
- [Switching to Production Mode](https://docs.midtrans.com/docs/switching-to-production-mode)
- [Business Restrictions / Prohibited Categories](https://docs.midtrans.com/docs/can-all-types-of-businesses-accept-payments-through-midtrans)

**Cloudflare:**
- [R2 Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [R2 Object Uploads](https://developers.cloudflare.com/r2/objects/upload-objects/)
- [Cloudflare Stream — Secure Your Stream](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/)

**Regulatory context (not legal advice):**
- [Bank Indonesia — PBI 10 Tahun 2025, Pengaturan Industri Sistem Pembayaran](https://www.bi.go.id/id/publikasi/peraturan/pages/pbi_102025.aspx)

Read current docs before implementation; SDK names, endpoints, and provider rules may evolve after this context date. Specific business compliance requires qualified review.

---

## 21. GLOSSARY

- **Influency:** central platform/merchant responsible for user balances, content access, creator income accounting.
- **Creator:** approved Influency user who publishes and sells content under unique slug.
- **Subscriber:** logged-in user purchasing post access or creator membership.
- **Koin:** prepaid non-transferable internal credit unit; not crypto and not cash for subscribers.
- **Stars:** Telegram's in-app digital currency; **not used in Influency web-first MVP**.
- **Post unlock:** one-time Koin spend granting time-bound access to specified premium post.
- **Creator subscription:** Koin spend granting account-wide access to a single creator's premium posts for chosen period; manually renewed.
- **Entitlement:** server-verifiable authorization to view protected media.
- **Wallet ledger:** append-only record of Koin credit/debit/reversal.
- **Revenue ledger:** append-only record of creator/platform allocation and adjustments.
- **Top-up order:** internal business order for a Koin package linked to gateway transaction(s).
- **Payment webhook:** server-to-server payment status notification; validated and idempotent.
- **Sandbox:** test payment environment without real money.
- **OIDC:** Telegram website identity authentication, distinct from Telegram Mini App `initData`.
- **Payout:** Influency transferring payable creator earnings after settlement/approval.
- **Modular monolith:** one backend deployment subdivided into feature modules.

---

## 22. COPY-PASTE STARTER PROMPT FOR CLAUDE

Use the following prompt when attaching this file to Claude Code or Claude chat. It is part of this file so that it travels with the context.

> You are the lead software architect and senior full-stack engineer for **Influency**. Read the attached `INFLUENCY_MVP_CLAUDE_HANDOFF_v1.md` in full. This file supersedes previous discussions. The locked product is a **web-first multi-creator platform** with Telegram **OIDC** for login and **one Influency bot for opt-in notifications**, **Midtrans Snap Sandbox** for prepaid Koin top-ups, post unlocks and creator-wide subscriptions, centralized revenue ledger, and creator payout simulation. No Telegram Mini App payments, no Telegram Stars, no Lynk.id payment, and no creator-owned bots for MVP.
>
> First inspect the repository/workspace and report what exists. Then summarize locked decisions, unresolved compliance/business points, and a phase-by-phase implementation plan. Start with **Phase 1 (project foundation)** only, unless I direct you otherwise. Build a pnpm TypeScript monorepo with Next.js web, NestJS API, PostgreSQL/Prisma, Redis (if needed), Docker Compose, shared contracts, environment example, testing, and README. Favor maintainable simplicity. Implement no real payment or payout. For subsequent milestones, ensure all wallet/payment operations are atomic, idempotent, server-authoritative, and tested. Ask only when a decision truly blocks safe implementation; otherwise use clearly labeled development defaults. Show files changed, test results, and next recommended milestone.

---

## 23. FINAL BUILD TARGET

**The first successful Influency MVP demo should demonstrate:**

1. Claudia shares `https://influency.com/claudiandreya` in her Instagram bio.
2. Visitor opens Claudia's public profile in a regular web browser and sees free content plus locked premium previews.
3. Visitor logs in through Telegram OIDC; Influency creates a secure session and returns them to Claudia.
4. User purchases a prepaid Koin package through **Midtrans Sandbox**, not real payment.
5. A verified gateway notification credits the wallet exactly once; retries/duplicates do not duplicate Koin.
6. User spends 5 Koin on Claudia's video for 7 days; backend creates access entitlement, debit, and revenue allocation atomically.
7. Private video/image becomes playable through short-lived media authorization.
8. User purchases 30-Koin creator subscription for 30 days; all Claudia premium posts become accessible, but other creators remain restricted.
9. Claudia sees estimated pending earnings, Influency commission is recorded, payout stays in simulation/manual workflow.
10. Influency's sole bot sends allowed notification(s) where user consent has been granted.

**End-state:** a reliable sandbox-tested product with authentic creator UX and a sound financial architecture, ready for policy/merchant/legal review before commercial launch.

---

*End of Influency MVP Engineering Handoff v1.0 — 2 November 2026.*

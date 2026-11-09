# Technical Plan: US-002 — Bottom Sheet & Toast

## Architecture Overview

We wrap two Radix primitives that are already installed (`radix-ui` 1.8.1) and add no new dependency.

- **`BottomSheet`** (`components/ui/bottom-sheet.tsx`) is built on Radix `Dialog`.
  - Radix already gives us: the focus trap, focus moving in, Escape, backdrop tap (pointer-down outside), and page scroll lock via `react-remove-scroll`. That lock uses `overflow: hidden` and no `position: fixed`, so the scroll position is kept.
  - We add: the styling (22 px top radius `rounded-t-3xl`, drag handle, optional eyebrow and visible or sr-only title, close button), a hand-rolled swipe-down on the header, a visualViewport keyboard inset for iOS, focus return that also works for controlled sheets with no `Trigger`, and slide/fade motion that is turned off under `prefers-reduced-motion`.
- **Toast** (`components/ui/toast.tsx`) is built on Radix `Toast`.
  - A `<Toaster>` provider is mounted once in the root layout, and `useToast()` returns `toast(message)`.
  - Radix gives us: the polite live-region announcement, auto-dismiss, never taking focus, and an `<ol>` viewport, so toasts stack and never overlap.
  - The viewport sits above the bottom nav using a new `--bottom-nav-height` layout variable. US-003 must keep using that variable.
- **Migration** (agreed with the user on 2026-11-07):
  - `purchase-sheet` → `BottomSheet`. The demo "buy" result becomes a toast.
  - The "Laporkan" inline form → a sheet. Success shows a toast.
  - The `window.confirm` for deleting a comment → a confirm sheet.
  - The share button's "link copied" → a toast.
  - Admin `window.confirm` stays as it is (not user-facing). `account-menu` is replaced by the right drawer in US-005, so it is not touched here.

Decisions agreed with the user:
- Swipe-down is hand-rolled (about 30 lines of pointer handling). We don't use `vaul`.
- On-screen keyboard: viewport `interactiveWidget: 'resizes-content'` (Android/Chrome) plus a small `visualViewport` hook that lifts the sheet above the iOS keyboard. The sheet body scrolls.

## Dependencies

None new. The pieces used:
- `radix-ui` `Dialog` and `Toast`
- `tw-animate-css` (already imported in `globals.css`), for `animate-in`/`slide-in-from-bottom`/…
- Tailwind's `motion-reduce:` variant

## Risks

- **Radix pointer events in jsdom.** jsdom has no `setPointerCapture`/`hasPointerCapture`.
  - Mitigation: the swipe handler calls `e.currentTarget.setPointerCapture?.(e.pointerId)`.
  - Backdrop-dismiss tests fire `pointerDown` on the overlay. If Radix's outside-pointer listener doesn't fire in jsdom, assert via Escape plus the close button, and cover backdrop dismissal by an assertion that the overlay renders. Don't add `@testing-library/user-event` just for this.
- **Focus loss after an item disappears.** After a comment is deleted (or a report is sent), its trigger unmounts.
  - Report: handled with `onCloseAutoFocus`, which focuses the "sent" status paragraph.
  - Comment delete: this already lost focus with `window.confirm`. It is left unchanged; note it in the PR.
- **Toast offset on standalone pages** (`/login`, studio, admin, which have no bottom nav). Toasts float `--bottom-nav-height` above the bottom edge there. That is acceptable, and US-003 may zero the variable on standalone layouts.
- **iOS keyboard.** `visualViewport` math can't be verified in jsdom beyond unit math. A manual check on iOS Safari is listed under testing.

## Tasks

### TASK-003: BottomSheet component and keyboard-inset hook

**What to build**

1. `apps/web/src/lib/use-keyboard-inset.ts`

   ```ts
   /** Pixels the on-screen keyboard covers at the bottom of the layout viewport (iOS Safari). 0 when closed or when the browser resizes content (Android, interactive-widget=resizes-content). */
   export function useKeyboardInset(active: boolean): number
   ```

   - It returns 0 when `!active` or when `window.visualViewport` is missing.
   - It computes `Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))`.
   - It recomputes on `vv` `resize` and `scroll`, and removes the listeners on cleanup.
   - It subscribes only while `active`.

2. `apps/web/src/app/layout.tsx`: add `interactiveWidget: 'resizes-content'` to `viewport`. Comment: `// Android: keyboard shrinks dvh so sheets stay above it; iOS is handled by useKeyboardInset`.

3. `apps/web/src/components/ui/bottom-sheet.tsx` (`'use client'`)

   ```ts
   type BottomSheetProps = {
     /** Accessible name; always required. Rendered visibly unless hideTitle. */
     title: string;
     hideTitle?: boolean;
     /** Small muted line above the title (e.g. "Post premium · Claudia"). */
     eyebrow?: ReactNode;
     /** Optional visible description under the title; otherwise aria-describedby is omitted. */
     description?: ReactNode;
     /** Uncontrolled usage: element rendered via Dialog.Trigger asChild. */
     trigger?: ReactNode;
     /** Controlled usage. If `open` is given, the sheet is controlled. */
     open?: boolean;
     onOpenChange?: (open: boolean) => void;
     /** Passed to Dialog.Content; call e.preventDefault() to take over focus return. */
     onCloseAutoFocus?: (e: Event) => void;
     children: ReactNode;
   };
   export function BottomSheet(props: BottomSheetProps): JSX.Element
   ```

   - **State:** `const [innerOpen, setInnerOpen] = useState(false); const open = props.open ?? innerOpen; const setOpen = (v: boolean) => { setInnerOpen(v); props.onOpenChange?.(v); };`. Pass `open`/`onOpenChange={setOpen}` to `Dialog.Root`.
   - **Focus return** (this works without a Trigger):
     - In `onOpenAutoFocus`, store `document.activeElement` in `returnFocusRef`.
     - In `onCloseAutoFocus`, call `props.onCloseAutoFocus?.(e)` first. If `!e.defaultPrevented`, call `e.preventDefault()` and then `(returnFocusRef.current as HTMLElement | null)?.focus()`.
   - **Overlay:**

     ```
     fixed inset-0 z-50 bg-black/55 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none
     ```

   - **Content:**

     ```
     fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-feed flex-col rounded-t-3xl bg-card focus:outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom duration-200 motion-reduce:animate-none
     ```

     - Inline style: `{ bottom: inset, maxHeight: \`calc(90dvh - ${inset}px)\`, transform: dragY ? \`translateY(${dragY}px)\` : undefined }`, where `inset = useKeyboardInset(open)`.
     - When there is no `description`, pass `aria-describedby={undefined}`. This is the Radix-documented way to opt out.
   - **Header (the drag zone).** It is a `div` with `touch-none select-none px-5 pt-3` and the pointer handlers below. It contains:
     - the handle `<div aria-hidden className="mx-auto h-1.5 w-10 rounded-full bg-border" />`
     - a row with eyebrow + `Dialog.Title` (`text-lg leading-snug font-extrabold wrap-break-word`; `sr-only` when `hideTitle`) + optional `Dialog.Description` (`text-sm text-muted-foreground`)
     - `Dialog.Close asChild` → `<Button variant="ghost" size="icon" aria-label="Tutup" className="size-11 rounded-full"><X aria-hidden className="size-5" /></Button>`. This is the same markup `purchase-sheet` uses today.
   - **Body.** It is `<div className="flex flex-col gap-4 overflow-y-auto overscroll-contain px-5 pt-2 pb-[calc(1.75rem+env(safe-area-inset-bottom))]">{children}</div>`. Only the body scrolls, so the header and close button stay reachable when the keyboard is up.
   - **Swipe-down** (header only, so body scrolling never fights it). State: `dragY` (number); refs: `startY` and `startT`.
     - `onPointerDown`: record `startY = e.clientY`, `startT = e.timeStamp`, and call `e.currentTarget.setPointerCapture?.(e.pointerId)`.
     - `onPointerMove`: if dragging, `setDragY(Math.max(0, e.clientY - startY))`.
     - `onPointerUp` / `onPointerCancel`: compute `dy` and `v = dy / (e.timeStamp - startT || 1)`. If `dy > 80 || v > 0.5`, call `setOpen(false)`. Always reset `dragY` to 0 and stop dragging.
     - Export the thresholds as `const SWIPE_CLOSE_PX = 80, SWIPE_CLOSE_VELOCITY = 0.5`.
     - While dragging, add `transition-none`; otherwise add `transition-transform motion-reduce:transition-none`, so the snap-back animates.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/lib/use-keyboard-inset.ts` | iOS keyboard inset hook |
| CREATE | `apps/web/src/lib/use-keyboard-inset.test.ts` | Hook math |
| CREATE | `apps/web/src/components/ui/bottom-sheet.tsx` | Shared sheet |
| CREATE | `apps/web/src/components/ui/bottom-sheet.test.tsx` | Behaviour tests |
| MODIFY | `apps/web/src/app/layout.tsx` | `interactiveWidget: 'resizes-content'` |

**Testing** (Vitest + Testing Library):
- **Trigger:** clicking the trigger opens `getByRole('dialog', { name: title })`, and focus is inside the dialog.
- **Close button:** clicking **Tutup** closes the sheet and focus returns to the trigger.
- **Escape:** pressing Escape closes the sheet.
- **Backdrop:** `pointerDown` on the overlay closes the sheet (see Risks for the fallback).
- **Controlled, no trigger:** focus an external button, set `open` to true, close via Tutup. `onOpenChange(false)` is called and focus returns to that button.
- **Swipe:**
  - `pointerDown` (clientY 0) → `pointerMove` (120) → `pointerUp` (120) on the header closes the sheet.
  - A 20 px drag spread over enough time (`timeStamp` far apart) keeps it open.
- **Scroll lock:** while open, `document.body` has the scroll lock that `react-remove-scroll` applies. Check the installed version: the `data-scroll-locked` attribute, or `style.overflow === 'hidden'`. It is cleared after close.
- **Title:** `hideTitle` still gives the accessible name. `eyebrow` and `description` render.
- **`useKeyboardInset`:**
  - Stub `window.visualViewport` (height 500, offsetTop 0, with add/removeEventListener) and `innerHeight` 800. It returns 300, and it returns 0 when inactive.
  - Firing the stored resize listener after changing height recomputes the value.
- **Manual (in the PR):** iOS Safari and Android Chrome. Open the Laporkan sheet, focus the textarea, and check that the textarea and submit button stay visible. Also check that reduced motion turns the slide off.

---

### TASK-004: Toast provider, `useToast` and bottom-nav height variable

**What to build**

1. `apps/web/src/app/globals.css`: add a layout variable to `:root`, next to `--feed-max-width`: `--bottom-nav-height: 4rem; /* toast offset; BottomNav height (US-003 keeps it) */`.
2. `apps/web/src/components/bottom-nav.tsx`: give the `<ul>` the class `h-(--bottom-nav-height)` and make the links `h-full justify-center`, so the variable matches the real nav height. No other changes; US-003 rebuilds the nav.
3. `apps/web/src/components/ui/toast.tsx` (`'use client'`)

   ```ts
   export const TOAST_DURATION_MS = 4000;
   export const MAX_TOASTS = 3;
   export function Toaster({ children }: { children: ReactNode }): JSX.Element
   export function useToast(): (message: string) => void
   ```

   - **State:** a `ToastContext` holding `toast`. `Toaster` keeps `items: { id: number; message: string }[]` in state and an incrementing id ref. `toast(message)` appends the item and keeps only the last `MAX_TOASTS`. Memoise `toast` with `useCallback`.
   - **`useToast`:** throws `new Error('useToast must be used inside <Toaster>')` when the context is missing.
   - **Render:**

     ```tsx
     <Toast.Provider duration={TOAST_DURATION_MS} swipeDirection="down" label="Notifikasi">
       <ToastContext value={toast}>{children}</ToastContext>
       {items.map((t) => (
         <Toast.Root key={t.id} type="background" onOpenChange={(o) => { if (!o) setItems((l) => l.filter((x) => x.id !== t.id)); }}
           className="rounded-xl bg-secondary px-4 py-3 text-sm font-semibold text-secondary-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[swipe=move]:translate-y-(--radix-toast-swipe-move-y) motion-reduce:animate-none">
           <Toast.Title>{t.message}</Toast.Title>
         </Toast.Root>
       ))}
       <Toast.Viewport className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+0.75rem)] z-[60] mx-auto flex w-full max-w-feed flex-col gap-2 px-4 outline-none" />
     </Toast.Provider>
     ```

     - `type="background"` gives a polite announcement.
     - Charcoal `secondary` with white text passes AA (already in `theme.test.ts`).
     - `z-[60]` keeps toasts above an open sheet (`z-50`).
     - There is no action button and no close button. Toasts are short confirmations and swipe-down dismisses them.
4. `apps/web/src/app/layout.tsx`: wrap the body content with the provider: `<Toaster><SiteHeader />{children}</Toaster>`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/app/globals.css` | `--bottom-nav-height` |
| MODIFY | `apps/web/src/components/bottom-nav.tsx` | Use the variable for its height |
| CREATE | `apps/web/src/components/ui/toast.tsx` | `Toaster`, `useToast` |
| CREATE | `apps/web/src/components/ui/toast.test.tsx` | Behaviour tests |
| MODIFY | `apps/web/src/app/layout.tsx` | Mount `Toaster` |

**Testing** (use a tiny test component with a button that calls `toast('Halo')`):
- After a click, the message is visible inside the viewport list. The viewport's class contains `--bottom-nav-height`.
- **Never steals focus:** `document.activeElement` is still the clicking button after the toast appears.
- **Screen readers:** an `aria-live="polite"` region contains the message. Radix announces on the next frame, so use `waitFor`.
- **Auto-dismiss:** `vi.useFakeTimers()`, advance `TOAST_DURATION_MS + 100` → the message is gone.
- **Stacking:** 4 clicks → 3 separate list items (`MAX_TOASTS`), the oldest dropped.
- **Outside the provider:** `useToast` outside `Toaster` throws.

---

### TASK-005: Move `purchase-sheet` onto BottomSheet

**What to build**

Rewrite `apps/web/src/components/purchase-sheet.tsx` and keep its props and exports unchanged (callers `post-grid.tsx` and `subscribe-card.tsx` stay untouched).

- Render `<BottomSheet trigger={trigger} title={title} eyebrow={kicker} open={open} onOpenChange={setOpen}>`, controlled with local `open` state. Drop the hand-written `Dialog.*` markup, the handle and the close button; `BottomSheet` owns them.
- Keep these in the body exactly as they are:
  - the `<dl>` of rows + Harga + Saldo kamu
  - the short-balance `Isi Koin · kurang N Koin` link
  - `children`
  - the non-refundable note
- **Buy button:** instead of the inline `role="status"` message, call `setOpen(false); toast(DEMO_PURCHASE_MESSAGE)`. Remove the `message` state and the status `<p>`. Keep the existing `shortcut:` comment and update its wording (the buy button only shows a demo toast).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/components/purchase-sheet.tsx` | Use `BottomSheet` + `useToast` |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/creator-posts.test.tsx` | Wrap render in `Toaster`; new demo-buy expectation |
| MODIFY | any other test that renders `PurchaseSheet`, e.g. `subscribe-card`/creator `page.test.tsx` (grep `PurchaseSheet\|subscribe-card\|post-grid` in `*.test.tsx`) | Wrap in `Toaster` |

**Testing:**
- `creator-posts.test.tsx`:
  - The premium tile still opens `getByRole('dialog', { name: 'Rahasia' })`.
  - The eyebrow `Post premium · Claudia Andreya`, the rows, and the "Lihat detail post" link are unchanged.
  - Clicking `Buka dengan 5 Koin` closes the dialog (`queryByRole('dialog')` is null) and shows `DEMO_PURCHASE_MESSAGE` as a toast.
  - The short-balance case is unchanged.
- `pnpm --filter @influency/web test` passes.

---

### TASK-006: Report form and comment-delete confirm as sheets, share toast, guidelines

**What to build**

1. **`apps/web/src/components/report-post-button.tsx`**
   - These states are unchanged: logged out → login link; `!viewer.canReport` → `null`.
   - Otherwise, render `<BottomSheet title="Laporkan postingan ini" open={open} onOpenChange={onOpenChange} trigger={<Button variant="ghost" size="sm" className="w-fit"><Flag …/>Laporkan</Button>} onCloseAutoFocus={…}>` containing the existing form.
   - **Form changes:**
     - Remove the outer `border p-4` card.
     - The legend becomes `Alasan`, and its focus effect is removed (the sheet manages focus).
     - Submit stays primary at full width.
     - **Batal** → `setOpen(false)`.
   - **On close:** `onOpenChange(false)` resets `error` (keep `reason`/`note` so an accidental swipe doesn't lose input).
   - **On success:**
     - `setSent(true); setOpen(false); toast('Terima kasih, laporan Anda akan ditinjau.')`.
     - When `sent`, render `<p ref={statusRef} tabIndex={-1} className="text-sm text-muted-foreground">Laporan terkirim.</p>` in place of the trigger.
     - `onCloseAutoFocus`: if `sent`, call `e.preventDefault(); statusRef.current?.focus()`. Because the trigger is gone, focus would otherwise drop to the body.
     - Note: no `role="status"` on the paragraph; the toast already announces.
2. **`apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/post-comments.tsx`**
   - Remove `window.confirm`. Add `const [confirmId, setConfirmId] = useState<string | null>(null)`.
   - The Hapus button calls `setConfirmId(c.id)`.
   - Render one sheet:

     ```tsx
     <BottomSheet title="Hapus komentar ini?" description="Komentar akan dihapus dan tidak bisa dikembalikan." open={confirmId !== null} onOpenChange={(o) => { if (!o) setConfirmId(null); }}>
     ```

     Its body holds `<Button variant="destructive" disabled={pending} onClick={() => { const id = confirmId; setConfirmId(null); if (id) void remove(id); }}>Hapus</Button>` and `<Button variant="outline" onClick={() => setConfirmId(null)}>Batal</Button>`, both full width.
   - `remove(id)` drops its confirm line; everything else is unchanged.
3. **`apps/web/src/app/(public)/[creatorSlug]/share-button.tsx`**
   - After a successful clipboard write, call `toast('Tautan disalin')` in addition to `setCopied(true)`.
   - The native `navigator.share` path doesn't toast, because the OS sheet is the feedback.
4. **Guidelines**
   - `.agile/guidelines/frontend.md` (Styling and UX): add one bullet. "Sheets and dialogs on user-facing pages use `BottomSheet` (`components/ui/bottom-sheet.tsx`). Short confirmations use `useToast()` (`components/ui/toast.tsx`, `Toaster` is mounted in the root layout). Never use `window.confirm`/`alert` outside `/admin`."
   - `.agile/guidelines/codebase-map.md`: add `BottomSheet`, `Toaster`/`useToast`, `useKeyboardInset` and the `--bottom-nav-height` variable to the web components/theme section.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/components/report-post-button.tsx` | Report form in a sheet + toast |
| MODIFY | `apps/web/src/components/report-post-button.test.tsx` | Sheet flow, wrap in `Toaster` |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/post-comments.tsx` | Confirm sheet |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/post-comments.test.tsx` | Sheet confirm instead of `stubGlobal('confirm')` |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/share-button.tsx` | Toast on copy |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/page.test.tsx`, creator `page.test.tsx` (if they render these components) | Wrap in `Toaster` |
| MODIFY | `.agile/guidelines/frontend.md` | Sheet/toast rule |
| MODIFY | `.agile/guidelines/codebase-map.md` | New components |

**Testing:**
- `report-post-button.test.tsx`: keep every existing case, adapted to the sheet.
  - Logged out → link. Cannot report → nothing.
  - Clicking **Laporkan** opens `dialog` named "Laporkan postingan ini".
  - A reason is needed, plus a note for Lainnya.
  - A successful POST closes the dialog, shows the toast "Terima kasih, laporan Anda akan ditinjau.", renders "Laporan terkirim." and gives that paragraph focus.
  - An API error message shows inside the sheet.
  - **Batal** closes the sheet, and focus returns to **Laporkan**.
- `post-comments.test.tsx`: the "deletes only deletable comments, after confirmation" test now clicks **Hapus komentar** → the dialog "Hapus komentar ini?" → **Hapus**, and the DELETE is sent. Add a case: **Batal** sends no DELETE and keeps the comment.
- Share: a small test (new `share-button.test.tsx`). Stub `navigator.clipboard.writeText` resolving and `navigator.share` undefined; clicking shows the toast "Tautan disalin".
- `grep -rn "window.confirm\|window.alert" apps/web/src --include=*.tsx | grep -v /admin/` returns nothing.
- `pnpm check` passes.

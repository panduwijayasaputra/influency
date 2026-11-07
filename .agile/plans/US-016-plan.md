# Technical Plan: US-016 — Comment Actions Menu (edit, delete, pin)

## Architecture Overview

A `···` menu on each comment and reply, replacing today's standalone Hapus button. The menu items are driven only by server permission flags.

Decisions agreed with the user (2026-11-07):

- **Flags come from the API now.** The shared schema gets two **required** booleans next to `canDelete`. The API's `toComment` fills them for the current viewer:
  - `canEdit`: the viewer is the comment's author.
  - `canPin`: the viewer owns the post, and the item is a top-level comment. Every comment is top-level until US-017 adds replies, and US-017 must send `canPin: false` on replies.
  - `canDelete`: unchanged (author or post owner). Admin Hapus arrives with US-021, because the delete API rejects admins today. US-021 must extend `canDelete` to admins.
- **Menu = Radix `DropdownMenu`** (from the installed `radix-ui` 1.8.1; no new dependency).
  - Its content is styled as S07's horizontal row of pills, anchored under `···` (`side="bottom" align="start"`). It floats instead of pushing the content down.
  - Radix provides `role="menu"` / `menuitem`, arrow keys, typeahead, focus return to the trigger, and layered Escape: Esc closes only the menu, not the comments sheet. A hand-built inline menu would close the whole sheet, because the sheet's Escape listener is document-level.
- **Edit** opens an inline editor in the row (Textarea, `n/500` counter, Simpan / Batal). Until US-019:
  - Simpan shows the toast "Segera hadir" and keeps the editor open with the draft.
  - No PATCH client is pre-wired; US-019 wires Simpan itself.
- **Sematkan / Lepas sematan** shows the toast "Segera hadir" until US-020. The label depends on `comment.pinned`.
- **Hapus** reuses the existing confirm `BottomSheet` and `remove()` in `PostComments` (`onDelete(id)`). No new confirm UI and no API change for delete.

## Dependencies

- None new. `DropdownMenu` comes from `radix-ui` (`import { DropdownMenu } from 'radix-ui'`, the same package as the `Dialog` used by `bottom-sheet.tsx`). Icon: `Ellipsis` from `lucide-react`.
- Rebuild shared after TASK-113 (`pnpm --filter @influency/shared build`) before running web/api tests directly.

## Risks

- **Required flags break every typed `PostComment` fixture** (web tests: `post-comments.test.tsx`, `comment-thread.test.tsx`, `comments-sheet.test.tsx`, `post-card.test.tsx`, `posts/[postId]/page.test.tsx`; shared `comments.test.ts`).
  - Mitigation: TASK-113 adds `canEdit: false, canPin: false` to each, or `true` where a test needs it. `pnpm typecheck` finds them all.
- **Client-side guessing of permissions:** forbidden by the AC.
  - Mitigation: the UI reads only `canEdit` / `canDelete` / `canPin`. The only UI-side guard is `!reply` for pin, which can only hide an item, never add one.
- **Radix menu inside the Radix Dialog sheet** (portal and z-index):
  - Mitigation: render `DropdownMenu.Portal` so it is not clipped by the sheet's scroll area, and give the content a z-index above the sheet panel. Check the sheet's z class in `bottom-sheet.tsx` and use the same or higher.
  - Test that Esc closes the menu and the sheet stays open.
- **Focus after Hapus:** the confirm sheet opens while the menu closes.
  - Mitigation: Radix returns focus to `···` when the menu closes, and the BottomSheet then returns focus to that element when it closes. A test asserts focus is on `···` after Batal.
- **Deleted placeholder leaking actions:** `removeComment` must also set `canEdit: false, canPin: false`, and the deleted branch of `CommentItem` already renders no actions.

## Tasks

### TASK-113: canEdit and canPin flags (shared schema + API)

**What to build**

1. **`packages/shared/src/comments.ts`.** In `postReplySchema`, next to `canDelete`, add:
   ```ts
   /** Server-side edit rule for the current viewer: the comment's author only (creators/admins never edit others). */
   canEdit: z.boolean(),
   /** Server-side pin rule for the current viewer: the post owner, top-level comments only (replies send false). */
   canPin: z.boolean(),
   ```
   Both are required. Update the `canDelete` doc comment to mention that admins are added by US-021.

2. **`apps/api/src/modules/engagement/post-comments.service.ts`.** Change `toComment` so it computes all the flags from the viewer, instead of taking a precomputed `canDelete`:
   ```ts
   /** Never exposes user ids. Flags are for the current viewer (null = anonymous). */
   function toComment(row: CommentRow, viewerId: string | null, ownerUserId: string): PostComment {
     const isAuthor = viewerId !== null && row.userId === viewerId;
     const isOwner = viewerId !== null && ownerUserId === viewerId;
     return { ...,
       canDelete: isAuthor || isOwner,
       canEdit: isAuthor,
       canPin: isOwner, // shortcut: every comment is top-level until US-017; it must pass false for replies.
     };
   }
   ```
   - `list`: `toComment(row, userId, ownerUserId)`.
   - `create`: use the `ownerUserId` that `gate` already returns: `const { ownerUserId } = await this.gate(...)`, then `toComment(row, userId, ownerUserId)`.
   - No other behaviour changes. The controller's `no-store` comment already covers viewer-dependent fields; extend it to "canDelete/canEdit/canPin".

3. **Fixtures.** Add `canEdit` / `canPin` to every typed `PostComment` / `PostReply` fixture that `pnpm typecheck` flags (see Risks). In `post-comments.tsx` `removeComment`, add `canEdit: false, canPin: false` to the placeholder object.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/comments.ts` | `canEdit`, `canPin` |
| MODIFY | `packages/shared/src/comments.test.ts` | Fixtures + a missing-flag rejection case |
| MODIFY | `apps/api/src/modules/engagement/post-comments.service.ts` | `toComment(row, viewerId, ownerUserId)` |
| MODIFY | `apps/api/src/modules/engagement/post-comments.controller.ts` | Comment wording only |
| MODIFY | `apps/api/src/modules/engagement/post-comments.integration.spec.ts` | Flag cases |
| MODIFY | `apps/web/src/components/comments/post-comments.tsx` | Placeholder flags in `removeComment` |
| MODIFY | web test files listed in Risks | Fixture flags |

**Testing:**

- Shared: a comment without `canEdit` or `canPin` is rejected; the full fixture parses.
- API integration (extend the existing `canDelete is the author or the post owner` case, same seeded users and posts):
  - **Author (fanA)** listing: own comment `canEdit: true, canPin: false`; other's comment `canEdit: false`.
  - **Post owner (creator)** listing: `canPin: true` on every comment, and `canEdit: false` on fans' comments (moderation never grants edit).
  - **Anonymous:** all three flags false.
  - **Create:**
    - a fan's new comment has `canEdit: true, canPin: false`
    - the creator commenting on their own post gets `canEdit: true, canPin: true`

---

### TASK-114: CommentActionsMenu component

**What to build**

**`apps/web/src/components/comments/comment-actions-menu.tsx`** (`'use client'`):

```ts
export function CommentActionsMenu(props: {
  authorName: string;
  reply: boolean;              // label wording; pin hidden for replies
  canEdit: boolean;
  canDelete: boolean;
  canPin: boolean;
  pinned: boolean;
  disabled?: boolean;          // pending request: trigger disabled
  onEdit: () => void;
  onDelete: () => void;
  onPin: () => void;
}): JSX.Element | null
```

- **Items, in this order** (S07):
  1. `Edit` if `canEdit`
  2. `Hapus` if `canDelete`, with destructive styling
  3. `Sematkan` / `Lepas sematan` (by `pinned`) if `canPin && !reply`
- **No items → return `null`** (no trigger at all).
- **Trigger:** `DropdownMenu.Trigger asChild` on a `<button type="button">` with:
  - an `Ellipsis` icon (`aria-hidden`), 44px tap target (`min-h-11 min-w-11`)
  - `aria-label`: ``Aksi lainnya untuk komentar ${authorName}``, or ``… balasan ${authorName}`` when `reply`
  - Radix sets `aria-haspopup="menu"` and `aria-expanded`
  - the open state gets the `bg-muted` background (S07 `menuBg`)
- **Content:**
  - `DropdownMenu.Portal` > `DropdownMenu.Content side="bottom" align="start" sideOffset={4} aria-label="Aksi komentar"` (or `"Aksi balasan"`)
  - classes: `z-[N] flex flex-wrap gap-1.5 rounded-xl bg-background p-1.5 shadow-md`, where z sits above the BottomSheet panel (read its z class)
  - set `loop` on Content so arrow keys wrap. Radix menus move with Up/Down; also map Left/Right for the horizontal row if Radix's `dir`/orientation does not (check, and keep it minimal)
- **Items:** `DropdownMenu.Item onSelect={...}`. Pill classes: `h-9 rounded-[10px] px-3 text-[13px] font-bold`.
  - neutral: `bg-muted text-foreground`
  - destructive: `bg-destructive/10 text-destructive`
  - `data-[highlighted]:ring-2 ring-ring` for keyboard focus
  - Use the design tokens in `globals.css`, never S07's raw hex.
- **Focus:** Radix returns focus to the trigger on close. Leave the default `onCloseAutoFocus`, except for Edit: call `e.preventDefault()` so the editor's textarea can take focus. Simplest: the parent passes a flag, or the menu keeps a ref of the last selected action and prevents default only for edit.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/components/comments/comment-actions-menu.tsx` | The menu |
| CREATE | `apps/web/src/components/comments/comment-actions-menu.test.tsx` | Tests |

**Testing** (Vitest + Testing Library + `userEvent`. Radix menus open on pointerdown or keyboard; use `userEvent.click` or Enter on the trigger):

- All flags false: renders nothing (no `···` button).
- Author only (`canEdit`, `canDelete`): items exactly `Edit`, `Hapus`.
- Post owner on a fan's comment (`canDelete`, `canPin`): `Hapus`, `Sematkan`. With `pinned` it reads `Lepas sematan`.
- `canPin` with `reply`: no pin item.
- The trigger has the aria-label and `aria-haspopup="menu"`, and `aria-expanded` toggles. The open menu has `role="menu"` with `menuitem`s.
- Keyboard: Enter opens with focus on the first item, ArrowDown moves, Escape closes, and focus returns to the trigger.
- Selecting each item calls its callback once and closes the menu.
- `disabled`: the trigger is disabled.

---

### TASK-115: Wire the menu and inline editor into CommentItem

**What to build**

In **`apps/web/src/components/comments/comment-item.tsx`**:

1. **Replace the `Hapus` `<Button>`** in the actions row with `<CommentActionsMenu>`, placed after Balas (S07 order: like, Balas, `···`).
   - Pass the flags from `comment`, `pinned={'pinned' in comment && comment.pinned === true}`, `reply`, and `disabled={pending}`.
   - `onDelete={() => onDelete(comment.id)}`: the existing confirm sheet in `PostComments`.
   - `onPin={() => toast('Segera hadir')}`. US-020 wires it.
   - `onEdit={() => { setDraft(comment.body); setEditing(true); }}`.
2. **Inline editor.** Local state `editing: boolean`, `draft: string`. While `editing`, the body `<p>` is replaced by a `<form>`:
   - `<Label htmlFor={`edit-${comment.id}`} className="sr-only">`, reading "Edit komentar" or "Edit balasan".
   - `Textarea id=edit-{id}`, `maxLength={POST_COMMENT_MAX_LENGTH}`, `autoFocus`, `value={draft}`. Match the composer's Textarea styling in `post-comments.tsx`.
   - A row: `{draft.length}/{POST_COMMENT_MAX_LENGTH}` muted counter, then `Batal` (`variant="outline"`, closes the editor without saving) and `Simpan` (`type="submit"`, disabled when `draft.trim() === ''`).
   - **Submit:** `toast('Segera hadir')`. The editor stays open and the draft is kept. Comment it as `// US-019 wires this to the edit API; on failure the draft must stay.`
   - **Batal** returns focus to the `···` trigger. A ref on the trigger is fine: forward one through `CommentActionsMenu` (`triggerRef` prop), or query it inside the row.
   - While editing, hide the actions row (S07 shows the editor in place of the text).
3. **Deleted rows** are unchanged: the placeholder branch renders no menu.
4. **Remove** the now-unused `Button` import if nothing else uses it.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/components/comments/comment-item.tsx` | Menu + inline editor |
| MODIFY | `apps/web/src/components/comments/comment-thread.test.tsx` | Row-level cases |
| MODIFY | `apps/web/src/components/comments/post-comments.test.tsx` | Delete now goes through the menu |
| (check) | `apps/web/src/components/comments/comments-sheet.test.tsx`, `post-card.test.tsx`, `posts/[postId]/page.test.tsx` | Any test that clicked "Hapus komentar" now opens `···` first |

**Testing** (`{ wrapper: Toaster }`, real-looking fixtures):

- A viewer with no flags sees no `···` (fan on someone else's comment).
- Author:
  - Edit opens the editor prefilled with the body, focused, with counter `n/500`
  - typing updates the counter
  - Simpan shows "Segera hadir", and the editor and draft are still there
  - Batal closes the editor, the original text shows, and focus is on `···`
  - Simpan is disabled for a whitespace-only draft
- Hapus via the menu opens the existing confirm sheet:
  - confirming calls DELETE and keeps the US-015 behaviour: placeholder with replies, removal without, `onCountChange(-1)`
  - Batal leaves the comment and focus is on `···`
- Creator: Sematkan shows "Segera hadir"; a pinned comment shows "Lepas sematan"; a reply row has no pin item.
- Esc in an open menu inside `CommentsSheet` closes the menu only, and the sheet stays open (`comments-sheet.test.tsx`).
- The deleted placeholder has no `···`, even if the fixture carries `canEdit/canDelete/canPin: true`.

# US-054: Post Baru / Edit Post Form UI

**Status:** ready_for_uat
**Priority:** high
**Feature:** creator-studio

## Description

As an approved creator, I want one screen to add media, write a caption, choose Gratis or Premium and set a price, so that I can publish a post without moving between sections.

## Acceptance Criteria

- [ ] "Post Baru" on my own profile's Postingan tab opens the form in new mode ("Post Baru", button "Publikasikan"). "Edit" in my post's menu opens it in edit mode ("Edit post", button "Simpan"). Non-owners and non-creators never see either entry, and the studio gate still guards the routes.
- [ ] Media: thumbnails with a `n / 5` counter, add photo/video (disabled at 5 with the message "Maksimal 5 foto atau video per post."), a large preview of the selected item with "Sampul" on the first one, move left/right, remove, and upload/processing/failed states from the existing media API. Publishing without media shows "Tambahkan minimal 1 foto atau video." Reordering uses a dummy order until US-059.
- [ ] Caption with a character count up to `POST_CAPTION_MAX_LENGTH`. Gratis/Premium segmented control; Premium shows a price field (whole number, 5–1,000 Koin) with the help text "≈ Rp{price×1.000} per unlock · kamu terima ≈ Rp{price×800} setelah biaya platform 20%", or the error "Masukkan angka bulat 5–1.000 Koin."
- [ ] Publish/Save calls the existing posts, media, cover, offer and publish endpoints in order. API errors show inline or as a toast without losing the form. Success shows the toast "Post dipublikasikan" or "Perubahan disimpan" and returns to my profile.
- [ ] Live posts follow the existing rules: locked fields are shown read-only with a short reason. A price change shows "Harga baru berlaku untuk pembelian berikutnya."
- [ ] Light Social tokens, 44px touch targets, keyboard-reachable reorder (not drag-only), labels on every input. Component tests cover validation, the 5-item limit, the price helper and both modes.

## Tasks

### TASK-198: PostEditor form, validation and save flow
**Status:** done

### TASK-199: PostEditor media strip (upload, preview, reorder, remove)
**Status:** done

### TASK-200: Entry points (Post Baru, Edit) and the drafts list
**Status:** done

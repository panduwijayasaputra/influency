# QA Report: TASK-111 — Comment like client and CommentLikeButton

**Result:** PASS

## Review
- `setCommentLike` never throws and returns null on any failure, so the endpoint not existing yet (before US-018) only rolls back. It sends no body and no ids besides the path.
- The like toggle is optimistic and rolls back to the state before the tap. The button is disabled while pending, so a double tap sends one request.
- Before the API sends `likeCount`, the heart says "Segera hadir" and sends nothing. A guest gets a login link to `loginHref(path)`, a same-origin relative path.
- The server remains the authority: the API decides who may like. The UI does not guess access.
- Not covered: the client uses `POST` / `DELETE` on `/posts/:postId/comments/:commentId/likes`. US-018 must implement exactly that path and the `{ liked, likeCount }` response.

## Tests
- Client: POST/DELETE method and URL, parsed result, null on a 404, 500, network error and malformed body.
- Button: guest link, not-live toast without fetch, optimistic flip then the server's value, un-like with DELETE, rollback with a failure toast.

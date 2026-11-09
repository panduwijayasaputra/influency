import { z } from 'zod';

/** In-app notification events (discover-notifications-settings US-071/US-072). The list is configurable, not final. */
export const NOTIFICATION_TYPES = [
  'NEW_POST',
  'COMMENT_REPLY',
  'COMMENT_LIKE',
  'TOPUP_CREDITED',
  'SUBSCRIPTION_ENDING',
  'NEW_SUBSCRIBER',
  'POST_UNLOCKED',
  'TIP_RECEIVED',
  'PAYOUT_STATUS',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Notifications per page. */
export const NOTIFICATIONS_PAGE_SIZE = 20;

/** One notification. The API builds `text` and `href`; the web app renders them as given. */
export const notificationItemSchema = z.object({
  id: z.uuid(),
  type: z.enum(NOTIFICATION_TYPES),
  /** Shown in bold before `text`; null for system notifications (top-up, reminders). */
  actor: z.object({ displayName: z.string(), avatarUrl: z.string().nullable() }).nullable(),
  text: z.string(),
  /** Same-origin relative path. */
  href: z.string().startsWith('/'),
  createdAt: z.string(),
  read: z.boolean(),
});
export type NotificationItem = z.infer<typeof notificationItemSchema>;

/** GET /me/notifications. `nextCursor` is opaque; null = end. */
export const notificationsPageSchema = z.object({
  items: z.array(notificationItemSchema),
  nextCursor: z.string().nullable(),
});
export type NotificationsPage = z.infer<typeof notificationsPageSchema>;

/** GET /me/notifications/unread-count. */
export const unreadCountSchema = z.object({ count: z.int().min(0) });
export type UnreadCount = z.infer<typeof unreadCountSchema>;

/** POST /me/notifications/read: marks the caller's notifications up to and including this one as read. */
export const markNotificationsReadSchema = z.object({ upToId: z.uuid() }).strict();
export type MarkNotificationsReadInput = z.infer<typeof markNotificationsReadSchema>;

/** Pengaturan toggles (US-068/US-073). `earnings` is null for users who aren't approved creators. */
export const notificationPreferencesSchema = z.object({
  newPost: z.boolean(),
  commentReply: z.boolean(),
  commentLike: z.boolean(),
  subscriptionReminder: z.boolean(),
  earnings: z.boolean().nullable(),
  telegram: z.object({
    /** unavailable = no bot configured; not_connected = no chat linked yet. */
    status: z.enum(['unavailable', 'not_connected', 'connected']),
    allowed: z.boolean(),
  }),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

/** PUT /me/notification-preferences: any subset of the toggles. */
export const updateNotificationPreferencesSchema = z
  .object({
    newPost: z.boolean(),
    commentReply: z.boolean(),
    commentLike: z.boolean(),
    subscriptionReminder: z.boolean(),
    earnings: z.boolean(),
    telegramAllowed: z.boolean(),
  })
  .partial()
  .strict();
export type UpdateNotificationPreferencesInput = z.infer<
  typeof updateNotificationPreferencesSchema
>;

/** Defaults for a user who never changed anything (likes on comments start off). */
export const NOTIFICATION_PREFERENCE_DEFAULTS = {
  newPost: true,
  commentReply: true,
  commentLike: false,
  subscriptionReminder: true,
  earnings: true,
} as const;

/** POST /me/telegram/link (US-074): open `url` in Telegram and press Start; the link works once, until `expiresAt`. */
export const telegramLinkResponseSchema = z.object({
  url: z.url({ protocol: /^https$/ }),
  expiresAt: z.string(),
});
export type TelegramLinkResponse = z.infer<typeof telegramLinkResponseSchema>;

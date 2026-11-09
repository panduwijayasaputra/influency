import type {
  NotificationPreferences,
  NotificationType,
  UpdateNotificationPreferencesInput,
} from '@influency/shared';

type Toggle = Exclude<keyof NotificationPreferences, 'telegram'>;

/** Which notification types each Pengaturan toggle turns on or off (US-073). Transactional types have no toggle. */
export const TOGGLE_TYPES: Record<Toggle, readonly NotificationType[]> = {
  newPost: ['NEW_POST'],
  commentReply: ['COMMENT_REPLY'],
  commentLike: ['COMMENT_LIKE'],
  subscriptionReminder: ['SUBSCRIPTION_ENDING'],
  earnings: ['NEW_SUBSCRIBER', 'POST_UNLOCKED', 'TIP_RECEIVED'],
};

/** Toggle state from stored opt-outs; `earnings` is null for users who aren't approved creators. */
export function toToggles(
  optOut: readonly NotificationType[],
  isCreator: boolean,
): Omit<NotificationPreferences, 'telegram'> {
  const on = (t: Toggle) => !TOGGLE_TYPES[t].some((type) => optOut.includes(type));
  return {
    newPost: on('newPost'),
    commentReply: on('commentReply'),
    commentLike: on('commentLike'),
    subscriptionReminder: on('subscriptionReminder'),
    earnings: isCreator ? on('earnings') : null,
  };
}

/** New opt-out list after a patch (sorted, no duplicates). `telegramAllowed` is not an opt-out and is ignored here. */
export function applyPatch(
  optOut: readonly NotificationType[],
  patch: UpdateNotificationPreferencesInput,
): NotificationType[] {
  const next = new Set(optOut);
  for (const toggle of Object.keys(TOGGLE_TYPES) as Toggle[]) {
    const value = patch[toggle];
    if (value === undefined) continue;
    for (const type of TOGGLE_TYPES[toggle]) {
      if (value) next.delete(type);
      else next.add(type);
    }
  }
  return [...next].sort();
}

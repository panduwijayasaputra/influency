import {
  API_PREFIX,
  type NotificationPreferences,
  notificationPreferencesSchema,
  type TelegramLinkResponse,
  telegramLinkResponseSchema,
  type UpdateNotificationPreferencesInput,
} from '@influency/shared';

const PATH = `/${API_PREFIX}/me/notification-preferences`;

/** My notification toggles. */
export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  const res = await fetch(PATH, { credentials: 'include' });
  if (!res.ok) throw new Error(`GET /me/notification-preferences failed: ${res.status}`);
  return notificationPreferencesSchema.parse(await res.json());
}

/** Saves a subset of the toggles and returns the new state. */
export async function updateNotificationPreferences(
  patch: UpdateNotificationPreferencesInput,
): Promise<NotificationPreferences> {
  const res = await fetch(PATH, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`PUT /me/notification-preferences failed: ${res.status}`);
  return notificationPreferencesSchema.parse(await res.json());
}

/** A one-time link to the official bot; opening it and pressing Start connects Telegram (US-074). */
export async function connectTelegram(): Promise<TelegramLinkResponse> {
  const res = await fetch(`/${API_PREFIX}/me/telegram/link`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`POST /me/telegram/link failed: ${res.status}`);
  return telegramLinkResponseSchema.parse(await res.json());
}

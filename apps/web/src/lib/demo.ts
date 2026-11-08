// Dummy values for features not built yet, so the UI can show its final layout. Delete each once its story lands.

/** shortcut: fake plan until creator subscription plans exist (US-026); read the creator's plan from the API then. */
export const DEMO_SUBSCRIPTION = { priceCoins: 300, days: 30 };

/** Shown instead of buying: purchases (US-025, US-027) are not built yet. */
export const DEMO_PURCHASE_MESSAGE = 'Demo: pembelian dengan Koin belum tersedia.';

/** shortcut: fake "subscribed" state until creator subscriptions exist (US-026/027); read the viewer's subscription from the API then. */
export const DEMO_SUBSCRIBED = { slugs: ['creatorb'], daysLeft: 12 };

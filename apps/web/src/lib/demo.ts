// Dummy values for features not built yet, so the UI can show its final layout. Delete each once its story lands.

/** shortcut: fake wallet balance until the wallet exists (US-022); read it from GET /wallet then. */
export const DEMO_KOIN_BALANCE = 120;

/** shortcut: fake plan until creator subscription plans exist (US-026); read the creator's plan from the API then. */
export const DEMO_SUBSCRIPTION = { priceCoins: 300, days: 30 };

/** Shown instead of buying: purchases (US-025, US-027) are not built yet. */
export const DEMO_PURCHASE_MESSAGE = 'Demo: pembelian dengan Koin belum tersedia.';

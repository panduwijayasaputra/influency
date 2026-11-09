export const APP_NAME = 'Influency';

/** Global route prefix of the REST API (no leading slash, as NestJS expects). */
export const API_PREFIX = 'api/v1';

/** LOCKED (Monetization Spec v1 §2): creator subscription price bounds, Koin per 30 days. Here (a leaf) so creators.ts can use them without an import cycle. */
export const PLAN_PRICE_MIN = 10;
export const PLAN_PRICE_MAX = 5000;

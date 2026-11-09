/** Server-side only: where the web server reaches the API (browsers use the same-origin /api/v1 proxy). */
export const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';

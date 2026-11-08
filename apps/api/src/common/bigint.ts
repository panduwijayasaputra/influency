/** BigInt column → JSON number. Throws instead of silently losing precision above 2^53 − 1. */
export function toSafeInt(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`${value} does not fit a JS safe integer`);
  }
  return Number(value);
}

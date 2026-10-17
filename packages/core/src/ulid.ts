// ULID (https://github.com/ulid/spec), Zufallsquelle wird injiziert.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type RandomSource = (bytes: Uint8Array) => void;

export const defaultRandom: RandomSource = (bytes) => {
  const c = (globalThis as { crypto?: { getRandomValues(b: Uint8Array): void } }).crypto;
  if (!c) throw new Error("Keine Zufallsquelle verfügbar");
  c.getRandomValues(bytes);
};

export function ulid(timeMs: number, random: RandomSource = defaultRandom): string {
  let time = "";
  let t = Math.floor(timeMs);
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = new Uint8Array(16);
  random(bytes);
  let rand = "";
  for (let i = 0; i < 16; i++) rand += ALPHABET[bytes[i]! % 32];
  return time + rand;
}

export function isUlid(s: unknown): s is string {
  return typeof s === "string" && /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(s);
}

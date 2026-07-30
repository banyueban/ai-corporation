import { randomBytes } from "node:crypto";

const MAX_TIMESTAMP = 0xffff_ffff_ffff;

export function createUuidV7(options?: {
  readonly now?: () => number;
  readonly random?: (size: number) => Uint8Array;
}): string {
  const timestamp = Math.trunc((options?.now ?? Date.now)());
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    timestamp > MAX_TIMESTAMP
  ) {
    throw new Error("UUID timestamp is unavailable");
  }

  const random = (options?.random ?? randomBytes)(10);
  if (random.length !== 10) {
    throw new Error("UUID randomness is unavailable");
  }

  const bytes = new Uint8Array(16);
  let remaining = timestamp;
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = remaining % 256;
    remaining = Math.floor(remaining / 256);
  }
  bytes.set(random, 6);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hexadecimal = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return [
    hexadecimal.slice(0, 8),
    hexadecimal.slice(8, 12),
    hexadecimal.slice(12, 16),
    hexadecimal.slice(16, 20),
    hexadecimal.slice(20),
  ].join("-");
}

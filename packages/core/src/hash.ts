// SHA-256 über den UTF-8-Text (plattformfrei, auch unter Hermes).
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export function hashText(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(text)));
}

export function hashBytes(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

/**
 * @file pin.ts
 * @description PIN hashing for PinUser (AUDIT_REPORT.md §11). Uses Node's
 * built-in crypto.scrypt — no new dependency — so 6-digit PINs are never
 * stored in plaintext even though this is still mock-tier auth overall.
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const KEY_LENGTH = 64;

export function hashPin(pin: string): { pinHash: string; pinSalt: string } {
  const pinSalt = randomBytes(16).toString('hex');
  const pinHash = scryptSync(pin, pinSalt, KEY_LENGTH).toString('hex');
  return { pinHash, pinSalt };
}

export function verifyPin(pin: string, pinHash: string, pinSalt: string): boolean {
  const candidate = scryptSync(pin, pinSalt, KEY_LENGTH);
  const stored = Buffer.from(pinHash, 'hex');
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

export function isValidSixDigitPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{6}$/.test(pin);
}

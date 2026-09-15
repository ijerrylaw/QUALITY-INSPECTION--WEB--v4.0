/**
 * @file wipeGate.test.ts
 * @description Coverage for the production wipe-gate override (CHANGELOG §74).
 *
 * The substantive thing under test is fail-closed parsing: in production the
 * wipe routes open ONLY for the exact string `true`. A looser parse (truthy,
 * case-insensitive, `1`) would turn a typo or a half-remembered value into an
 * open data-wipe endpoint, so each near-miss is asserted explicitly.
 */

import { describe, it, expect } from 'vitest';
import { areWipeRoutesBlocked, isWipeAllowedInProduction } from '../wipeGate';

describe('isWipeAllowedInProduction', () => {
  it('is true only for the exact lowercase string "true"', () => {
    expect(isWipeAllowedInProduction({ ALLOW_WIPE_IN_PRODUCTION: 'true' })).toBe(true);
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['false', 'false'],
    ['uppercase TRUE', 'TRUE'],
    ['capitalised True', 'True'],
    ['1', '1'],
    ['yes', 'yes'],
    ['padded " true"', ' true'],
  ])('is false when %s', (_label, value) => {
    const env = value === undefined ? {} : { ALLOW_WIPE_IN_PRODUCTION: value };
    expect(isWipeAllowedInProduction(env)).toBe(false);
  });
});

describe('areWipeRoutesBlocked', () => {
  it('blocks in production when the override is absent', () => {
    expect(areWipeRoutesBlocked({ NODE_ENV: 'production' })).toBe(true);
  });

  it('blocks in production when the override is explicitly false', () => {
    expect(areWipeRoutesBlocked({ NODE_ENV: 'production', ALLOW_WIPE_IN_PRODUCTION: 'false' })).toBe(true);
  });

  it('blocks in production when the override is a near-miss spelling', () => {
    expect(areWipeRoutesBlocked({ NODE_ENV: 'production', ALLOW_WIPE_IN_PRODUCTION: 'TRUE' })).toBe(true);
  });

  it('unblocks in production only when the override is exactly "true"', () => {
    expect(areWipeRoutesBlocked({ NODE_ENV: 'production', ALLOW_WIPE_IN_PRODUCTION: 'true' })).toBe(false);
  });

  it('never blocks outside production, override or not (unchanged behaviour)', () => {
    expect(areWipeRoutesBlocked({})).toBe(false);
    expect(areWipeRoutesBlocked({ NODE_ENV: 'development' })).toBe(false);
    expect(areWipeRoutesBlocked({ NODE_ENV: 'development', ALLOW_WIPE_IN_PRODUCTION: 'false' })).toBe(false);
    expect(areWipeRoutesBlocked({ NODE_ENV: 'development', ALLOW_WIPE_IN_PRODUCTION: 'true' })).toBe(false);
  });

  it('treats a non-exact NODE_ENV as non-production, matching server.ts', () => {
    // Pre-existing semantics, pinned here so this helper can't quietly diverge
    // from every other NODE_ENV check in the backend.
    expect(areWipeRoutesBlocked({ NODE_ENV: 'Production' })).toBe(false);
  });
});

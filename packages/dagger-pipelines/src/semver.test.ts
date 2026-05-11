import { expect, test } from 'vitest';

import { buildNextSemverVersion, resolveSemverBase } from './semver.js';

test('resolveSemverBase filters by prefix and finds latest tag', () => {
  const result = resolveSemverBase({
    tags: ['v1.0.0', 'app-2.0.0', 'app-1.5.0'],
    prefix: 'app-'
  });

  expect(result).toEqual({
    baseTag: 'app-2.0.0',
    prefix: 'app-'
  });
});

test('resolveSemverBase defaults to 0.0.0 when no matching tags exist', () => {
  const result = resolveSemverBase({
    tags: ['release-one']
  });

  expect(result).toEqual({
    baseTag: '0.0.0',
    prefix: ''
  });
});

test('resolveSemverBase prefers stable tag over prerelease with same numeric version', () => {
  const result = resolveSemverBase({
    tags: ['v1.2.3-beta.1', 'v1.2.3', 'v1.2.2'],
    prefix: 'v'
  });

  expect(result).toEqual({
    baseTag: 'v1.2.3',
    prefix: 'v'
  });
});

test('buildNextSemverVersion uses explicit base and optional empty prefix', () => {
  const result = buildNextSemverVersion({
    tags: ['v1.0.0'],
    base: '1.4.9',
    increment: 'minor',
    prefix: ''
  });

  expect(result).toBe('1.5.0');
});

test('buildNextSemverVersion applies increment with prefix', () => {
  const result = buildNextSemverVersion({
    tags: ['app-v1.9.9', 'app-v2.0.0'],
    prefix: 'app-v',
    increment: 'patch'
  });

  expect(result).toBe('app-v2.0.1');
});

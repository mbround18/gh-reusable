import { expect, test } from 'vitest';

import { computeCacheKey, detectBackend } from './cache-utils.js';

test('cache backend prefers s3 when configured', () => {
  expect(detectBackend({ S3_ENDPOINT: 'https://s3.example.test' })).toBe('s3');
  expect(detectBackend({ S3_ENDPOINT: '   ' })).toBe('github');
  expect(detectBackend({})).toBe('github');
});

test('cache key is deterministic and depends on pipeline inputs', () => {
  const key = computeCacheKey({
    pipelineName: 'publish-npm',
    lockfileHash: 'lock-a',
    sourceHash: 'src-a',
    gitCommit: 'commit-a',
    daggerEngineVersion: 'v0.20.8'
  });

  expect(key).toMatch(/^publish-npm\/[a-f0-9]{64}\.tar\.gz$/);
  expect(
    computeCacheKey({
      pipelineName: 'publish-npm',
      lockfileHash: 'lock-a',
      sourceHash: 'src-a',
      gitCommit: 'commit-a',
      daggerEngineVersion: 'v0.20.8'
    })
  ).toBe(key);
  expect(
    computeCacheKey({
      pipelineName: 'publish-npm',
      lockfileHash: 'lock-a',
      sourceHash: 'src-a',
      gitCommit: 'commit-b',
      daggerEngineVersion: 'v0.20.8'
    })
  ).not.toBe(key);
});

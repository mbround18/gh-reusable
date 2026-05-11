import { expect, test } from 'vitest';

import { resolveDockerReleasePublishAddress } from './docker-release-semver.js';

test('resolveDockerReleasePublishAddress applies semver increment from tags', () => {
  const result = resolveDockerReleasePublishAddress('docker.io/test/repo:latest', {
    DOCKER_RELEASE_TAGS: 'v1.0.0,v1.2.0,v1.1.9',
    DOCKER_RELEASE_SEMVER_PREFIX: 'v',
    DOCKER_RELEASE_SEMVER_INCREMENT: 'minor'
  });

  expect(result).toBe('docker.io/test/repo:v1.3.0');
});

test('resolveDockerReleasePublishAddress honors explicit semver base', () => {
  const result = resolveDockerReleasePublishAddress('docker.io/test/repo:latest', {
    DOCKER_RELEASE_SEMVER_BASE: 'app-2.4.9',
    DOCKER_RELEASE_SEMVER_PREFIX: 'app-',
    DOCKER_RELEASE_SEMVER_INCREMENT: 'patch',
    DOCKER_RELEASE_IMAGE: 'ghcr.io/example/repo'
  });

  expect(result).toBe('ghcr.io/example/repo:app-2.4.10');
});

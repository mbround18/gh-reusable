import { buildNextSemverVersion, type SemverIncrement } from './semver.js';

export type WorkflowEnvironment = Readonly<Record<string, string | undefined>>;

export function resolveDockerReleasePublishAddress(
  defaultAddress: string,
  environment: WorkflowEnvironment = process.env
): string {
  const image = environment.DOCKER_RELEASE_IMAGE ?? stripTag(defaultAddress);
  const increment = parseSemverIncrement(environment.DOCKER_RELEASE_SEMVER_INCREMENT ?? 'patch');
  if (!increment) {
    throw new Error(
      `Invalid DOCKER_RELEASE_SEMVER_INCREMENT: ${environment.DOCKER_RELEASE_SEMVER_INCREMENT}`
    );
  }

  const tags = (environment.DOCKER_RELEASE_TAGS ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

  const nextVersion = buildNextSemverVersion({
    tags,
    prefix: environment.DOCKER_RELEASE_SEMVER_PREFIX,
    base: environment.DOCKER_RELEASE_SEMVER_BASE,
    increment
  });

  return `${stripTag(image)}:${nextVersion}`;
}

function parseSemverIncrement(value: string): SemverIncrement | undefined {
  if (value === 'major' || value === 'minor' || value === 'patch') {
    return value;
  }

  return undefined;
}

function stripTag(address: string): string {
  const digestSeparator = address.indexOf('@');
  const withoutDigest = digestSeparator >= 0 ? address.slice(0, digestSeparator) : address;
  const lastColon = withoutDigest.lastIndexOf(':');
  const lastSlash = withoutDigest.lastIndexOf('/');

  if (lastColon > lastSlash) {
    return withoutDigest.slice(0, lastColon);
  }

  return withoutDigest;
}

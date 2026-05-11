export type SemverIncrement = 'major' | 'minor' | 'patch';

interface ParsedSemver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease?: string;
}

interface VersionCandidate {
  readonly tag: string;
  readonly version: ParsedSemver;
}

export interface ResolvedSemverBase {
  readonly baseTag: string;
  readonly prefix: string;
}

export interface ResolveSemverBaseInput {
  readonly tags: readonly string[];
  readonly prefix?: string;
  readonly base?: string;
}

export interface ResolveSemverVersionInput extends ResolveSemverBaseInput {
  readonly increment: SemverIncrement;
}

const SEMVER_PATTERN = /(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/;

export function resolveSemverBase(input: ResolveSemverBaseInput): ResolvedSemverBase {
  const normalizedTags = normalizeTags(input.tags);

  if (input.base) {
    return {
      baseTag: input.base,
      prefix: input.prefix ?? ''
    };
  }

  const inferredPrefix = inferPrefix(input.prefix, normalizedTags);
  const matchingTags = filterTagsByPrefix(normalizedTags, inferredPrefix);

  if (matchingTags.length === 0) {
    const fallbackPrefix = input.prefix !== undefined ? inferredPrefix : 'v';
    return {
      baseTag: `${fallbackPrefix}0.0.0`,
      prefix: fallbackPrefix
    };
  }

  const latest = findLatestTag(matchingTags, inferredPrefix);
  const resolvedPrefix = normalizePrefixForDashedTags(inferredPrefix, latest.tag);

  return {
    baseTag: latest.tag,
    prefix: resolvedPrefix
  };
}

export function buildNextSemverVersion(input: ResolveSemverVersionInput): string {
  const { baseTag, prefix } = resolveSemverBase(input);
  const parsed = parseTagAsSemver(baseTag, prefix);

  if (!parsed) {
    throw new Error(`Invalid semver: ${stripPrefix(baseTag, prefix)}`);
  }

  const incremented = incrementVersion(parsed, input.increment);
  return `${prefix}${formatSemver(incremented)}`;
}

export function normalizeTags(tags: readonly string[]): readonly string[] {
  return tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
}

export function filterTagsByPrefix(tags: readonly string[], prefix: string): readonly string[] {
  if (prefix.length === 0) {
    return [...tags];
  }

  return tags.filter((tag) => tag.startsWith(prefix));
}

function inferPrefix(prefix: string | undefined, tags: readonly string[]): string {
  if (prefix !== undefined) {
    return prefix;
  }

  if (tags.length > 0 && tags.every((tag) => tag.startsWith('v'))) {
    return 'v';
  }

  return '';
}

function normalizePrefixForDashedTags(prefix: string, tag: string): string {
  if (prefix.length === 0 || prefix.endsWith('-') || !tag.includes('-')) {
    return prefix;
  }

  const lastDash = tag.lastIndexOf('-');
  if (lastDash === -1) {
    return prefix;
  }

  const actualPrefix = tag.slice(0, lastDash + 1);
  return actualPrefix.startsWith(prefix) ? actualPrefix : prefix;
}

function findLatestTag(tags: readonly string[], prefix: string): VersionCandidate {
  const candidates = tags
    .map((tag) => {
      const parsed = parseTagAsSemver(tag, prefix);
      if (!parsed) {
        return undefined;
      }

      return {
        tag,
        version: parsed
      } satisfies VersionCandidate;
    })
    .filter((candidate): candidate is VersionCandidate => candidate !== undefined);

  if (candidates.length === 0) {
    return {
      tag: `${prefix}0.0.0`,
      version: { major: 0, minor: 0, patch: 0 }
    };
  }

  return candidates.sort(compareCandidates)[0];
}

function compareCandidates(left: VersionCandidate, right: VersionCandidate): number {
  if (left.version.major !== right.version.major) {
    return right.version.major - left.version.major;
  }

  if (left.version.minor !== right.version.minor) {
    return right.version.minor - left.version.minor;
  }

  if (left.version.patch !== right.version.patch) {
    return right.version.patch - left.version.patch;
  }

  const leftPrerelease = left.version.prerelease !== undefined;
  const rightPrerelease = right.version.prerelease !== undefined;

  if (leftPrerelease === rightPrerelease) {
    return 0;
  }

  return leftPrerelease ? 1 : -1;
}

function parseTagAsSemver(tag: string, prefix: string): ParsedSemver | undefined {
  const versionPart = stripPrefix(tag, prefix);
  const match = versionPart.match(SEMVER_PATTERN);

  if (!match) {
    return undefined;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]
  };
}

function stripPrefix(tag: string, prefix: string): string {
  if (prefix.length > 0 && tag.startsWith(prefix)) {
    return tag.slice(prefix.length);
  }

  return tag;
}

function incrementVersion(version: ParsedSemver, increment: SemverIncrement): ParsedSemver {
  if (increment === 'major') {
    return { major: version.major + 1, minor: 0, patch: 0 };
  }

  if (increment === 'minor') {
    return { major: version.major, minor: version.minor + 1, patch: 0 };
  }

  return { major: version.major, minor: version.minor, patch: version.patch + 1 };
}

function formatSemver(version: ParsedSemver): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

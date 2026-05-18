import { createHash } from "node:crypto"

export type CacheBackend = "s3" | "github"

export function detectBackend(environment: Readonly<Record<string, string | undefined>> = process.env): CacheBackend {
  return environment.S3_ENDPOINT?.trim() ? "s3" : "github"
}

export function computeCacheKey(input: {
  readonly pipelineName: string
  readonly lockfileHash: string
  readonly sourceHash: string
  readonly gitCommit: string
  readonly daggerEngineVersion: string
}): string {
  const cacheHash = createHash("sha256")
    .update(input.pipelineName)
    .update("\0")
    .update(input.lockfileHash)
    .update("\0")
    .update(input.sourceHash)
    .update("\0")
    .update(input.gitCommit)
    .update("\0")
    .update(input.daggerEngineVersion)
    .digest("hex")
  return `${input.pipelineName}/${cacheHash}.tar.gz`
}

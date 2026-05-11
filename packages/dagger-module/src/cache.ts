import { dag, type Container, type Directory } from "@dagger.io/dagger"
import * as actionsCache from "@actions/cache"
import { createHash, createHmac } from "node:crypto"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import * as tar from "tar"

export type CacheBackend = "s3" | "github"

export interface CacheMount {
  readonly path: string
  readonly archiveName: string
}

export interface CacheInputs {
  readonly pipelineName: string
  readonly source: Directory
  readonly sourcePatterns: readonly string[]
  readonly lockfilePatterns: readonly string[]
  readonly mounts: readonly CacheMount[]
  readonly environment?: Readonly<Record<string, string | undefined>>
}

export interface CacheResult {
  readonly container: Container
  readonly warnings: readonly string[]
}

export interface SaveResult {
  readonly warnings: readonly string[]
}

export class PipelineCache {
  private readonly backend: CacheBackend
  private readonly cacheKey: string
  private readonly restoreKeys: string[]

  private constructor(
    private readonly inputs: CacheInputs,
    backend: CacheBackend,
    cacheKey: string,
    restoreKeys: string[]
  ) {
    this.backend = backend
    this.cacheKey = cacheKey
    this.restoreKeys = restoreKeys
  }

  static async create(inputs: CacheInputs): Promise<PipelineCache> {
    const environment = inputs.environment ?? process.env
    const backend: CacheBackend = environment.S3_ENDPOINT?.trim() ? "s3" : "github"
    const lockfileHash = await hashMatchedFiles(inputs.source, inputs.lockfilePatterns)
    const sourceHash = await hashMatchedFiles(inputs.source, inputs.sourcePatterns)
    const commit = environment.GITHUB_SHA ?? "unknown-commit"
    const engine = environment.DAGGER_VERSION ?? environment.DAGGER_ENGINE_VERSION ?? "unknown-engine"
    const cacheHash = createHash("sha256")
      .update(inputs.pipelineName)
      .update("\0")
      .update(lockfileHash)
      .update("\0")
      .update(sourceHash)
      .update("\0")
      .update(commit)
      .update("\0")
      .update(engine)
      .digest("hex")
    const cacheKey = `${inputs.pipelineName}/${cacheHash}.tar.gz`
    const restoreKeys = [`${inputs.pipelineName}/`]
    return new PipelineCache(inputs, backend, cacheKey, restoreKeys)
  }

  get backendName(): CacheBackend {
    return this.backend
  }

  get key(): string {
    return this.cacheKey
  }

  async restore(container: Container): Promise<CacheResult> {
    const warnings: string[] = []
    let current = container
    for (const mount of this.inputs.mounts) {
      const volume = dag.cacheVolume(this.volumeKey(mount))
      current = current.withMountedCache(mount.path, volume)
    }

    const archive = await this.restoreArchive(warnings)
    if (archive) {
      current = current
        .withNewFile("/tmp/dagger-cache.tar.gz.b64", archive)
        .withExec([
          "sh",
          "-lc",
          "base64 -d /tmp/dagger-cache.tar.gz.b64 | tar -xzf - -C / && rm -f /tmp/dagger-cache.tar.gz.b64"
        ])
    }
    return { container: current, warnings }
  }

  async save(container: Container, shouldSave = true): Promise<SaveResult> {
    const warnings: string[] = []
    if (!shouldSave) {
      return { warnings }
    }

    const exportRoot = await mkdtemp(path.join(os.tmpdir(), `${this.inputs.pipelineName}-cache-`))
    try {
      for (const mount of this.inputs.mounts) {
        const exported = path.join(exportRoot, mount.archiveName)
        await mkdir(exported, { recursive: true })
        await container.directory(mount.path).export(exported, { wipe: true })
      }

      if (this.backend === "github") {
        try {
          await actionsCache.saveCache([exportRoot], this.cacheKey)
        } catch (error) {
          warnings.push(`GitHub cache upload failed for ${this.cacheKey}: ${error instanceof Error ? error.message : String(error)}`)
        }
        return { warnings }
      }

      await this.uploadToS3(exportRoot, warnings)
      return { warnings }
    } finally {
      await rm(exportRoot, { recursive: true, force: true })
    }
  }

  private async restoreArchive(warnings: string[]): Promise<string | null> {
    const extractRoot = await mkdtemp(path.join(os.tmpdir(), `${this.inputs.pipelineName}-restore-`))
    try {
      if (this.backend === "github") {
        const restored = await actionsCache.restoreCache([extractRoot], this.cacheKey, this.restoreKeys)
        if (!restored) {
          warnings.push(`Cache miss for ${this.cacheKey}`)
          await rm(extractRoot, { recursive: true, force: true })
          return null
        }
      }

      const tarball = this.backend === "github" ? path.join(os.tmpdir(), `${this.safeName(this.cacheKey)}.tar.gz`) : await this.downloadFromS3(warnings)
      if (!tarball) {
        await rm(extractRoot, { recursive: true, force: true })
        return null
      }

      if (this.backend === "github") {
        await tar.c({ cwd: extractRoot, gzip: true, portable: true, noMtime: true, file: tarball }, ["."])
      }
      const tarballContents = await readFile(tarball)
      await rm(tarball, { force: true })
      return tarballContents.toString("base64")
    } catch (error) {
      warnings.push(`Cache restore failed for ${this.cacheKey}: ${error instanceof Error ? error.message : String(error)}`)
      return null
    } finally {
      await rm(extractRoot, { recursive: true, force: true })
    }
  }

  private async downloadFromS3(warnings: string[]): Promise<string | null> {
    const endpoint = this.endpoint()
    if (!endpoint) {
      warnings.push(`Missing S3_ENDPOINT for ${this.cacheKey}`)
      return null
    }
    const objectUrl = this.objectUrl()
    const head = await this.s3Request("HEAD", objectUrl)
    if (head.status === 404) {
      warnings.push(`Cache miss for ${this.cacheKey}`)
      return null
    }
    if (!head.ok) {
      warnings.push(`S3 cache lookup failed for ${this.cacheKey}: ${head.status} ${head.statusText}`)
      return null
    }

    const get = await this.s3Request("GET", objectUrl)
    if (!get.ok) {
      warnings.push(`S3 cache download failed for ${this.cacheKey}: ${get.status} ${get.statusText}`)
      return null
    }

    const tarball = path.join(os.tmpdir(), `${this.safeName(this.cacheKey)}.tar.gz`)
    await writeFile(tarball, Buffer.from(await get.arrayBuffer()))
    return tarball
  }

  private async uploadToS3(exportRoot: string, warnings: string[]): Promise<void> {
    const endpoint = this.endpoint()
    if (!endpoint) {
      warnings.push(`Missing S3_ENDPOINT for ${this.cacheKey}`)
      return
    }

    const tarball = path.join(os.tmpdir(), `${this.safeName(this.cacheKey)}.tar.gz`)
    await tar.c({ cwd: exportRoot, gzip: true, portable: true, noMtime: true, file: tarball }, ["."])
    const body = await readFile(tarball)
    const objectUrl = this.objectUrl()
    const put = await this.s3Request("PUT", objectUrl, body)
    if (!put.ok) {
      warnings.push(`S3 cache upload failed for ${this.cacheKey}: ${put.status} ${put.statusText}`)
    }
    await rm(tarball, { force: true })
  }

  private volumeKey(mount: CacheMount): string {
    return `${this.backend}:${this.cacheKey}:${mount.archiveName}`
  }

  private endpoint(): string {
    return (this.inputs.environment ?? process.env).S3_ENDPOINT?.trim() ?? ""
  }

  private bucket(): string {
    return (this.inputs.environment ?? process.env).S3_BUCKET?.trim() || "viki-dagger-cache"
  }

  private region(): string {
    return (this.inputs.environment ?? process.env).S3_REGION?.trim() || "us-east-1"
  }

  private accessKey(): string {
    return (this.inputs.environment ?? process.env).S3_ACCESS_KEY?.trim() || ""
  }

  private secretKey(): string {
    return (this.inputs.environment ?? process.env).S3_SECRET_KEY?.trim() || ""
  }

  private objectUrl(): string {
    const endpoint = this.endpoint().replace(/\/$/, "")
    const bucket = this.bucket()
    const key = this.cacheKey.split("/").map(encodeURIComponent).join("/")
    return `${endpoint}/${bucket}/${key}`
  }

  private async s3Request(method: "HEAD" | "GET" | "PUT", url: string, body?: Buffer): Promise<Response> {
    const endpoint = new URL(url)
    const now = new Date()
    const amzDate = toAmzDate(now)
    const dateStamp = amzDate.slice(0, 8)
    const payloadHash = createHash("sha256").update(body ?? Buffer.alloc(0)).digest("hex")
    const headers = new Headers()
    headers.set("host", endpoint.host)
    headers.set("x-amz-content-sha256", payloadHash)
    headers.set("x-amz-date", amzDate)

    const canonicalHeaders = `host:${endpoint.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date"
    const canonicalRequest = [
      method,
      endpoint.pathname,
      endpoint.searchParams.toString() ? `?${endpoint.searchParams.toString()}` : "",
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join("\n")
    const scope = `${dateStamp}/${this.region()}/s3/aws4_request`
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      scope,
      createHash("sha256").update(canonicalRequest).digest("hex")
    ].join("\n")
    const signingKey = getSignatureKey(this.secretKey(), dateStamp, this.region(), "s3")
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex")
    headers.set("authorization", `AWS4-HMAC-SHA256 Credential=${this.accessKey()}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`)

    const init: RequestInit = {
      method,
      headers: headers as unknown as HeadersInit
    }
    if (method === "PUT" && body) {
      init.body = body as unknown as BodyInit
    }
    return fetch(url, init)
  }

  private safeName(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]+/g, "-")
  }
}

async function hashMatchedFiles(directory: Directory, patterns: readonly string[]): Promise<string> {
  const files = new Set<string>()
  for (const pattern of patterns) {
    for (const entry of await directory.glob(pattern)) {
      files.add(entry)
    }
  }

  const hash = createHash("sha256")
  for (const filePath of [...files].sort()) {
    try {
      const contents = await directory.file(filePath).contents()
      hash.update(filePath)
      hash.update("\0")
      hash.update(contents)
      hash.update("\0")
    } catch {
      // Skip directories and unreadable entries.
    }
  }

  return hash.digest("hex")
}

function toAmzDate(date: Date): string {
  const yyyy = date.getUTCFullYear().toString()
  const mm = `${date.getUTCMonth() + 1}`.padStart(2, "0")
  const dd = `${date.getUTCDate()}`.padStart(2, "0")
  const hh = `${date.getUTCHours()}`.padStart(2, "0")
  const mi = `${date.getUTCMinutes()}`.padStart(2, "0")
  const ss = `${date.getUTCSeconds()}`.padStart(2, "0")
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`
}

function getSignatureKey(secretKey: string, dateStamp: string, regionName: string, serviceName: string): Buffer {
  const kDate = createHmac("sha256", `AWS4${secretKey}`).update(dateStamp).digest()
  const kRegion = createHmac("sha256", kDate).update(regionName).digest()
  const kService = createHmac("sha256", kRegion).update(serviceName).digest()
  return createHmac("sha256", kService).update("aws4_request").digest()
}

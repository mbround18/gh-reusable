import { dag, Directory, Platform, object, func } from "@dagger.io/dagger"
import * as semver from "semver"

type DockerReleaseDecision = "publish" | "skip" | "failed"

interface DockerReleaseSummary {
  decision: DockerReleaseDecision
  outcome: string
  image: string
  versionTag: string
  releaseTag: string
  context: string
  dockerfile: string
  target: string
  platforms: string
  registries: string
  dockerAuth: boolean
  ghcrAuth: boolean
  reason?: string
  plannedAddresses: string[]
  publishedRefs: string[]
  markdown: string
}

@object()
export class GhReusablePipelines {
  @func()
  async ci(source: Directory): Promise<string> {
    return dag
      .container()
      .from("node:24-bookworm")
      .withMountedDirectory("/src", source)
      .withWorkdir("/src")
      .withExec(["corepack", "enable"])
      .withExec(["pnpm", "install", "--frozen-lockfile"])
      .withExec(["pnpm", "run", "build"])
      .withExec(["pnpm", "run", "test"])
      .withExec(["pnpm", "run", "typecheck"])
      .stdout()
  }

  @func()
  async rustBuildAndTest(
    source: Directory,
    toolchain: string = "stable",
    components: string = "clippy rustfmt",
    target: string = ""
  ): Promise<string> {
    const componentList = components
      .replaceAll(",", " ")
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
    const targetList = target
      .replaceAll(",", " ")
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)

    let container = dag
      .container()
      .from("rust:1.89-bookworm")
      .withMountedDirectory("/src", source)
      .withWorkdir("/src")
      .withExec(["rustup", "toolchain", "install", toolchain, "--profile", "minimal"])
      .withExec(["rustup", "default", toolchain])

    for (const component of componentList) {
      container = container.withExec(["rustup", "component", "add", "--toolchain", toolchain, component])
    }
    for (const rustTarget of targetList) {
      container = container.withExec(["rustup", "target", "add", rustTarget])
    }

    container = container
      .withExec(["cargo", "fmt", "--", "--check"])
      .withExec(["cargo", "clippy"])
      .withExec(["cargo", "build", "--verbose"])
      .withExec(["cargo", "test", "--verbose"])

    for (const rustTarget of targetList) {
      container = container
        .withExec(["cargo", "build", "--verbose", "--target", rustTarget])
        .withExec(["cargo", "test", "--verbose", "--target", rustTarget, "--no-run"])
    }

    return container.withExec(["cargo", "build", "--verbose", "--release"]).stdout()
  }

  @func()
  async audit(
    source: Directory,
    semgrepConfig: string = "auto",
    includeGitleaks: boolean = true
  ): Promise<string> {
    const semgrepContainer = dag
      .container()
      .from("returntocorp/semgrep:1.81.0")
      .withMountedDirectory("/src", source)
      .withWorkdir("/src")
      .withEnvVariable("SEMGREP_CONFIG", semgrepConfig)
      .withExec([
        "sh",
        "-lc",
        [
          "set -eu",
          "semgrep scan --config \"$SEMGREP_CONFIG\" --json --output /tmp/semgrep.json /src || true",
          "if [ ! -s /tmp/semgrep.json ]; then printf '{\"results\":[]}\\n' > /tmp/semgrep.json; fi"
        ].join("\n")
      ])

    const semgrepJson = await semgrepContainer.file("/tmp/semgrep.json").contents()
    const semgrepFindings = this.countFromObjectArrayField(semgrepJson, "results")

    let gitleaksFindings = 0
    if (includeGitleaks) {
      const gitleaksContainer = dag
        .container()
        .from("zricethezav/gitleaks:v8.24.2")
        .withMountedDirectory("/src", source)
        .withWorkdir("/src")
        .withExec([
          "detect",
          "--source=/src",
          "--report-format=json",
          "--report-path=/tmp/gitleaks.json",
          "--redact",
          "--exit-code=0"
        ])

      const gitleaksJson = await gitleaksContainer.file("/tmp/gitleaks.json").contents()
      gitleaksFindings = this.countFromArray(gitleaksJson)
    }

    const totalFindings = semgrepFindings + gitleaksFindings
    return [
      "### Audit Summary",
      "",
      "| Tool | Findings |",
      "| --- | ---: |",
      `| Semgrep (${semgrepConfig}) | ${semgrepFindings} |`,
      `| Gitleaks | ${includeGitleaks ? gitleaksFindings : "disabled"} |`,
      `| **Total** | **${totalFindings}** |`,
      "",
      "Use the workflow input `create_alerts=true` to upload SARIF findings as GitHub Security alerts."
    ].join("\n")
  }

  @func()
  async dockerRelease(
    source: Directory,
    image: string,
    context: string = ".",
    dockerfile: string = "./Dockerfile",
    target: string = "",
    platforms: string = "linux/amd64",
    tagsCsv: string = "",
    registriesCsv: string = "docker.io",
    semverPrefix: string = "",
    semverIncrement: string = "patch",
    prependTarget: boolean = false,
    canaryLabel: string = "canary",
    dockerhubUsername: string = "mbround18",
    ghcrUsername: string = "mbround18",
    forcePush: boolean = false,
    eventName: string = "",
    ref: string = "",
    refName: string = "",
    headRef: string = "",
    defaultBranch: string = "main",
    sha: string = "",
    runUrl: string = "",
    runNumber: string = "",
    prLabelsCsv: string = ""
  ): Promise<string> {
    const branchName = headRef || refName
    const shortSha = (sha || "0000000").slice(0, 7)
    const isPullRequestContext = eventName === "pull_request" || ref.startsWith("refs/pull/")
    const hasCanaryLabel = isPullRequestContext ? this.labelsContain(prLabelsCsv, canaryLabel) : false

    const shouldPublish = forcePush || eventName === "push" || (isPullRequestContext && hasCanaryLabel)

    const increment = this.normalizeIncrement(semverIncrement)
    const versionTag = this.resolveVersionTag(tagsCsv, semverPrefix, increment)
    const releaseTag = target && prependTarget ? `${target}-${versionTag}` : versionTag
    const tagSet = new Set<string>()
    const refIsTag = ref.startsWith("refs/tags/")

    if (refIsTag && refName) {
      tagSet.add(refName)
    } else if (eventName === "pull_request") {
      tagSet.add(`${releaseTag}-pr.${shortSha}`)
    } else if (branchName === defaultBranch) {
      tagSet.add(releaseTag)
      tagSet.add("latest")
    } else {
      const branchSuffix = this.sanitizeTagPart(branchName || "branch")
      tagSet.add(`${releaseTag}-${branchSuffix}.${shortSha}`)
    }

    const tags = [...tagSet]
    const registries = this.csv(registriesCsv)
    const platformsList = this.csv(platforms)
    const imagePath = this.imagePathWithoutRegistry(image)
    const contextDir = context === "." ? source : source.directory(context)

    const built = platformsList.map((platform) =>
      contextDir.dockerBuild({
        dockerfile,
        target: target || undefined,
        platform: platform as Platform
      })
    )
    const baseContainer = built[0]
    const variants = built.slice(1)

    let publishContainer = baseContainer
    const dockerToken = process.env.DOCKER_TOKEN?.trim()
    const ghcrToken = process.env.GHCR_TOKEN?.trim()

    if (registries.includes("docker.io") && dockerToken) {
      publishContainer = publishContainer.withRegistryAuth(
        "docker.io",
        dockerhubUsername,
        dag.setSecret("docker-token", dockerToken)
      )
    }
    if (registries.includes("ghcr.io") && ghcrToken) {
      publishContainer = publishContainer.withRegistryAuth(
        "ghcr.io",
        ghcrUsername,
        dag.setSecret("ghcr-token", ghcrToken)
      )
    }

    const plannedAddresses = registries.flatMap((registry) =>
      tags.map((tag) => `${registry}/${imagePath}:${tag}`)
    )

    const summary: DockerReleaseSummary = {
      decision: shouldPublish ? "publish" : "skip",
      outcome: "success",
      image,
      versionTag,
      releaseTag,
      context,
      dockerfile,
      target: target || "(none)",
      platforms: platformsList.join(","),
      registries: registries.join(","),
      dockerAuth: Boolean(dockerToken),
      ghcrAuth: Boolean(ghcrToken),
      plannedAddresses,
      publishedRefs: [],
      markdown: ""
    }

    if (!shouldPublish) {
      summary.reason = "publish requires push event, forcePush=true, or pull_request with canary label"
      summary.markdown = this.renderDockerReleaseSummary(summary, {
        eventName,
        ref,
        branchName,
        isPullRequestContext,
        forcePush,
        canaryLabel,
        hasCanaryLabel,
        runUrl,
        runNumber
      })
      return JSON.stringify(summary)
    }

    try {
      for (const registry of registries) {
        for (const tag of tags) {
          const address = `${registry}/${imagePath}:${tag}`
          const ref = await publishContainer.publish(address, {
            platformVariants: variants.length > 0 ? variants : undefined
          })
          summary.publishedRefs.push(ref)
        }
      }
    } catch (error) {
      summary.decision = "failed"
      summary.outcome = "failure"
      summary.reason = error instanceof Error ? error.message : "Docker release failed"
    }

    summary.markdown = this.renderDockerReleaseSummary(summary, {
      eventName,
      ref,
      branchName,
      isPullRequestContext,
      forcePush,
      canaryLabel,
      hasCanaryLabel,
      runUrl,
      runNumber
    })

    return JSON.stringify(summary)
  }

  private csv(value: string): string[] {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  }

  private imagePathWithoutRegistry(image: string): string {
    const normalized = image.replace(/^docker\.io\//, "").replace(/^ghcr\.io\//, "")
    const segments = normalized.split("/")
    if (segments.length === 0) {
      return normalized
    }
    const first = segments[0]
    if (first.includes(".") || first.includes(":") || first === "localhost") {
      return segments.slice(1).join("/")
    }
    return normalized
  }

  private resolveVersionTag(tagsCsv: string, prefix: string, increment: "major" | "minor" | "patch"): string {
    const current = this.csv(tagsCsv)
      .filter((tag) => tag.startsWith(prefix))
      .map((tag) => tag.slice(prefix.length))
      .filter((tag) => semver.valid(tag))
      .sort(semver.rcompare)[0]

    if (!current) {
      if (increment === "major") {
        return `${prefix}1.0.0`
      }
      if (increment === "minor") {
        return `${prefix}0.1.0`
      }
      return `${prefix}0.0.1`
    }

    const next = semver.inc(current, increment)
    if (!next) {
      throw new Error(`Unable to increment semver tag: ${current}`)
    }
    return `${prefix}${next}`
  }

  private normalizeIncrement(value: string): "major" | "minor" | "patch" {
    if (value === "major" || value === "minor" || value === "patch") {
      return value
    }
    return "patch"
  }

  private sanitizeTagPart(value: string): string {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
    return cleaned || "branch"
  }

  private countFromObjectArrayField(rawJson: string, field: string): number {
    const parsed = JSON.parse(rawJson) as Record<string, unknown>
    const value = parsed[field]
    if (!Array.isArray(value)) {
      throw new Error(`Expected JSON field "${field}" to be an array.`)
    }
    return value.length
  }

  private countFromArray(rawJson: string): number {
    const parsed = JSON.parse(rawJson) as unknown
    if (!Array.isArray(parsed)) {
      throw new Error("Expected JSON payload to be an array.")
    }
    return parsed.length
  }

  private labelsContain(labelsCsv: string, label: string): boolean {
    return this.csv(labelsCsv).some((entry) => entry === label)
  }

  private renderDockerReleaseSummary(
    summary: DockerReleaseSummary,
    context: {
      eventName: string
      ref: string
      branchName: string
      isPullRequestContext: boolean
      forcePush: boolean
      canaryLabel: string
      hasCanaryLabel: boolean
      runUrl: string
      runNumber: string
    }
  ): string {
    const plannedAddresses = summary.plannedAddresses.length > 0 ? summary.plannedAddresses.join("\n") : "- (none)"
    const publishedRefs = summary.publishedRefs.length > 0 ? summary.publishedRefs.join("\n") : "- (none)"
    const reason = summary.reason ?? ""

    const lines = [
      "### Docker release status",
      "",
      "| Field | Value |",
      "| --- | --- |",
      `| Decision | \`${summary.decision}\` |`,
      `| Dagger step outcome | \`${summary.outcome}\` |`,
      `| Image | \`${summary.image}\` |`,
      `| Version tag | \`${summary.versionTag || "n/a"}\` |`,
      `| Release tag | \`${summary.releaseTag || "n/a"}\` |`,
      `| Registries | \`${summary.registries || "n/a"}\` |`,
      `| Platforms | \`${summary.platforms || "n/a"}\` |`,
      `| Workflow run | [#${context.runNumber || "n/a"}](${context.runUrl || "#"}) |`,
      `| Context | \`${context.eventName || "(unset)"}\` / \`${context.ref || "(unset)"}\` / \`${context.branchName || "(unset)"}\` |`,
      `| Pull request context | \`${context.isPullRequestContext}\` |`,
      `| Force push | \`${context.forcePush}\` |`,
      `| Canary label | \`${context.canaryLabel}\` |`,
      `| Canary present | \`${context.hasCanaryLabel}\` |`,
      `| Docker auth | \`${summary.dockerAuth}\` |`,
      `| GHCR auth | \`${summary.ghcrAuth}\` |`
    ]

    if (reason) {
      lines.push(`| Reason | \`${reason}\` |`)
    }

    lines.push("", "**Planned addresses**", plannedAddresses, "", "**Published refs**", publishedRefs)

    return lines.join("\n")
  }
}

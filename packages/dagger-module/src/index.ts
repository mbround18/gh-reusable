import { dag, Container, Directory, Platform, object, func } from "@dagger.io/dagger"
import * as semver from "semver"
import {
  type PipelineReport,
  PipelineReporter,
  shellQuote,
  summarizeText,
} from "./reporting"
import { PipelineCache } from "./cache"

type DockerReleaseDecision = "publish" | "skip" | "failed"
type NodePackageManager = "npm" | "pnpm" | "yarn"
type PublishTarget = "npm" | "pnpm" | "yarn" | "rust-crate" | "helm-chart"

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

interface PublishResult {
  target: PublishTarget
  name: string
  version: string
  registry: string
  url: string
  digest?: string
  packageManager?: NodePackageManager
  artifactPath?: string
  notes?: string
}

interface NamedVersion {
  name: string
  version: string
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
    const reporter = this.createReporter("audit", {
      sourceDir: ".",
      registryUrls: [],
      credentials: {}
    })

    const semgrepStep = reporter.startStep("semgrep scan", {
      containerImage: "returntocorp/semgrep:1.81.0",
      command: `semgrep scan --config ${semgrepConfig} --json --output /tmp/semgrep.json /src`
    })
    const semgrepResult = await this.runCapturedStep(
      dag
        .container()
        .from("returntocorp/semgrep:1.81.0")
        .withMountedDirectory("/src", source)
        .withWorkdir("/src")
        .withEnvVariable("SEMGREP_CONFIG", semgrepConfig),
      "semgrep scan",
      [
        "sh",
        "-lc",
        [
          "set -eu",
          "semgrep scan --config \"$SEMGREP_CONFIG\" --json --output /tmp/semgrep.json /src",
          "if [ ! -s /tmp/semgrep.json ]; then printf '{\"results\":[]}\\n' > /tmp/semgrep.json; fi"
        ].join("\n")
      ]
    )
    const semgrepJson = await semgrepResult.container.file("/tmp/semgrep.json").contents()
    const semgrepFindings = this.countFromObjectArrayField(semgrepJson, "results")
    reporter.endStep(semgrepStep, {
      success: semgrepResult.exitCode === 0,
      stdout: semgrepResult.stdout,
      stderr: semgrepResult.stderr,
      stdoutSummary: summarizeText(semgrepResult.stdout),
      stderrSummary: summarizeText(semgrepResult.stderr),
      exitCode: semgrepResult.exitCode
    })
    if (semgrepResult.exitCode !== 0) {
      reporter.recordError("semgrep scan", semgrepResult.stderr || semgrepResult.stdout, "Fix Semgrep execution errors before relying on the audit results")
    }

    let gitleaksFindings = 0
    if (includeGitleaks) {
      const gitleaksStep = reporter.startStep("gitleaks detect", {
        containerImage: "zricethezav/gitleaks:v8.24.2",
        command: "gitleaks detect --source=/src --report-format=json --report-path=/tmp/gitleaks.json --redact --exit-code=0"
      })
      const gitleaksResult = await this.runCapturedStep(
        dag
          .container()
          .from("zricethezav/gitleaks:v8.24.2")
          .withMountedDirectory("/src", source)
          .withWorkdir("/src"),
        "gitleaks detect",
        [
          "sh",
          "-lc",
          [
            "set -eu",
            "gitleaks detect --source=/src --report-format=json --report-path=/tmp/gitleaks.json --redact --exit-code=0",
            "if [ ! -s /tmp/gitleaks.json ]; then printf '[]\\n' > /tmp/gitleaks.json; fi"
          ].join("\n")
        ]
      )
      const gitleaksJson = await gitleaksResult.container.file("/tmp/gitleaks.json").contents()
      gitleaksFindings = this.countFromArray(gitleaksJson)
      reporter.endStep(gitleaksStep, {
        success: gitleaksResult.exitCode === 0,
        stdout: gitleaksResult.stdout,
        stderr: gitleaksResult.stderr,
        stdoutSummary: summarizeText(gitleaksResult.stdout),
        stderrSummary: summarizeText(gitleaksResult.stderr),
        exitCode: gitleaksResult.exitCode
      })
      if (gitleaksResult.exitCode !== 0) {
        reporter.recordError("gitleaks detect", gitleaksResult.stderr || gitleaksResult.stdout, "Fix Gitleaks execution errors before relying on the audit results")
      }
    }

    const totalFindings = semgrepFindings + gitleaksFindings
    reporter.setOutput("scanFindings", {
      semgrep: semgrepFindings,
      gitleaks: includeGitleaks ? gitleaksFindings : 0,
      total: totalFindings
    })

    const report = reporter.finalize()
    return JSON.stringify({
      markdown: report.markdown,
      report,
      reportJson: JSON.stringify(report),
      reportMarkdown: report.markdown
    })
  }

  @func()
  async publishNpm(
    source: Directory,
    registry: string = "https://registry.npmjs.org",
    token: string = "",
    tag: string = "",
    version: string = ""
  ): Promise<string> {
    const manager = await this.detectNodePackageManager(source)
    return this.publishNodePackage(source, {
      manager,
      registry,
      token,
      tag,
      version
    })
  }

  @func()
  async publishPnpm(
    source: Directory,
    registry: string = "https://registry.npmjs.org",
    token: string = "",
    tag: string = "",
    version: string = ""
  ): Promise<string> {
    return this.publishNodePackage(source, {
      manager: "pnpm",
      registry,
      token,
      tag,
      version
    })
  }

  @func()
  async publishYarn(
    source: Directory,
    registry: string = "https://registry.npmjs.org",
    token: string = "",
    tag: string = "",
    version: string = ""
  ): Promise<string> {
    return this.publishNodePackage(source, {
      manager: "yarn",
      registry,
      token,
      tag,
      version
    })
  }

  @func()
  async publishRustCrate(
    source: Directory,
    token: string = "",
    version: string = "",
    registry: string = "crates.io"
  ): Promise<string> {
    if (!token) {
      throw new Error("Missing required crates.io token")
    }
    const reporter = this.createReporter("publish-rust-crate", {
      sourceDir: ".",
      version,
      registryUrls: [registry],
      credentials: { CARGO_REGISTRY_TOKEN: true }
    })
    const manifest = await this.readRequiredText(source, "Cargo.toml")
    const crate = this.parseCargoManifest(manifest)
    const resolvedVersion = this.withVersioning(crate.version, version, "Cargo.toml")
    reporter.setOutput("publishedVersion", resolvedVersion)
    reporter.setOutput("registryUrls", [registry])
    reporter.setOutput("packageMetadata", { name: crate.name, manifest: "Cargo.toml" })

    const cache = await PipelineCache.create({
      pipelineName: "publish-rust-crate",
      source,
      sourcePatterns: ["**/*"],
      lockfilePatterns: ["Cargo.lock"],
      mounts: [{ path: "/src/target", archiveName: "src/target" }]
    })
    reporter.setOutput("cacheBackend", cache.backendName)
    reporter.setOutput("cacheKey", cache.key)

    const checkStep = reporter.startStep("cargo check", { containerImage: "rust:1.89-bookworm", command: "cargo check" })
    let rustContainer = this.withRustEnv(source)
    const restoredCache = await cache.restore(rustContainer)
    this.recordPipelineWarnings(reporter, restoredCache.warnings)
    rustContainer = restoredCache.container
    const checkResult = await this.runCapturedStep(rustContainer, "cargo check", ["cargo", "check"])
    reporter.endStep(checkStep, {
      success: checkResult.exitCode === 0,
      stdout: checkResult.stdout,
      stderr: checkResult.stderr,
      stdoutSummary: summarizeText(checkResult.stdout),
      stderrSummary: summarizeText(checkResult.stderr),
      exitCode: checkResult.exitCode
    })
    if (checkResult.exitCode !== 0) {
      reporter.recordError("cargo check", checkResult.stderr || checkResult.stdout, "Fix Rust compile errors before publishing")
      return this.publishResult({ target: "rust-crate", name: crate.name, version: resolvedVersion, registry, url: `https://crates.io/crates/${encodeURIComponent(crate.name)}/${resolvedVersion}` }, reporter, { notes: "cargo check failed" })
    }

    const testStep = reporter.startStep("cargo test", { containerImage: "rust:1.89-bookworm", command: "cargo test" })
    const testResult = await this.runCapturedStep(checkResult.container, "cargo test", ["cargo", "test"])
    reporter.endStep(testStep, {
      success: testResult.exitCode === 0,
      stdout: testResult.stdout,
      stderr: testResult.stderr,
      stdoutSummary: summarizeText(testResult.stdout),
      stderrSummary: summarizeText(testResult.stderr),
      exitCode: testResult.exitCode
    })
    if (testResult.exitCode !== 0) {
      reporter.recordError("cargo test", testResult.stderr || testResult.stdout, "Fix failing tests before publishing")
      return this.publishResult({ target: "rust-crate", name: crate.name, version: resolvedVersion, registry, url: `https://crates.io/crates/${encodeURIComponent(crate.name)}/${resolvedVersion}` }, reporter, { notes: "cargo test failed" })
    }

    const packageStep = reporter.startStep("cargo package", { containerImage: "rust:1.89-bookworm", command: "cargo package" })
    const packageResult = await this.runCapturedStep(testResult.container, "cargo package", ["cargo", "package"])
    reporter.endStep(packageStep, {
      success: packageResult.exitCode === 0,
      stdout: packageResult.stdout,
      stderr: packageResult.stderr,
      stdoutSummary: summarizeText(packageResult.stdout),
      stderrSummary: summarizeText(packageResult.stderr),
      exitCode: packageResult.exitCode
    })
    if (packageResult.exitCode !== 0) {
      reporter.recordError("cargo package", packageResult.stderr || packageResult.stdout, "Fix Cargo packaging metadata before publishing")
      return this.publishResult({ target: "rust-crate", name: crate.name, version: resolvedVersion, registry, url: `https://crates.io/crates/${encodeURIComponent(crate.name)}/${resolvedVersion}` }, reporter, { notes: "cargo package failed" })
    }

    const publishStep = reporter.startStep("cargo publish", {
      containerImage: "rust:1.89-bookworm",
      command: `cargo publish${registry !== "crates.io" ? ` --registry ${registry}` : ""}`
    })
    const authenticated = packageResult.container
      .withSecretVariable("CARGO_REGISTRY_TOKEN", dag.setSecret("cargo-registry-token", token))
    const publishResult = await this.runCapturedStep(authenticated, "cargo publish", [
      "sh",
      "-lc",
      `cargo publish --token "$CARGO_REGISTRY_TOKEN"${registry !== "crates.io" ? ` --registry ${registry}` : ""}`
    ])
    reporter.endStep(publishStep, {
      success: publishResult.exitCode === 0,
      stdout: publishResult.stdout,
      stderr: publishResult.stderr,
      stdoutSummary: summarizeText(publishResult.stdout),
      stderrSummary: summarizeText(publishResult.stderr),
      exitCode: publishResult.exitCode
    })
    if (publishResult.exitCode !== 0) {
      reporter.recordError("cargo publish", publishResult.stderr || publishResult.stdout, "Check crates.io credentials and package metadata")
      return this.publishResult({ target: "rust-crate", name: crate.name, version: resolvedVersion, registry, url: `https://crates.io/crates/${encodeURIComponent(crate.name)}/${resolvedVersion}` }, reporter, { notes: "cargo publish failed" })
    }

    this.recordPipelineWarnings(reporter, (await cache.save(publishResult.container, true)).warnings)

    return this.publishResult(
      {
        target: "rust-crate",
        name: crate.name,
        version: resolvedVersion,
        registry,
        url: `https://crates.io/crates/${encodeURIComponent(crate.name)}/${resolvedVersion}`,
        notes: "cargo check/test/package/publish completed"
      },
      reporter,
      {
        artifactPath: `/target/package/${crate.name}-${resolvedVersion}.crate`
      }
    )
  }

  @func()
  async publishHelmChart(
    source: Directory,
    chart: string = ".",
    registry: string = "oci://registry-1.docker.io/helm-charts",
    username: string = "",
    password: string = "",
    version: string = ""
  ): Promise<string> {
    if (!username || !password) {
      throw new Error("Missing required Helm registry credentials")
    }
    const chartSource = source.directory(chart)
    const chartYaml = await this.readRequiredText(chartSource, "Chart.yaml")
    const chartMeta = this.parseChartYaml(chartYaml)
    const resolvedVersion = this.withVersioning(chartMeta.version, version, "Chart.yaml")
    const normalizedRegistry = registry.startsWith("oci://") ? registry : `oci://${registry}`
    const chartRef = `${normalizedRegistry.replace(/\/$/, "")}/${chartMeta.name}`
    const registryHost = this.ociRegistryHost(normalizedRegistry)
    const reporter = this.createReporter("publish-helm-chart", {
      sourceDir: chart,
      version: resolvedVersion,
      registryUrls: [normalizedRegistry],
      credentials: { HELM_USERNAME: true, HELM_PASSWORD: true }
    })
    reporter.setOutput("publishedVersion", resolvedVersion)
    reporter.setOutput("registryUrls", [normalizedRegistry])
    reporter.setOutput("packageMetadata", { name: chartMeta.name, chart: "Chart.yaml" })

    const cache = await PipelineCache.create({
      pipelineName: "publish-helm-chart",
      source: chartSource,
      sourcePatterns: ["**/*"],
      lockfilePatterns: ["Chart.yaml", "templates/**/*"],
      mounts: [{ path: "/tmp/chart-out", archiveName: "tmp/chart-out" }]
    })
    reporter.setOutput("cacheBackend", cache.backendName)
    reporter.setOutput("cacheKey", cache.key)

    const lintStep = reporter.startStep("helm lint", { containerImage: "alpine/helm:3.16.4", command: "helm lint ." })
    let helmContainer = this.withHelmEnv(chartSource)
    const restoredCache = await cache.restore(helmContainer)
    this.recordPipelineWarnings(reporter, restoredCache.warnings)
    helmContainer = restoredCache.container
    const lintResult = await this.runCapturedStep(helmContainer, "helm lint", ["helm", "lint", "."])
    reporter.endStep(lintStep, {
      success: lintResult.exitCode === 0,
      stdout: lintResult.stdout,
      stderr: lintResult.stderr,
      stdoutSummary: summarizeText(lintResult.stdout),
      stderrSummary: summarizeText(lintResult.stderr),
      exitCode: lintResult.exitCode
    })
    if (lintResult.exitCode !== 0) {
      reporter.recordError("helm lint", lintResult.stderr || lintResult.stdout, "Fix chart validation errors before publishing")
      return this.publishResult({ target: "helm-chart", name: chartMeta.name, version: resolvedVersion, registry: normalizedRegistry, url: `${chartRef}:${resolvedVersion}` }, reporter)
    }

    const packageStep = reporter.startStep("helm package", { containerImage: "alpine/helm:3.16.4", command: "helm package . --destination /tmp/chart-out" })
    const packageResult = await this.runCapturedStep(lintResult.container, "helm package", ["sh", "-lc", "mkdir -p /tmp/chart-out && helm package . --destination /tmp/chart-out"])
    reporter.endStep(packageStep, {
      success: packageResult.exitCode === 0,
      stdout: packageResult.stdout,
      stderr: packageResult.stderr,
      stdoutSummary: summarizeText(packageResult.stdout),
      stderrSummary: summarizeText(packageResult.stderr),
      exitCode: packageResult.exitCode
    })
    if (packageResult.exitCode !== 0) {
      reporter.recordError("helm package", packageResult.stderr || packageResult.stdout, "Fix chart packaging errors before publishing")
      return this.publishResult({ target: "helm-chart", name: chartMeta.name, version: resolvedVersion, registry: normalizedRegistry, url: `${chartRef}:${resolvedVersion}` }, reporter)
    }

    const pushStep = reporter.startStep("helm push", { containerImage: "alpine/helm:3.16.4", command: `helm push /tmp/chart-out/${chartMeta.name}-${resolvedVersion}.tgz ${normalizedRegistry}` })
    const authenticated = packageResult.container
      .withSecretVariable("HELM_USERNAME", dag.setSecret("helm-username", username))
      .withSecretVariable("HELM_PASSWORD", dag.setSecret("helm-password", password))
    const script = [
      "set -euo pipefail",
      `package_file="/tmp/chart-out/${chartMeta.name}-${resolvedVersion}.tgz"`,
      `digest="sha256:$(sha256sum "$package_file" | awk '{print $1}')"` ,
      `helm registry login "${registryHost}" --username "$HELM_USERNAME" --password "$HELM_PASSWORD"`,
      `helm push "$package_file" "${normalizedRegistry}"`,
      'printf "%s" "$digest"'
    ].join("\n")
    const pushResult = await this.runCapturedStep(authenticated, "helm push", ["sh", "-lc", script])
    reporter.endStep(pushStep, {
      success: pushResult.exitCode === 0,
      stdout: pushResult.stdout,
      stderr: pushResult.stderr,
      stdoutSummary: summarizeText(pushResult.stdout),
      stderrSummary: summarizeText(pushResult.stderr),
      exitCode: pushResult.exitCode
    })
    if (pushResult.exitCode !== 0) {
      reporter.recordError("helm push", pushResult.stderr || pushResult.stdout, "Check registry credentials and OCI registry address")
      return this.publishResult({ target: "helm-chart", name: chartMeta.name, version: resolvedVersion, registry: normalizedRegistry, url: `${chartRef}:${resolvedVersion}` }, reporter)
    }

    this.recordPipelineWarnings(reporter, (await cache.save(pushResult.container, true)).warnings)

    return this.publishResult(
      {
        target: "helm-chart",
        name: chartMeta.name,
        version: resolvedVersion,
        registry: normalizedRegistry,
        url: `${chartRef}:${resolvedVersion}`,
        notes: "helm lint/package/push completed"
      },
      reporter,
      {
        digest: pushResult.stdout.trim(),
        artifactPath: `/tmp/chart-out/${chartMeta.name}-${resolvedVersion}.tgz`
      }
    )
  }

  private async publishNodePackage(
    source: Directory,
    options: {
      manager: NodePackageManager
      registry: string
      token: string
      tag: string
      version: string
    }
  ): Promise<string> {
    if (!options.token) {
      throw new Error(`Missing required token for ${options.manager} publish`)
    }
    const reporter = this.createReporter(`publish-${options.manager}`, {
      sourceDir: ".",
      version: options.version,
      registryUrls: [options.registry],
      credentials: { NPM_TOKEN: true }
    })
    const packageJson = await this.readRequiredText(source, "package.json")
    const manifest = this.parsePackageJson(packageJson)
    const resolvedVersion = this.withVersioning(manifest.version, options.version, "package.json")
    reporter.setOutput("publishedVersion", resolvedVersion)
    reporter.setOutput("registryUrls", [options.registry])
    reporter.setOutput("packageMetadata", { name: manifest.name, manifest: "package.json" })

    const cache = await PipelineCache.create({
      pipelineName: `publish-${options.manager}`,
      source,
      sourcePatterns: ["**/*"],
      lockfilePatterns: options.manager === "npm" ? ["package-lock.json", "npm-shrinkwrap.json"] : options.manager === "pnpm" ? ["pnpm-lock.yaml"] : ["yarn.lock"],
      mounts: [
        { path: "/src/node_modules", archiveName: "src/node_modules" },
        { path: "/src/dist", archiveName: "src/dist" },
        { path: "/src/build", archiveName: "src/build" }
      ]
    })
    reporter.setOutput("cacheBackend", cache.backendName)
    reporter.setOutput("cacheKey", cache.key)

    const installStep = reporter.startStep(`${options.manager} install`, { containerImage: "node:24-bookworm", command: options.manager === "npm" ? "npm ci" : options.manager === "pnpm" ? "pnpm install --frozen-lockfile" : "yarn install --frozen-lockfile" })
    let nodeContainer = this.withNodeEnv(source, options.manager)
    const restoredCache = await cache.restore(nodeContainer)
    this.recordPipelineWarnings(reporter, restoredCache.warnings)
    nodeContainer = restoredCache.container
    const installResult = await this.runCapturedStep(nodeContainer, `${options.manager} install`, this.nodeInstallCommand(options.manager))
    reporter.endStep(installStep, {
      success: installResult.exitCode === 0,
      stdout: installResult.stdout,
      stderr: installResult.stderr,
      stdoutSummary: summarizeText(installResult.stdout),
      stderrSummary: summarizeText(installResult.stderr),
      exitCode: installResult.exitCode
    })
    if (installResult.exitCode !== 0) {
      reporter.recordError(`${options.manager} install`, installResult.stderr || installResult.stdout, "Fix dependency installation before publishing")
      return this.publishResult({ target: options.manager, name: manifest.name, version: resolvedVersion, registry: options.registry, url: `https://www.npmjs.com/package/${encodeURIComponent(manifest.name)}/v/${resolvedVersion}` }, reporter, { packageManager: options.manager })
    }

    const buildStep = reporter.startStep(`${options.manager} build`, { containerImage: "node:24-bookworm", command: `${options.manager} run build` })
    const buildResult = await this.runCapturedStep(installResult.container, `${options.manager} build`, this.nodeBuildCommand(options.manager))
    reporter.endStep(buildStep, {
      success: buildResult.exitCode === 0,
      stdout: buildResult.stdout,
      stderr: buildResult.stderr,
      stdoutSummary: summarizeText(buildResult.stdout),
      stderrSummary: summarizeText(buildResult.stderr),
      exitCode: buildResult.exitCode
    })
    if (buildResult.exitCode !== 0) {
      reporter.recordError(`${options.manager} build`, buildResult.stderr || buildResult.stdout, "Fix build failures before publishing")
      return this.publishResult({ target: options.manager, name: manifest.name, version: resolvedVersion, registry: options.registry, url: `https://www.npmjs.com/package/${encodeURIComponent(manifest.name)}/v/${resolvedVersion}` }, reporter, { packageManager: options.manager })
    }

    const testStep = reporter.startStep(`${options.manager} test`, { containerImage: "node:24-bookworm", command: `${options.manager} test` })
    const testResult = await this.runCapturedStep(buildResult.container, `${options.manager} test`, this.nodeTestCommand(options.manager))
    reporter.endStep(testStep, {
      success: testResult.exitCode === 0,
      stdout: testResult.stdout,
      stderr: testResult.stderr,
      stdoutSummary: summarizeText(testResult.stdout),
      stderrSummary: summarizeText(testResult.stderr),
      exitCode: testResult.exitCode
    })
    if (testResult.exitCode !== 0) {
      reporter.recordError(`${options.manager} test`, testResult.stderr || testResult.stdout, "Fix failing tests before publishing")
      return this.publishResult({ target: options.manager, name: manifest.name, version: resolvedVersion, registry: options.registry, url: `https://www.npmjs.com/package/${encodeURIComponent(manifest.name)}/v/${resolvedVersion}` }, reporter, { packageManager: options.manager })
    }

    const publishStep = reporter.startStep(`${options.manager} publish`, { containerImage: "node:24-bookworm", command: `npm publish --registry ${options.registry}${options.tag ? ` --tag ${options.tag}` : ""}` })
    const taggedContainer = this.withAuthSecrets(testResult.container, {
      NPM_TOKEN: options.token
    })
    const publishScript = [
      "set -euo pipefail",
      `registry=${shellQuote(options.registry)}`,
      `printf '//%s/:_authToken=%s\\n' "$(node -e 'const u = new URL(process.argv[1]); process.stdout.write(u.host + (u.pathname === "/" ? "" : u.pathname.replace(/\\/$/, "")))' "$registry")" "$NPM_TOKEN" > .npmrc`,
      `npm publish --registry "$registry"${options.tag ? ` --tag ${options.tag}` : ""}`
    ].join("\n")
    const publishResult = await this.runCapturedStep(taggedContainer, `${options.manager} publish`, ["sh", "-lc", publishScript])
    reporter.endStep(publishStep, {
      success: publishResult.exitCode === 0,
      stdout: publishResult.stdout,
      stderr: publishResult.stderr,
      stdoutSummary: summarizeText(publishResult.stdout),
      stderrSummary: summarizeText(publishResult.stderr),
      exitCode: publishResult.exitCode
    })
    if (publishResult.exitCode !== 0) {
      reporter.recordError(`${options.manager} publish`, publishResult.stderr || publishResult.stdout, "Check registry credentials and package access")
      return this.publishResult({ target: options.manager, name: manifest.name, version: resolvedVersion, registry: options.registry, url: `https://www.npmjs.com/package/${encodeURIComponent(manifest.name)}/v/${resolvedVersion}` }, reporter, { packageManager: options.manager })
    }

    this.recordPipelineWarnings(reporter, (await cache.save(publishResult.container, true)).warnings)

    return this.publishResult(
      {
        target: options.manager,
        name: manifest.name,
        version: resolvedVersion,
        registry: options.registry,
        url: `https://www.npmjs.com/package/${encodeURIComponent(manifest.name)}/v/${resolvedVersion}`,
        packageManager: options.manager,
        notes: "deps/build/test/publish completed"
      },
      reporter,
      { packageManager: options.manager }
    )
  }

  private withNodeEnv(source: Directory, manager: NodePackageManager): Container {
    return dag
      .container()
      .from("node:24-bookworm")
      .withMountedDirectory("/src", source)
      .withWorkdir("/src")
      .withExec(["corepack", "enable"])
      .withEnvVariable("PACKAGE_MANAGER", manager)
  }

  private withRustEnv(source: Directory): Container {
    return dag.container().from("rust:1.89-bookworm").withMountedDirectory("/src", source).withWorkdir("/src")
  }

  private withHelmEnv(source: Directory): Container {
    return dag.container().from("alpine/helm:3.16.4").withMountedDirectory("/src", source).withWorkdir("/src")
  }

  private withAuthSecrets(container: Container, secrets: Record<string, string>): Container {
    let current = container
    for (const [key, value] of Object.entries(secrets)) {
      if (!value) {
        throw new Error(`Missing required secret for ${key}`)
      }
      current = current.withSecretVariable(key, dag.setSecret(key.toLowerCase(), value))
    }
    return current
  }

  private recordPipelineWarnings(reporter: PipelineReporter, warnings: readonly string[]): void {
    for (const warning of warnings) {
      reporter.recordWarning(warning)
    }
  }

  private publishResult(
    base: PublishResult,
    reporter: PipelineReporter,
    extra: Partial<PublishResult> = {}
  ): string {
    const report = reporter.finalize()
    return JSON.stringify({
      ...base,
      ...extra,
      markdown: report.markdown,
      report,
      reportJson: JSON.stringify(report),
      reportMarkdown: report.markdown
    })
  }

  private createReporter(pipelineName: string, inputs: {
    sourceDir: string
    version?: string
    registryUrls?: readonly string[]
    credentials?: Readonly<Record<string, boolean>>
  }): PipelineReporter {
    return new PipelineReporter({
      pipelineName,
      sourceDir: inputs.sourceDir,
      version: inputs.version,
      registryUrls: inputs.registryUrls,
      credentials: inputs.credentials,
      environment: process.env
    })
  }

  private async runCapturedStep(
    container: Container,
    name: string,
    command: readonly [string, ...string[]]
  ): Promise<{
    container: Container
    stdout: string
    stderr: string
    exitCode: number
  }> {
    const stepDir = `/tmp/dagger-report-${this.slugify(name)}`
    const script = [
      "set -euo pipefail",
      `rm -rf ${shellQuote(stepDir)}`,
      `mkdir -p ${shellQuote(stepDir)}`,
      `started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"`,
      `started_ms="$(date +%s%3N)"`,
      "set +e",
      `{ ${command.map(shellQuote).join(" ")}; } >${shellQuote(`${stepDir}/stdout`)} 2>${shellQuote(`${stepDir}/stderr`)}`,
      `exit_code=$?`,
      `ended_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"`,
      `ended_ms="$(date +%s%3N)"`,
      `printf '%s' "$exit_code" >${shellQuote(`${stepDir}/exit_code`)}`,
      `printf '%s' "$started_at" >${shellQuote(`${stepDir}/started_at`)}`,
      `printf '%s' "$ended_at" >${shellQuote(`${stepDir}/ended_at`)}`,
      `printf '%s' "$started_ms" >${shellQuote(`${stepDir}/started_ms`)}`,
      `printf '%s' "$ended_ms" >${shellQuote(`${stepDir}/ended_ms`)}`,
      "exit 0"
    ].join("\n")

    const executed = await container.withExec(["sh", "-lc", script])
    const stdout = await executed.file(`${stepDir}/stdout`).contents()
    const stderr = await executed.file(`${stepDir}/stderr`).contents()
    const exitCode = Number.parseInt(await executed.file(`${stepDir}/exit_code`).contents(), 10)
    return { container: executed, stdout, stderr, exitCode }
  }

  private withVersioning(manifestVersion: string, requestedVersion: string, manifestName: string): string {
    if (requestedVersion && requestedVersion !== manifestVersion) {
      throw new Error(`Version mismatch for ${manifestName}: expected ${manifestVersion}, got ${requestedVersion}`)
    }
    return manifestVersion
  }

  private async detectNodePackageManager(source: Directory): Promise<NodePackageManager> {
    if (await this.readOptionalText(source, "pnpm-lock.yaml")) {
      return "pnpm"
    }
    if (await this.readOptionalText(source, "yarn.lock")) {
      return "yarn"
    }
    return "npm"
  }

  private nodeInstallCommand(manager: NodePackageManager): readonly [string, ...string[]] {
    if (manager === "pnpm") {
      return ["pnpm", "install", "--frozen-lockfile"]
    }
    if (manager === "yarn") {
      return ["sh", "-lc", "yarn install --frozen-lockfile"]
    }
    return ["npm", "ci"]
  }

  private nodeBuildCommand(manager: NodePackageManager): readonly [string, ...string[]] {
    if (manager === "yarn") {
      return ["yarn", "run", "build"]
    }
    return [manager, "run", "build"]
  }

  private nodeTestCommand(manager: NodePackageManager): readonly [string, ...string[]] {
    if (manager === "yarn") {
      return ["yarn", "test"]
    }
    return [manager, "test"]
  }

  private async readRequiredText(source: Directory, path: string): Promise<string> {
    return source.file(path).contents()
  }

  private async readOptionalText(source: Directory, path: string): Promise<string> {
    try {
      return await source.file(path).contents()
    } catch {
      return ""
    }
  }

  private parsePackageJson(raw: string): NamedVersion {
    const parsed = JSON.parse(raw) as { name?: string; version?: string }
    if (!parsed.name || !parsed.version) {
      throw new Error("package.json must define name and version")
    }
    return { name: parsed.name, version: parsed.version }
  }

  private parseCargoManifest(raw: string): NamedVersion {
    const packageSection = this.tomlPackageSection(raw)
    const name = this.tomlField(packageSection, "name")
    const version = this.tomlField(packageSection, "version")
    return { name, version }
  }

  private parseChartYaml(raw: string): NamedVersion {
    const name = this.yamlField(raw, "name")
    const version = this.yamlField(raw, "version")
    return { name, version }
  }

  private tomlPackageSection(raw: string): string {
    const match = raw.match(/^\[package\][\s\S]*?(?=^\[|$)/m)
    if (!match) {
      throw new Error("Cargo.toml must contain a [package] section")
    }
    return match[0]
  }

  private tomlField(section: string, key: string): string {
    const match = section.match(new RegExp(`^${key}\\s*=\\s*["']([^"']+)["']`, "m"))
    if (!match?.[1]) {
      throw new Error(`Cargo.toml must define package.${key}`)
    }
    return match[1]
  }

  private yamlField(raw: string, key: string): string {
    const match = raw.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))
    if (!match?.[1]) {
      throw new Error(`Chart.yaml must define ${key}`)
    }
    return match[1].trim()
  }

  private slugify(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "step"
  }

  private ociRegistryHost(registry: string): string {
    const normalized = registry.startsWith("oci://") ? registry : `oci://${registry}`
    return new URL(normalized).host
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
    dockerToken: string = "",
    ghcrToken: string = "",
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
    const resolvedDockerToken = dockerToken.trim() || process.env.DOCKER_TOKEN?.trim() || ""
    const resolvedGhcrToken = ghcrToken.trim() || process.env.GHCR_TOKEN?.trim() || ""

    if (registries.includes("docker.io") && resolvedDockerToken) {
      publishContainer = publishContainer.withRegistryAuth(
        "docker.io",
        dockerhubUsername,
        dag.setSecret("docker-token", resolvedDockerToken)
      )
    }
    if (registries.includes("ghcr.io") && resolvedGhcrToken) {
      publishContainer = publishContainer.withRegistryAuth(
        "ghcr.io",
        ghcrUsername,
        dag.setSecret("ghcr-token", resolvedGhcrToken)
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
      dockerAuth: Boolean(resolvedDockerToken),
      ghcrAuth: Boolean(resolvedGhcrToken),
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

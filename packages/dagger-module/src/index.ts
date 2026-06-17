import {
  dag,
  Container,
  Directory,
  Platform,
  object,
  func,
} from "@dagger.io/dagger";
import * as semver from "semver";
import {
  parse as parseGraphql,
  type TypeNode,
  type VariableDefinitionNode,
} from "graphql";
import { parse as parseYaml } from "yaml";
import {
  type PipelineReport,
  PipelineReporter,
  shellQuote,
  summarizeText,
} from "./reporting";
import { PipelineCache } from "./cache";
import type {
  SemverIncrement,
  DockerReleaseDecision,
  NodePackageManager,
  PublishTarget,
  NamedVersion,
  PublishResult,
  NodePublishOptions,
  DockerReleaseSummary,
  DockerReleaseContext,
  DockerFactsPushInput,
  DockerComposeBuild,
  StepResult,
  ReporterInputs,
  BranchRule,
  DiscordEmbedField,
  DiscordEmbed,
  DiscordWebhookPayload,
} from "./types";

@object()
export class GhReusablePipelines {
  @func()
  async ci(source: Directory): Promise<string> {
    return dag
      .container()
      .from("node:24-bookworm")
      .withMountedDirectory("/src", source)
      .withWorkdir("/src")
      .withEnvVariable("DAGGER_PNPM_PIPELINE", "1")
      .withExec(["corepack", "enable"])
      .withExec(["pnpm", "install", "--frozen-lockfile"])
      .withExec(["pnpm", "run", "build"])
      .withExec(["pnpm", "run", "test"])
      .withExec(["pnpm", "run", "typecheck"])
      .stdout();
  }

  @func()
  async pnpmBuildAndTest(source: Directory): Promise<string> {
    const reporter = this.createReporter("pnpm-build-and-test", {
      sourceDir: ".",
      registryUrls: [],
      credentials: {},
    });

    const packageJson = await this.readRequiredText(source, "package.json");
    const manifest = this.parsePackageJsonWithScripts(packageJson);
    const missingScripts = ["build", "test"].filter(
      (script) => !manifest.scripts[script],
    );
    if (missingScripts.length > 0) {
      reporter.recordError(
        "package.json validation",
        `Missing required script(s): ${missingScripts.join(", ")}`,
        "Add build and test scripts to the root package.json",
      );
      const report = reporter.finalize();
      return JSON.stringify({
        success: false,
        markdown: report.markdown,
        report,
        reportMarkdown: report.markdown,
      });
    }

    const installStep = reporter.startStep("pnpm install", {
      containerImage: "node:24-bookworm",
      command: "pnpm install --frozen-lockfile",
    });
    let container = this.withNodeEnv(source, "pnpm");
    const installResult = await this.runCapturedStep(
      container,
      "pnpm install",
      this.nodeInstallCommand("pnpm"),
    );
    reporter.endStep(installStep, {
      success: installResult.exitCode === 0,
      stdout: installResult.stdout,
      stderr: installResult.stderr,
      stdoutSummary: summarizeText(installResult.stdout),
      stderrSummary: summarizeText(installResult.stderr),
      exitCode: installResult.exitCode,
    });
    if (installResult.exitCode !== 0) {
      reporter.recordError(
        "pnpm install",
        installResult.stderr || installResult.stdout,
        "Fix dependency installation before continuing",
      );
      const report = reporter.finalize();
      return JSON.stringify({
        success: false,
        markdown: report.markdown,
        report,
        reportMarkdown: report.markdown,
      });
    }
    container = installResult.container;

    const buildStep = reporter.startStep("pnpm build", {
      containerImage: "node:24-bookworm",
      command: "pnpm run build",
    });
    const buildResult = await this.runCapturedStep(
      container,
      "pnpm build",
      this.nodeBuildCommand("pnpm"),
    );
    reporter.endStep(buildStep, {
      success: buildResult.exitCode === 0,
      stdout: buildResult.stdout,
      stderr: buildResult.stderr,
      stdoutSummary: summarizeText(buildResult.stdout),
      stderrSummary: summarizeText(buildResult.stderr),
      exitCode: buildResult.exitCode,
    });
    if (buildResult.exitCode !== 0) {
      reporter.recordError(
        "pnpm build",
        buildResult.stderr || buildResult.stdout,
        "Fix build failures before continuing",
      );
      const report = reporter.finalize();
      return JSON.stringify({
        success: false,
        markdown: report.markdown,
        report,
        reportMarkdown: report.markdown,
      });
    }
    container = buildResult.container;

    const testContainer = container.withEnvVariable(
      "DAGGER_PNPM_PIPELINE",
      "1",
    );
    const testStep = reporter.startStep("pnpm test", {
      containerImage: "node:24-bookworm",
      command: "pnpm test",
    });
    const testResult = await this.runCapturedStep(
      testContainer,
      "pnpm test",
      this.nodeTestCommand("pnpm"),
    );
    reporter.endStep(testStep, {
      success: testResult.exitCode === 0,
      stdout: testResult.stdout,
      stderr: testResult.stderr,
      stdoutSummary: summarizeText(testResult.stdout),
      stderrSummary: summarizeText(testResult.stderr),
      exitCode: testResult.exitCode,
    });
    if (testResult.exitCode !== 0) {
      reporter.recordError(
        "pnpm test",
        testResult.stderr || testResult.stdout,
        "Fix failing tests before continuing",
      );
      const report = reporter.finalize();
      return JSON.stringify({
        success: false,
        markdown: report.markdown,
        report,
        reportMarkdown: report.markdown,
      });
    }

    const report = reporter.finalize();
    return JSON.stringify({
      success: true,
      markdown: report.markdown,
      report,
      reportMarkdown: report.markdown,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // enforce-pr-labels
  // ──────────────────────────────────────────────────────────────────────────

  @func()
  async enforcePrLabels(
    labelsCsv: string = "",
    requiredAnyCsv: string = "",
    bannedCsv: string = "",
    requiredAnyDescription: string = "Select at least one required label",
  ): Promise<string> {
    const labels = this.csv(labelsCsv);
    const required = this.csv(requiredAnyCsv);
    const banned = this.csv(bannedCsv);

    const bannedFound = banned.filter((l) => labels.includes(l));
    if (bannedFound.length > 0) {
      throw new Error(`PR has banned label(s): ${bannedFound.join(", ")}`);
    }

    const hasRequired =
      required.length === 0 || required.some((l) => labels.includes(l));
    if (!hasRequired) {
      throw new Error(
        `${requiredAnyDescription} (required one of: ${required.join(", ")})`,
      );
    }

    const matched = required.filter((l) => labels.includes(l));
    return JSON.stringify({
      pass: true,
      labels,
      matched,
      markdown: `✅ Label check passed — present: \`${labels.join("`, `") || "(none)"}\``,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // notify-discord
  // ──────────────────────────────────────────────────────────────────────────

  @func()
  async notifyDiscord(
    webhookUrl: string,
    title: string,
    description: string = "",
    color: number = 0x5865f2,
    fieldsJson: string = "[]",
    url: string = "",
    footer: string = "gh-reusable",
    username: string = "gh-reusable",
  ): Promise<string> {
    let fields: DiscordEmbedField[] = [];
    try {
      fields = JSON.parse(fieldsJson) as DiscordEmbedField[];
    } catch {
      fields = [];
    }

    const embed: DiscordEmbed = {
      title,
      color,
      timestamp: new Date().toISOString(),
      footer: { text: footer },
      ...(description ? { description } : {}),
      ...(url ? { url } : {}),
      ...(fields.length > 0 ? { fields } : {}),
    };

    await this.sendDiscordNotification(webhookUrl, {
      username,
      embeds: [embed],
    });
    return JSON.stringify({
      notified: true,
      title,
      webhook: webhookUrl ? "(set)" : "(not set)",
    });
  }

  @func()
  async rustBuildAndTest(
    source: Directory,
    toolchain: string = "stable",
    components: string = "clippy,rustfmt",
    target: string = "",
    name: string = "",
  ): Promise<string> {
    const targetList = this.splitCsv(target);
    const reporter = this.createReporter("rust-build-and-test", {
      sourceDir: ".",
      registryUrls: [],
      credentials: {},
    });
    let container = await this.buildRustContainer(
      source,
      toolchain,
      components,
      target,
      "",
    );
    const resolvedName = name.trim();
    if (resolvedName) {
      container = container.withEnvVariable("NAME", resolvedName);
    }

    const runStep = async (
      stepName: string,
      command: readonly [string, ...string[]],
    ): Promise<StepResult | null> => {
      const step = reporter.startStep(stepName, {
        command: command.join(" "),
      });
      const result = await this.runCapturedStep(container, stepName, command);
      reporter.endStep(step, {
        success: result.exitCode === 0,
        stdout: result.stdout,
        stderr: result.stderr,
        stdoutSummary: summarizeText(result.stdout),
        stderrSummary: summarizeText(result.stderr),
        exitCode: result.exitCode,
      });
      container = result.container;
      if (result.exitCode !== 0) {
        reporter.recordError(
          stepName,
          result.stderr || result.stdout,
          `Fix ${stepName} failures before continuing`,
        );
        return null;
      }
      return result;
    };

    if (!(await runStep("cargo fmt", ["cargo", "fmt", "--", "--check"]))) {
      const report = reporter.finalize();
      return JSON.stringify({
        success: false,
        markdown: report.markdown,
        report,
        reportMarkdown: report.markdown,
      });
    }
    if (!(await runStep("cargo clippy", ["cargo", "clippy"]))) {
      const report = reporter.finalize();
      return JSON.stringify({
        success: false,
        markdown: report.markdown,
        report,
        reportMarkdown: report.markdown,
      });
    }
    if (!(await runStep("cargo build", ["cargo", "build", "--verbose"]))) {
      const report = reporter.finalize();
      return JSON.stringify({
        success: false,
        markdown: report.markdown,
        report,
        reportMarkdown: report.markdown,
      });
    }
    if (!(await runStep("cargo test", ["cargo", "test", "--verbose"]))) {
      const report = reporter.finalize();
      return JSON.stringify({
        success: false,
        markdown: report.markdown,
        report,
        reportMarkdown: report.markdown,
      });
    }

    for (const rustTarget of targetList) {
      if (
        !(await runStep(`cargo build (${rustTarget})`, [
          "cargo",
          "build",
          "--verbose",
          "--target",
          rustTarget,
        ]))
      ) {
        const report = reporter.finalize();
        return JSON.stringify({
          success: false,
          markdown: report.markdown,
          report,
          reportMarkdown: report.markdown,
        });
      }
      if (
        !(await runStep(`cargo test (${rustTarget})`, [
          "cargo",
          "test",
          "--verbose",
          "--target",
          rustTarget,
          "--no-run",
        ]))
      ) {
        const report = reporter.finalize();
        return JSON.stringify({
          success: false,
          markdown: report.markdown,
          report,
          reportMarkdown: report.markdown,
        });
      }
    }

    const releaseStep = reporter.startStep("cargo release build", {
      command: "cargo build --verbose --release",
    });
    const releaseResult = await this.runCapturedStep(
      container,
      "cargo release build",
      ["cargo", "build", "--verbose", "--release"],
    );
    reporter.endStep(releaseStep, {
      success: releaseResult.exitCode === 0,
      stdout: releaseResult.stdout,
      stderr: releaseResult.stderr,
      stdoutSummary: summarizeText(releaseResult.stdout),
      stderrSummary: summarizeText(releaseResult.stderr),
      exitCode: releaseResult.exitCode,
    });
    if (releaseResult.exitCode !== 0) {
      reporter.recordError(
        "cargo release build",
        releaseResult.stderr || releaseResult.stdout,
        "Fix release build failures before continuing",
      );
      const report = reporter.finalize();
      return JSON.stringify({
        success: false,
        markdown: report.markdown,
        report,
        reportMarkdown: report.markdown,
      });
    }

    const report = reporter.finalize();
    return JSON.stringify({
      success: true,
      markdown: report.markdown,
      report,
      reportMarkdown: report.markdown,
    });
  }

  @func()
  async audit(
    source: Directory,
    semgrepConfig: string = "auto",
    includeGitleaks: boolean = true,
  ): Promise<string> {
    const reporter = this.createReporter("audit", {
      sourceDir: ".",
      registryUrls: [],
      credentials: {},
    });

    const semgrepStep = reporter.startStep("semgrep scan", {
      containerImage: "returntocorp/semgrep:1.81.0",
      command: `semgrep scan --config ${semgrepConfig} --json --output /tmp/semgrep.json /src`,
    });
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
          'semgrep scan --config "$SEMGREP_CONFIG" --json --output /tmp/semgrep.json /src',
          "if [ ! -s /tmp/semgrep.json ]; then printf '{\"results\":[]}\\n' > /tmp/semgrep.json; fi",
        ].join("\n"),
      ],
    );
    const semgrepJson = await semgrepResult.container
      .file("/tmp/semgrep.json")
      .contents();
    const semgrepFindings = this.countFromObjectArrayField(
      semgrepJson,
      "results",
    );
    reporter.endStep(semgrepStep, {
      success: semgrepResult.exitCode === 0,
      stdout: semgrepResult.stdout,
      stderr: semgrepResult.stderr,
      stdoutSummary: summarizeText(semgrepResult.stdout),
      stderrSummary: summarizeText(semgrepResult.stderr),
      exitCode: semgrepResult.exitCode,
    });
    if (semgrepResult.exitCode !== 0) {
      reporter.recordError(
        "semgrep scan",
        semgrepResult.stderr || semgrepResult.stdout,
        "Fix Semgrep execution errors before relying on the audit results",
      );
    }

    let gitleaksFindings = 0;
    if (includeGitleaks) {
      const gitleaksStep = reporter.startStep("gitleaks detect", {
        containerImage: "zricethezav/gitleaks:v8.24.2",
        command:
          "gitleaks detect --source=/src --report-format=json --report-path=/tmp/gitleaks.json --redact --exit-code=0",
      });
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
            "if [ ! -s /tmp/gitleaks.json ]; then printf '[]\\n' > /tmp/gitleaks.json; fi",
          ].join("\n"),
        ],
      );
      const gitleaksJson = await gitleaksResult.container
        .file("/tmp/gitleaks.json")
        .contents();
      gitleaksFindings = this.countFromArray(gitleaksJson);
      reporter.endStep(gitleaksStep, {
        success: gitleaksResult.exitCode === 0,
        stdout: gitleaksResult.stdout,
        stderr: gitleaksResult.stderr,
        stdoutSummary: summarizeText(gitleaksResult.stdout),
        stderrSummary: summarizeText(gitleaksResult.stderr),
        exitCode: gitleaksResult.exitCode,
      });
      if (gitleaksResult.exitCode !== 0) {
        reporter.recordError(
          "gitleaks detect",
          gitleaksResult.stderr || gitleaksResult.stdout,
          "Fix Gitleaks execution errors before relying on the audit results",
        );
      }
    }

    const totalFindings = semgrepFindings + gitleaksFindings;
    reporter.setOutput("scanFindings", {
      semgrep: semgrepFindings,
      gitleaks: includeGitleaks ? gitleaksFindings : 0,
      total: totalFindings,
    });

    const report = reporter.finalize();
    return JSON.stringify({
      markdown: report.markdown,
      report,
      reportJson: JSON.stringify(report),
      reportMarkdown: report.markdown,
    });
  }

  @func()
  async publishNpm(
    source: Directory,
    registry: string = "https://registry.npmjs.org",
    token: string = "",
    tag: string = "",
    version: string = "",
    discordWebhook: string = "",
  ): Promise<string> {
    const manager = await this.detectNodePackageManager(source);
    return this.publishNodePackage(source, {
      manager,
      registry,
      token,
      tag,
      version,
      discordWebhook,
    });
  }

  @func()
  async publishPnpm(
    source: Directory,
    registry: string = "https://registry.npmjs.org",
    token: string = "",
    tag: string = "",
    version: string = "",
    discordWebhook: string = "",
  ): Promise<string> {
    return this.publishNodePackage(source, {
      manager: "pnpm",
      registry,
      token,
      tag,
      version,
      discordWebhook,
    });
  }

  @func()
  async publishYarn(
    source: Directory,
    registry: string = "https://registry.npmjs.org",
    token: string = "",
    tag: string = "",
    version: string = "",
    discordWebhook: string = "",
  ): Promise<string> {
    return this.publishNodePackage(source, {
      manager: "yarn",
      registry,
      token,
      tag,
      version,
      discordWebhook,
    });
  }

  @func()
  async publishRustCrate(
    source: Directory,
    token: string = "",
    version: string = "",
    registry: string = "crates.io",
    discordWebhook: string = "",
  ): Promise<string> {
    if (!token) {
      throw new Error("Missing required crates.io token");
    }
    const reporter = this.createReporter("publish-rust-crate", {
      sourceDir: ".",
      version,
      registryUrls: [registry],
      credentials: { CARGO_REGISTRY_TOKEN: true },
    });
    const manifest = await this.readRequiredText(source, "Cargo.toml");
    const crate = this.parseCargoManifest(manifest);
    const resolvedVersion = this.withVersioning(crate.version, version);
    reporter.setOutput("publishedVersion", resolvedVersion);
    reporter.setOutput("registryUrls", [registry]);
    reporter.setOutput("packageMetadata", {
      name: crate.name,
      manifest: "Cargo.toml",
    });

    const cache = await PipelineCache.create({
      pipelineName: "publish-rust-crate",
      source,
      sourcePatterns: ["**/*"],
      lockfilePatterns: ["Cargo.lock"],
      mounts: [{ path: "/src/target", archiveName: "src/target" }],
    });
    reporter.setOutput("cacheBackend", cache.backendName);
    reporter.setOutput("cacheKey", cache.key);

    const checkStep = reporter.startStep("cargo check", {
      containerImage: "rust:1.89-bookworm",
      command: "cargo check",
    });
    let rustContainer = this.withRustEnv(source);
    const restoredCache = await cache.restore(rustContainer);
    this.recordPipelineWarnings(reporter, restoredCache.warnings);
    rustContainer = restoredCache.container;
    const checkResult = await this.runCapturedStep(
      rustContainer,
      "cargo check",
      ["cargo", "check"],
    );
    reporter.endStep(checkStep, {
      success: checkResult.exitCode === 0,
      stdout: checkResult.stdout,
      stderr: checkResult.stderr,
      stdoutSummary: summarizeText(checkResult.stdout),
      stderrSummary: summarizeText(checkResult.stderr),
      exitCode: checkResult.exitCode,
    });
    if (checkResult.exitCode !== 0) {
      reporter.recordError(
        "cargo check",
        checkResult.stderr || checkResult.stdout,
        "Fix Rust compile errors before publishing",
      );
      return this.publishResult(
        {
          target: "rust-crate",
          name: crate.name,
          version: resolvedVersion,
          registry,
          url: `https://crates.io/crates/${encodeURIComponent(crate.name)}/${resolvedVersion}`,
        },
        reporter,
        { notes: "cargo check failed" },
      );
    }

    const testStep = reporter.startStep("cargo test", {
      containerImage: "rust:1.89-bookworm",
      command: "cargo test",
    });
    const testResult = await this.runCapturedStep(
      checkResult.container,
      "cargo test",
      ["cargo", "test"],
    );
    reporter.endStep(testStep, {
      success: testResult.exitCode === 0,
      stdout: testResult.stdout,
      stderr: testResult.stderr,
      stdoutSummary: summarizeText(testResult.stdout),
      stderrSummary: summarizeText(testResult.stderr),
      exitCode: testResult.exitCode,
    });
    if (testResult.exitCode !== 0) {
      reporter.recordError(
        "cargo test",
        testResult.stderr || testResult.stdout,
        "Fix failing tests before publishing",
      );
      return this.publishResult(
        {
          target: "rust-crate",
          name: crate.name,
          version: resolvedVersion,
          registry,
          url: `https://crates.io/crates/${encodeURIComponent(crate.name)}/${resolvedVersion}`,
        },
        reporter,
        { notes: "cargo test failed" },
      );
    }

    const packageStep = reporter.startStep("cargo package", {
      containerImage: "rust:1.89-bookworm",
      command: "cargo package",
    });
    const packageResult = await this.runCapturedStep(
      testResult.container,
      "cargo package",
      ["cargo", "package"],
    );
    reporter.endStep(packageStep, {
      success: packageResult.exitCode === 0,
      stdout: packageResult.stdout,
      stderr: packageResult.stderr,
      stdoutSummary: summarizeText(packageResult.stdout),
      stderrSummary: summarizeText(packageResult.stderr),
      exitCode: packageResult.exitCode,
    });
    if (packageResult.exitCode !== 0) {
      reporter.recordError(
        "cargo package",
        packageResult.stderr || packageResult.stdout,
        "Fix Cargo packaging metadata before publishing",
      );
      return this.publishResult(
        {
          target: "rust-crate",
          name: crate.name,
          version: resolvedVersion,
          registry,
          url: `https://crates.io/crates/${encodeURIComponent(crate.name)}/${resolvedVersion}`,
        },
        reporter,
        { notes: "cargo package failed" },
      );
    }

    const publishStep = reporter.startStep("cargo publish", {
      containerImage: "rust:1.89-bookworm",
      command: `cargo publish${registry !== "crates.io" ? ` --registry ${registry}` : ""}`,
    });
    const authenticated = packageResult.container.withSecretVariable(
      "CARGO_REGISTRY_TOKEN",
      dag.setSecret("cargo-registry-token", token),
    );
    const publishResult = await this.runCapturedStep(
      authenticated,
      "cargo publish",
      [
        "sh",
        "-lc",
        `cargo publish --token "$CARGO_REGISTRY_TOKEN"${registry !== "crates.io" ? ` --registry ${registry}` : ""}`,
      ],
    );
    reporter.endStep(publishStep, {
      success: publishResult.exitCode === 0,
      stdout: publishResult.stdout,
      stderr: publishResult.stderr,
      stdoutSummary: summarizeText(publishResult.stdout),
      stderrSummary: summarizeText(publishResult.stderr),
      exitCode: publishResult.exitCode,
    });
    if (publishResult.exitCode !== 0) {
      reporter.recordError(
        "cargo publish",
        publishResult.stderr || publishResult.stdout,
        "Check crates.io credentials and package metadata",
      );
      return this.publishResult(
        {
          target: "rust-crate",
          name: crate.name,
          version: resolvedVersion,
          registry,
          url: `https://crates.io/crates/${encodeURIComponent(crate.name)}/${resolvedVersion}`,
        },
        reporter,
        { notes: "cargo publish failed" },
      );
    }

    this.recordPipelineWarnings(
      reporter,
      (await cache.save(publishResult.container, true)).warnings,
    );

    await this.sendDiscordNotification(discordWebhook, {
      username: "gh-reusable",
      embeds: [
        {
          title: `🦀 Published — ${crate.name}@${resolvedVersion}`,
          color: this.discordColor("success"),
          url: `https://crates.io/crates/${encodeURIComponent(crate.name)}/${resolvedVersion}`,
          timestamp: new Date().toISOString(),
          footer: { text: "gh-reusable · publish-rust-crate" },
          fields: [
            { name: "Crate", value: `\`${crate.name}\``, inline: true },
            { name: "Version", value: `\`${resolvedVersion}\``, inline: true },
            { name: "Registry", value: `\`${registry}\``, inline: true },
          ],
        },
      ],
    });

    return this.publishResult(
      {
        target: "rust-crate",
        name: crate.name,
        version: resolvedVersion,
        registry,
        url: `https://crates.io/crates/${encodeURIComponent(crate.name)}/${resolvedVersion}`,
        notes: "cargo check/test/package/publish completed",
      },
      reporter,
      {
        artifactPath: `/target/package/${crate.name}-${resolvedVersion}.crate`,
      },
    );
  }

  @func()
  async publishHelmChart(
    source: Directory,
    chart: string = ".",
    registry: string = "oci://registry-1.docker.io/helm-charts",
    username: string = "",
    password: string = "",
    version: string = "",
    discordWebhook: string = "",
  ): Promise<string> {
    if (!username || !password) {
      throw new Error("Missing required Helm registry credentials");
    }
    const chartSource = source.directory(chart);
    const chartYaml = await this.readRequiredText(chartSource, "Chart.yaml");
    const chartMeta = this.parseChartYaml(chartYaml);
    const resolvedVersion = this.withVersioning(chartMeta.version, version);
    const normalizedRegistry = registry.startsWith("oci://")
      ? registry
      : `oci://${registry}`;
    const chartRef = `${normalizedRegistry.replace(/\/$/, "")}/${chartMeta.name}`;
    const registryHost = this.ociRegistryHost(normalizedRegistry);
    const reporter = this.createReporter("publish-helm-chart", {
      sourceDir: chart,
      version: resolvedVersion,
      registryUrls: [normalizedRegistry],
      credentials: { HELM_USERNAME: true, HELM_PASSWORD: true },
    });
    reporter.setOutput("publishedVersion", resolvedVersion);
    reporter.setOutput("registryUrls", [normalizedRegistry]);
    reporter.setOutput("packageMetadata", {
      name: chartMeta.name,
      chart: "Chart.yaml",
    });

    const cache = await PipelineCache.create({
      pipelineName: "publish-helm-chart",
      source: chartSource,
      sourcePatterns: ["**/*"],
      lockfilePatterns: ["Chart.yaml", "templates/**/*"],
      mounts: [{ path: "/tmp/chart-out", archiveName: "tmp/chart-out" }],
    });
    reporter.setOutput("cacheBackend", cache.backendName);
    reporter.setOutput("cacheKey", cache.key);

    const lintStep = reporter.startStep("helm lint", {
      containerImage: "alpine/helm:3.16.4",
      command: "helm lint .",
    });
    let helmContainer = this.withHelmEnv(chartSource);
    const restoredCache = await cache.restore(helmContainer);
    this.recordPipelineWarnings(reporter, restoredCache.warnings);
    helmContainer = restoredCache.container;
    const lintResult = await this.runCapturedStep(helmContainer, "helm lint", [
      "helm",
      "lint",
      ".",
    ]);
    reporter.endStep(lintStep, {
      success: lintResult.exitCode === 0,
      stdout: lintResult.stdout,
      stderr: lintResult.stderr,
      stdoutSummary: summarizeText(lintResult.stdout),
      stderrSummary: summarizeText(lintResult.stderr),
      exitCode: lintResult.exitCode,
    });
    if (lintResult.exitCode !== 0) {
      reporter.recordError(
        "helm lint",
        lintResult.stderr || lintResult.stdout,
        "Fix chart validation errors before publishing",
      );
      return this.publishResult(
        {
          target: "helm-chart",
          name: chartMeta.name,
          version: resolvedVersion,
          registry: normalizedRegistry,
          url: `${chartRef}:${resolvedVersion}`,
        },
        reporter,
      );
    }

    const packageStep = reporter.startStep("helm package", {
      containerImage: "alpine/helm:3.16.4",
      command: "helm package . --destination /tmp/chart-out",
    });
    const packageResult = await this.runCapturedStep(
      lintResult.container,
      "helm package",
      [
        "sh",
        "-lc",
        "mkdir -p /tmp/chart-out && helm package . --destination /tmp/chart-out",
      ],
    );
    reporter.endStep(packageStep, {
      success: packageResult.exitCode === 0,
      stdout: packageResult.stdout,
      stderr: packageResult.stderr,
      stdoutSummary: summarizeText(packageResult.stdout),
      stderrSummary: summarizeText(packageResult.stderr),
      exitCode: packageResult.exitCode,
    });
    if (packageResult.exitCode !== 0) {
      reporter.recordError(
        "helm package",
        packageResult.stderr || packageResult.stdout,
        "Fix chart packaging errors before publishing",
      );
      return this.publishResult(
        {
          target: "helm-chart",
          name: chartMeta.name,
          version: resolvedVersion,
          registry: normalizedRegistry,
          url: `${chartRef}:${resolvedVersion}`,
        },
        reporter,
      );
    }

    const pushStep = reporter.startStep("helm push", {
      containerImage: "alpine/helm:3.16.4",
      command: `helm push /tmp/chart-out/${chartMeta.name}-${resolvedVersion}.tgz ${normalizedRegistry}`,
    });
    const authenticated = packageResult.container
      .withSecretVariable(
        "HELM_USERNAME",
        dag.setSecret("helm-username", username),
      )
      .withSecretVariable(
        "HELM_PASSWORD",
        dag.setSecret("helm-password", password),
      );
    const script = [
      "set -eu",
      `package_file="/tmp/chart-out/${chartMeta.name}-${resolvedVersion}.tgz"`,
      'digest_hash="$(sha256sum "$package_file")"',
      'digest="sha256:${digest_hash%% *}"',
      `helm registry login "${registryHost}" --username "$HELM_USERNAME" --password "$HELM_PASSWORD"`,
      `helm push "$package_file" "${normalizedRegistry}"`,
      'printf "%s" "$digest"',
    ].join("\n");
    const pushResult = await this.runCapturedStep(authenticated, "helm push", [
      "sh",
      "-lc",
      script,
    ]);
    reporter.endStep(pushStep, {
      success: pushResult.exitCode === 0,
      stdout: pushResult.stdout,
      stderr: pushResult.stderr,
      stdoutSummary: summarizeText(pushResult.stdout),
      stderrSummary: summarizeText(pushResult.stderr),
      exitCode: pushResult.exitCode,
    });
    if (pushResult.exitCode !== 0) {
      reporter.recordError(
        "helm push",
        pushResult.stderr || pushResult.stdout,
        "Check registry credentials and OCI registry address",
      );
      return this.publishResult(
        {
          target: "helm-chart",
          name: chartMeta.name,
          version: resolvedVersion,
          registry: normalizedRegistry,
          url: `${chartRef}:${resolvedVersion}`,
        },
        reporter,
      );
    }

    this.recordPipelineWarnings(
      reporter,
      (await cache.save(pushResult.container, true)).warnings,
    );

    await this.sendDiscordNotification(discordWebhook, {
      username: "gh-reusable",
      embeds: [
        {
          title: `⛵ Published — ${chartMeta.name}@${resolvedVersion}`,
          color: this.discordColor("success"),
          url: `${chartRef}:${resolvedVersion}`,
          timestamp: new Date().toISOString(),
          footer: { text: "gh-reusable · publish-helm-chart" },
          fields: [
            { name: "Chart", value: `\`${chartMeta.name}\``, inline: true },
            { name: "Version", value: `\`${resolvedVersion}\``, inline: true },
            {
              name: "Registry",
              value: `\`${normalizedRegistry}\``,
              inline: true,
            },
          ],
        },
      ],
    });

    return this.publishResult(
      {
        target: "helm-chart",
        name: chartMeta.name,
        version: resolvedVersion,
        registry: normalizedRegistry,
        url: `${chartRef}:${resolvedVersion}`,
        notes: "helm lint/package/push completed",
      },
      reporter,
      {
        digest: pushResult.stdout.trim(),
        artifactPath: `/tmp/chart-out/${chartMeta.name}-${resolvedVersion}.tgz`,
      },
    );
  }

  private async publishNodePackage(
    source: Directory,
    options: NodePublishOptions,
  ): Promise<string> {
    if (!options.token) {
      throw new Error(`Missing required token for ${options.manager} publish`);
    }
    const reporter = this.createReporter(`publish-${options.manager}`, {
      sourceDir: ".",
      version: options.version,
      registryUrls: [options.registry],
      credentials: { NPM_TOKEN: true },
    });
    const packageJson = await this.readRequiredText(source, "package.json");
    const manifest = this.parsePackageJson(packageJson);
    const resolvedVersion = this.withVersioning(
      manifest.version,
      options.version,
    );
    reporter.setOutput("publishedVersion", resolvedVersion);
    reporter.setOutput("registryUrls", [options.registry]);
    reporter.setOutput("packageMetadata", {
      name: manifest.name,
      manifest: "package.json",
    });

    const cache = await PipelineCache.create({
      pipelineName: `publish-${options.manager}`,
      source,
      sourcePatterns: ["**/*"],
      lockfilePatterns:
        options.manager === "npm"
          ? ["package-lock.json", "npm-shrinkwrap.json"]
          : options.manager === "pnpm"
            ? ["pnpm-lock.yaml"]
            : ["yarn.lock"],
      mounts: [
        { path: "/src/node_modules", archiveName: "src/node_modules" },
        { path: "/src/dist", archiveName: "src/dist" },
        { path: "/src/build", archiveName: "src/build" },
      ],
    });
    reporter.setOutput("cacheBackend", cache.backendName);
    reporter.setOutput("cacheKey", cache.key);

    const installStep = reporter.startStep(`${options.manager} install`, {
      containerImage: "node:24-bookworm",
      command:
        options.manager === "npm"
          ? "npm ci"
          : options.manager === "pnpm"
            ? "pnpm install --frozen-lockfile"
            : "yarn install --frozen-lockfile",
    });
    let nodeContainer = this.withNodeEnv(source, options.manager);
    const restoredCache = await cache.restore(nodeContainer);
    this.recordPipelineWarnings(reporter, restoredCache.warnings);
    nodeContainer = restoredCache.container;
    const installResult = await this.runCapturedStep(
      nodeContainer,
      `${options.manager} install`,
      this.nodeInstallCommand(options.manager),
    );
    reporter.endStep(installStep, {
      success: installResult.exitCode === 0,
      stdout: installResult.stdout,
      stderr: installResult.stderr,
      stdoutSummary: summarizeText(installResult.stdout),
      stderrSummary: summarizeText(installResult.stderr),
      exitCode: installResult.exitCode,
    });
    if (installResult.exitCode !== 0) {
      reporter.recordError(
        `${options.manager} install`,
        installResult.stderr || installResult.stdout,
        "Fix dependency installation before publishing",
      );
      return this.publishResult(
        {
          target: options.manager,
          name: manifest.name,
          version: resolvedVersion,
          registry: options.registry,
          url: `https://www.npmjs.com/package/${encodeURIComponent(manifest.name)}/v/${resolvedVersion}`,
        },
        reporter,
        { packageManager: options.manager },
      );
    }

    const buildStep = reporter.startStep(`${options.manager} build`, {
      containerImage: "node:24-bookworm",
      command: `${options.manager} run build`,
    });
    const buildResult = await this.runCapturedStep(
      installResult.container,
      `${options.manager} build`,
      this.nodeBuildCommand(options.manager),
    );
    reporter.endStep(buildStep, {
      success: buildResult.exitCode === 0,
      stdout: buildResult.stdout,
      stderr: buildResult.stderr,
      stdoutSummary: summarizeText(buildResult.stdout),
      stderrSummary: summarizeText(buildResult.stderr),
      exitCode: buildResult.exitCode,
    });
    if (buildResult.exitCode !== 0) {
      reporter.recordError(
        `${options.manager} build`,
        buildResult.stderr || buildResult.stdout,
        "Fix build failures before publishing",
      );
      return this.publishResult(
        {
          target: options.manager,
          name: manifest.name,
          version: resolvedVersion,
          registry: options.registry,
          url: `https://www.npmjs.com/package/${encodeURIComponent(manifest.name)}/v/${resolvedVersion}`,
        },
        reporter,
        { packageManager: options.manager },
      );
    }

    const testStep = reporter.startStep(`${options.manager} test`, {
      containerImage: "node:24-bookworm",
      command: `${options.manager} test`,
    });
    const testResult = await this.runCapturedStep(
      buildResult.container,
      `${options.manager} test`,
      this.nodeTestCommand(options.manager),
    );
    reporter.endStep(testStep, {
      success: testResult.exitCode === 0,
      stdout: testResult.stdout,
      stderr: testResult.stderr,
      stdoutSummary: summarizeText(testResult.stdout),
      stderrSummary: summarizeText(testResult.stderr),
      exitCode: testResult.exitCode,
    });
    if (testResult.exitCode !== 0) {
      reporter.recordError(
        `${options.manager} test`,
        testResult.stderr || testResult.stdout,
        "Fix failing tests before publishing",
      );
      return this.publishResult(
        {
          target: options.manager,
          name: manifest.name,
          version: resolvedVersion,
          registry: options.registry,
          url: `https://www.npmjs.com/package/${encodeURIComponent(manifest.name)}/v/${resolvedVersion}`,
        },
        reporter,
        { packageManager: options.manager },
      );
    }

    const publishStep = reporter.startStep(`${options.manager} publish`, {
      containerImage: "node:24-bookworm",
      command: `npm publish --registry ${options.registry}${options.tag ? ` --tag ${options.tag}` : ""}`,
    });
    const taggedContainer = this.withAuthSecrets(testResult.container, {
      NPM_TOKEN: options.token,
    });
    const publishScript = [
      "set -eu",
      `registry=${shellQuote(options.registry)}`,
      `printf '//%s/:_authToken=%s\\n' "$(node -e 'const u = new URL(process.argv[1]); process.stdout.write(u.host + (u.pathname === "/" ? "" : u.pathname.replace(/\\/$/, "")))' "$registry")" "$NPM_TOKEN" > .npmrc`,
      `npm publish --registry "$registry"${options.tag ? ` --tag ${options.tag}` : ""}`,
    ].join("\n");
    const publishResult = await this.runCapturedStep(
      taggedContainer,
      `${options.manager} publish`,
      ["sh", "-c", publishScript],
    );
    reporter.endStep(publishStep, {
      success: publishResult.exitCode === 0,
      stdout: publishResult.stdout,
      stderr: publishResult.stderr,
      stdoutSummary: summarizeText(publishResult.stdout),
      stderrSummary: summarizeText(publishResult.stderr),
      exitCode: publishResult.exitCode,
    });
    if (publishResult.exitCode !== 0) {
      reporter.recordError(
        `${options.manager} publish`,
        publishResult.stderr || publishResult.stdout,
        "Check registry credentials and package access",
      );
      return this.publishResult(
        {
          target: options.manager,
          name: manifest.name,
          version: resolvedVersion,
          registry: options.registry,
          url: `https://www.npmjs.com/package/${encodeURIComponent(manifest.name)}/v/${resolvedVersion}`,
        },
        reporter,
        { packageManager: options.manager },
      );
    }

    this.recordPipelineWarnings(
      reporter,
      (await cache.save(publishResult.container, true)).warnings,
    );

    await this.sendDiscordNotification(options.discordWebhook ?? "", {
      username: "gh-reusable",
      embeds: [
        {
          title: `📦 Published — ${manifest.name}@${resolvedVersion}`,
          color: this.discordColor("success"),
          url: `https://www.npmjs.com/package/${encodeURIComponent(manifest.name)}/v/${resolvedVersion}`,
          timestamp: new Date().toISOString(),
          footer: { text: "gh-reusable · publish" },
          fields: [
            { name: "Package", value: `\`${manifest.name}\``, inline: true },
            { name: "Version", value: `\`${resolvedVersion}\``, inline: true },
            { name: "Manager", value: `\`${options.manager}\``, inline: true },
            {
              name: "Registry",
              value: `\`${options.registry}\``,
              inline: true,
            },
          ],
        },
      ],
    });

    return this.publishResult(
      {
        target: options.manager,
        name: manifest.name,
        version: resolvedVersion,
        registry: options.registry,
        url: `https://www.npmjs.com/package/${encodeURIComponent(manifest.name)}/v/${resolvedVersion}`,
        packageManager: options.manager,
        notes: "deps/build/test/publish completed",
      },
      reporter,
      { packageManager: options.manager },
    );
  }

  private withNodeEnv(
    source: Directory,
    manager: NodePackageManager,
  ): Container {
    return dag
      .container()
      .from("node:24-bookworm")
      .withMountedDirectory("/src", source)
      .withWorkdir("/src")
      .withEnvVariable("CI", "true")
      .withExec(["corepack", "enable"])
      .withEnvVariable("PACKAGE_MANAGER", manager);
  }

  private withRustEnv(source: Directory): Container {
    return dag
      .container()
      .from("rust:1.89-bookworm")
      .withMountedDirectory("/src", source)
      .withWorkdir("/src")
      .withEnvVariable("PATH", this.rustPath());
  }

  private withPythonEnv(
    source: Directory,
    pythonVersion: string,
  ): Container {
    return dag
      .container()
      .from(`astral/uv:python${pythonVersion}-bookworm-slim`)
      .withMountedDirectory("/src", source)
      .withWorkdir("/src");
  }

  private withHelmEnv(source: Directory): Container {
    return dag
      .container()
      .from("alpine/helm:3.16.4")
      .withMountedDirectory("/src", source)
      .withWorkdir("/src");
  }

  private withAuthSecrets(
    container: Container,
    secrets: Record<string, string>,
  ): Container {
    let current = container;
    for (const [key, value] of Object.entries(secrets)) {
      if (!value) {
        throw new Error(`Missing required secret for ${key}`);
      }
      current = current.withSecretVariable(
        key,
        dag.setSecret(key.toLowerCase(), value),
      );
    }
    return current;
  }

  private recordPipelineWarnings(
    reporter: PipelineReporter,
    warnings: readonly string[],
  ): void {
    for (const warning of warnings) {
      reporter.recordWarning(warning);
    }
  }

  private async sendDiscordNotification(
    webhookUrl: string,
    payload: DiscordWebhookPayload,
  ): Promise<void> {
    const url = webhookUrl.trim();
    if (!url) return;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "(no body)");
        console.warn(
          `Discord notification failed (HTTP ${res.status}): ${body}`,
        );
      }
    } catch (error) {
      console.warn(
        `Discord notification error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private discordColor(decision: "success" | "failure" | "skip"): number {
    if (decision === "success") return 0x57f287; // green
    if (decision === "failure") return 0xed4245; // red
    return 0x95a5a6; // gray
  }

  private publishResult(
    base: PublishResult,
    reporter: PipelineReporter,
    extra: Partial<PublishResult> = {},
  ): string {
    const report = reporter.finalize();
    return JSON.stringify({
      ...base,
      ...extra,
      markdown: report.markdown,
      report,
      reportJson: JSON.stringify(report),
      reportMarkdown: report.markdown,
    });
  }

  private createReporter(
    pipelineName: string,
    inputs: ReporterInputs,
  ): PipelineReporter {
    return new PipelineReporter({
      pipelineName,
      sourceDir: inputs.sourceDir,
      version: inputs.version,
      registryUrls: inputs.registryUrls,
      credentials: inputs.credentials,
      environment: process.env,
    });
  }

  private async runCapturedStep(
    container: Container,
    name: string,
    command: readonly [string, ...string[]],
  ): Promise<StepResult> {
    const stepDir = `/tmp/dagger-report-${this.slugify(name)}`;
    const script = [
      "set -eu",
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
      "exit 0",
    ].join("\n");

    const executed = await container.withExec(["sh", "-c", script]);
    const stdout = await executed.file(`${stepDir}/stdout`).contents();
    const stderr = await executed.file(`${stepDir}/stderr`).contents();
    const exitCode = Number.parseInt(
      await executed.file(`${stepDir}/exit_code`).contents(),
      10,
    );
    return { container: executed, stdout, stderr, exitCode };
  }

  private withVersioning(
    manifestVersion: string,
    requestedVersion: string,
  ): string {
    return requestedVersion || manifestVersion;
  }

  private async detectNodePackageManager(
    source: Directory,
  ): Promise<NodePackageManager> {
    if (await this.readOptionalText(source, "pnpm-lock.yaml")) {
      return "pnpm";
    }
    if (await this.readOptionalText(source, "yarn.lock")) {
      return "yarn";
    }
    return "npm";
  }

  private nodeInstallCommand(
    manager: NodePackageManager,
  ): readonly [string, ...string[]] {
    if (manager === "pnpm") {
      return ["pnpm", "install", "--frozen-lockfile"];
    }
    if (manager === "yarn") {
      return ["sh", "-lc", "yarn install --frozen-lockfile"];
    }
    return ["npm", "ci"];
  }

  private nodeBuildCommand(
    manager: NodePackageManager,
  ): readonly [string, ...string[]] {
    if (manager === "yarn") {
      return ["yarn", "run", "build"];
    }
    return [manager, "run", "build"];
  }

  private nodeTestCommand(
    manager: NodePackageManager,
  ): readonly [string, ...string[]] {
    if (manager === "yarn") {
      return ["yarn", "test"];
    }
    return [manager, "test"];
  }

  private async readRequiredText(
    source: Directory,
    path: string,
  ): Promise<string> {
    return source.file(path).contents();
  }

  private async readOptionalText(
    source: Directory,
    path: string,
  ): Promise<string> {
    try {
      return await source.file(path).contents();
    } catch {
      return "";
    }
  }

  private parsePackageJson(raw: string): NamedVersion {
    const parsed = JSON.parse(raw) as { name?: string; version?: string };
    if (!parsed.name || !parsed.version) {
      throw new Error("package.json must define name and version");
    }
    return { name: parsed.name, version: parsed.version };
  }

  private parsePackageJsonWithScripts(raw: string): {
    name: string;
    version: string;
    scripts: Record<string, string>;
  } {
    const parsed = JSON.parse(raw) as {
      name?: string;
      version?: string;
      scripts?: Record<string, unknown>;
    };
    if (!parsed.name || !parsed.version) {
      throw new Error("package.json must define name and version");
    }
    const scripts = Object.fromEntries(
      Object.entries(parsed.scripts ?? {}).filter(([, value]) =>
        typeof value === "string",
      ),
    ) as Record<string, string>;
    return { name: parsed.name, version: parsed.version, scripts };
  }

  private parseCargoManifest(raw: string): NamedVersion {
    const packageSection = this.tomlPackageSection(raw);
    const name = this.tomlField(packageSection, "name");
    const version = this.tomlField(packageSection, "version");
    return { name, version };
  }

  private parseChartYaml(raw: string): NamedVersion {
    const name = this.yamlField(raw, "name");
    const version = this.yamlField(raw, "version");
    return { name, version };
  }

  private tomlPackageSection(raw: string): string {
    const match = raw.match(/^\[package\][\s\S]*?(?=^\[|$)/m);
    if (!match) {
      throw new Error("Cargo.toml must contain a [package] section");
    }
    return match[0];
  }

  private tomlField(section: string, key: string): string {
    const match = section.match(
      new RegExp(`^${key}\\s*=\\s*["']([^"']+)["']`, "m"),
    );
    if (!match?.[1]) {
      throw new Error(`Cargo.toml must define package.${key}`);
    }
    return match[1];
  }

  private yamlField(raw: string, key: string): string {
    const match = raw.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    if (!match?.[1]) {
      throw new Error(`Chart.yaml must define ${key}`);
    }
    return match[1].trim();
  }

  private slugify(value: string): string {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "step"
    );
  }

  private ociRegistryHost(registry: string): string {
    const normalized = registry.startsWith("oci://")
      ? registry
      : `oci://${registry}`;
    return new URL(normalized).host;
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
    dockerhubUsername: string = "",
    ghcrUsername: string = "",
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
    prLabelsCsv: string = "",
    discordWebhook: string = "",
  ): Promise<string> {
    const branchName = headRef || refName;
    const shortSha = (sha || "0000000").slice(0, 7);
    const isPullRequestContext =
      eventName === "pull_request" || ref.startsWith("refs/pull/");
    const hasCanaryLabel = isPullRequestContext
      ? this.labelsContain(prLabelsCsv, canaryLabel)
      : false;

    const shouldPublish =
      forcePush ||
      eventName === "push" ||
      (isPullRequestContext && hasCanaryLabel);

    const increment = this.normalizeIncrement(semverIncrement);
    const versionTag = this.resolveVersionTag(tagsCsv, semverPrefix, increment);
    const releaseTag =
      target && prependTarget ? `${target}-${versionTag}` : versionTag;
    const tagSet = new Set<string>();
    const refIsTag = ref.startsWith("refs/tags/");

    if (refIsTag && refName) {
      tagSet.add(refName);
    } else if (eventName === "pull_request") {
      tagSet.add(`${releaseTag}-pr.${shortSha}`);
    } else if (branchName === defaultBranch) {
      tagSet.add(releaseTag);
      tagSet.add("latest");
    } else {
      const branchSuffix = this.sanitizeTagPart(branchName || "branch");
      tagSet.add(`${releaseTag}-${branchSuffix}.${shortSha}`);
    }

    const tags = [...tagSet];
    const registries = this.csv(registriesCsv);
    const platformsList = this.csv(platforms);
    const imagePath = this.imagePathWithoutRegistry(image);
    const contextDir = context === "." ? source : source.directory(context);

    const built = platformsList.map((platform) =>
      contextDir.dockerBuild({
        dockerfile,
        target: target || undefined,
        platform: platform as Platform,
      }),
    );
    const baseContainer = built[0];
    const variants = built.slice(1);

    let publishContainer = baseContainer;
    const resolvedDockerToken =
      dockerToken.trim() || process.env.DOCKER_TOKEN?.trim() || "";
    const resolvedGhcrToken =
      ghcrToken.trim() || process.env.GHCR_TOKEN?.trim() || "";

    if (registries.includes("docker.io") && resolvedDockerToken) {
      if (!dockerhubUsername) {
        throw new Error(
          "dockerhubUsername is required when publishing to docker.io",
        );
      }
      publishContainer = publishContainer.withRegistryAuth(
        "docker.io",
        dockerhubUsername,
        dag.setSecret("docker-token", resolvedDockerToken),
      );
    }
    if (registries.includes("ghcr.io") && resolvedGhcrToken) {
      if (!ghcrUsername) {
        throw new Error("ghcrUsername is required when publishing to ghcr.io");
      }
      publishContainer = publishContainer.withRegistryAuth(
        "ghcr.io",
        ghcrUsername,
        dag.setSecret("ghcr-token", resolvedGhcrToken),
      );
    }

    const plannedAddresses = registries.flatMap((registry) =>
      tags.map((tag) => `${registry}/${imagePath}:${tag}`),
    );

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
      markdown: "",
    };

    if (!shouldPublish) {
      summary.reason =
        "publish requires push event, forcePush=true, or pull_request with canary label";
      summary.markdown = this.renderDockerReleaseSummary(summary, {
        eventName,
        ref,
        branchName,
        isPullRequestContext,
        forcePush,
        canaryLabel,
        hasCanaryLabel,
        runUrl,
        runNumber,
      });
      await this.sendDiscordNotification(discordWebhook, {
        username: "gh-reusable",
        embeds: [
          {
            title: `⏭️ Docker Skipped — ${image}`,
            color: this.discordColor("skip"),
            description: summary.reason,
            timestamp: new Date().toISOString(),
            footer: { text: "gh-reusable · docker-release" },
          },
        ],
      });
      return JSON.stringify(summary);
    }

    try {
      for (const registry of registries) {
        for (const tag of tags) {
          const address = `${registry}/${imagePath}:${tag}`;
          const ref = await publishContainer.publish(address, {
            platformVariants: variants.length > 0 ? variants : undefined,
          });
          summary.publishedRefs.push(ref);
        }
      }
    } catch (error) {
      summary.decision = "failed";
      summary.outcome = "failure";
      summary.reason =
        error instanceof Error ? error.message : "Docker release failed";
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
      runNumber,
    });

    const isSuccess = summary.decision === "publish";
    await this.sendDiscordNotification(discordWebhook, {
      username: "gh-reusable",
      embeds: [
        {
          title: `${isSuccess ? "🐳" : "❌"} Docker ${isSuccess ? "Published" : "Failed"} — ${image}`,
          color: this.discordColor(isSuccess ? "success" : "failure"),
          ...(summary.reason ? { description: summary.reason } : {}),
          ...(runUrl ? { url: runUrl } : {}),
          timestamp: new Date().toISOString(),
          footer: { text: "gh-reusable · docker-release" },
          fields: [
            { name: "Image", value: `\`${image}\``, inline: true },
            {
              name: "Version",
              value: `\`${summary.versionTag || "n/a"}\``,
              inline: true,
            },
            {
              name: "Registries",
              value: `\`${summary.registries}\``,
              inline: true,
            },
            ...(isSuccess && summary.publishedRefs.length > 0
              ? [
                  {
                    name: "Published",
                    value: summary.publishedRefs
                      .map((r) => `\`${r}\``)
                      .join("\n")
                      .slice(0, 1024),
                    inline: false,
                  },
                ]
              : []),
          ],
        },
      ],
    });

    return JSON.stringify(summary);
  }

  private csv(value: string): string[] {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  private imagePathWithoutRegistry(image: string): string {
    const normalized = image
      .replace(/^docker\.io\//, "")
      .replace(/^ghcr\.io\//, "");
    const segments = normalized.split("/");
    if (segments.length === 0) {
      return normalized;
    }
    const first = segments[0];
    if (first.includes(".") || first.includes(":") || first === "localhost") {
      return segments.slice(1).join("/");
    }
    return normalized;
  }

  private resolveVersionTag(
    tagsCsv: string,
    prefix: string,
    increment: SemverIncrement,
  ): string {
    const current = this.csv(tagsCsv)
      .filter((tag) => tag.startsWith(prefix))
      .map((tag) => tag.slice(prefix.length))
      .filter((tag) => semver.valid(tag))
      .sort(semver.rcompare)[0];

    if (!current) {
      if (increment === "major") {
        return `${prefix}1.0.0`;
      }
      if (increment === "minor") {
        return `${prefix}0.1.0`;
      }
      return `${prefix}0.0.1`;
    }

    const next = semver.inc(current, increment);
    if (!next) {
      throw new Error(`Unable to increment semver tag: ${current}`);
    }
    return `${prefix}${next}`;
  }

  private normalizeIncrement(value: string): SemverIncrement {
    if (value === "major" || value === "minor" || value === "patch") {
      return value;
    }
    return "patch";
  }

  private sanitizeTagPart(value: string): string {
    const cleaned = value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return cleaned || "branch";
  }

  private countFromObjectArrayField(rawJson: string, field: string): number {
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    const value = parsed[field];
    if (!Array.isArray(value)) {
      throw new Error(`Expected JSON field "${field}" to be an array.`);
    }
    return value.length;
  }

  private countFromArray(rawJson: string): number {
    const parsed = JSON.parse(rawJson) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("Expected JSON payload to be an array.");
    }
    return parsed.length;
  }

  private labelsContain(labelsCsv: string, label: string): boolean {
    return this.csv(labelsCsv).some((entry) => entry === label);
  }

  private renderDockerReleaseSummary(
    summary: DockerReleaseSummary,
    context: DockerReleaseContext,
  ): string {
    const plannedAddresses =
      summary.plannedAddresses.length > 0
        ? summary.plannedAddresses.join("\n")
        : "- (none)";
    const publishedRefs =
      summary.publishedRefs.length > 0
        ? summary.publishedRefs.join("\n")
        : "- (none)";
    const reason = summary.reason ?? "";

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
      `| GHCR auth | \`${summary.ghcrAuth}\` |`,
    ];

    if (reason) {
      lines.push(`| Reason | \`${reason}\` |`);
    }

    lines.push(
      "",
      "**Planned addresses**",
      plannedAddresses,
      "",
      "**Published refs**",
      publishedRefs,
    );

    return lines.join("\n");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ensure-repository
  // ──────────────────────────────────────────────────────────────────────────

  @func()
  async ensureRepository(
    expectedRepository: string,
    repository: string = "",
  ): Promise<string> {
    const actual =
      repository.trim() || process.env.GITHUB_REPOSITORY?.trim() || "";
    if (!actual) {
      throw new Error(
        "repository must be provided or GITHUB_REPOSITORY must be set",
      );
    }
    if (actual !== expectedRepository) {
      throw new Error(
        `Repository mismatch: this workflow is not intended for use outside of "${expectedRepository}" (running in "${actual}")`,
      );
    }
    return actual;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // graphql
  // ──────────────────────────────────────────────────────────────────────────

  @func()
  async graphqlQuery(
    query: string,
    args: string = "",
    token: string = "",
    url: string = "https://api.github.com/graphql",
  ): Promise<string> {
    const resolvedToken =
      token.trim() || process.env.GITHUB_TOKEN?.trim() || "";

    const variables: Record<string, string> = {};
    if (args.trim()) {
      for (const pair of args
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)) {
        const idx = pair.indexOf("=");
        if (idx > 0) {
          variables[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
        }
      }
    }

    const coerced = this.coerceGraphqlVariables(query, variables);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (resolvedToken) {
      headers["Authorization"] = `Bearer ${resolvedToken}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables: coerced }),
    });

    const data = await response.json();
    return JSON.stringify(data);
  }

  private coerceGraphqlVariables(
    query: string,
    variables: Record<string, string>,
  ): Record<string, string | number | boolean> {
    try {
      const ast = parseGraphql(query);
      let varDefs: ReadonlyArray<VariableDefinitionNode> = [];
      for (const def of ast.definitions) {
        if (def.kind === "OperationDefinition" && def.variableDefinitions) {
          varDefs = def.variableDefinitions;
          break;
        }
      }
      const result: Record<string, string | number | boolean> = {
        ...variables,
      };
      for (const varDef of varDefs) {
        const name = varDef.variable.name.value;
        const typeName = this.graphqlNamedType(varDef.type);
        if (result[name] !== undefined && typeof result[name] === "string") {
          if (typeName === "Int")
            result[name] = parseInt(result[name] as string, 10);
          else if (typeName === "Float")
            result[name] = parseFloat(result[name] as string);
          else if (typeName === "Boolean")
            result[name] = (result[name] as string).toLowerCase() === "true";
        }
      }
      return result;
    } catch {
      return variables as Record<string, string | number | boolean>;
    }
  }

  private graphqlNamedType(typeNode: TypeNode): string | null {
    if (typeNode.kind === "NamedType") return typeNode.name.value;
    if (typeNode.kind === "NonNullType" || typeNode.kind === "ListType")
      return this.graphqlNamedType(typeNode.type);
    return null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // install-cli
  // ──────────────────────────────────────────────────────────────────────────

  @func()
  async installCli(
    repository: string,
    asset: string,
    version: string = "latest",
    overrideName: string = "",
    token: string = "",
  ): Promise<Directory> {
    const resolvedToken =
      token.trim() || process.env.GITHUB_TOKEN?.trim() || "";
    const parts = repository.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(
        `Invalid repository format: "${repository}" — expected "owner/repo"`,
      );
    }
    const [owner, repo] = parts;

    let resolvedVersion = version.trim() || "latest";
    if (resolvedVersion === "latest") {
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
      };
      if (resolvedToken) headers["Authorization"] = `Bearer ${resolvedToken}`;
      const resp = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
        { headers },
      );
      const data = (await resp.json()) as { tag_name?: string };
      if (!data.tag_name)
        throw new Error(`Could not resolve latest version for ${repository}`);
      resolvedVersion = data.tag_name;
    }

    const resolvedAsset = asset.replace(/%VERSION%/g, resolvedVersion);
    const downloadUrl = `https://github.com/${owner}/${repo}/releases/download/${resolvedVersion}/${resolvedAsset}`;

    const script = [
      "set -euo pipefail",
      "mkdir -p /tmp/cli-staging /tmp/cli-bin",
      `curl -fsSL "${downloadUrl}" -o /tmp/cli-staging/asset`,
      `asset="${resolvedAsset}"`,
      'if [[ "$asset" == *.tar.gz ]] || [[ "$asset" == *.tgz ]]; then',
      "  tar -xzf /tmp/cli-staging/asset -C /tmp/cli-bin",
      'elif [[ "$asset" == *.tar ]]; then',
      "  tar -xf /tmp/cli-staging/asset -C /tmp/cli-bin",
      'elif [[ "$asset" == *.zip ]]; then',
      "  unzip -q /tmp/cli-staging/asset -d /tmp/cli-bin",
      "else",
      `  cp /tmp/cli-staging/asset /tmp/cli-bin/${overrideName || resolvedAsset}`,
      "fi",
      "find /tmp/cli-bin -mindepth 2 -type f -exec mv -t /tmp/cli-bin {} +",
      "find /tmp/cli-bin -type d -empty -delete",
      ...(overrideName
        ? [
            `bin_file=$(find /tmp/cli-bin -maxdepth 1 -type f | head -n1)`,
            `if [ -n "$bin_file" ] && [ "$(basename "$bin_file")" != "${overrideName}" ]; then`,
            `  mv "$bin_file" "/tmp/cli-bin/${overrideName}"`,
            `fi`,
          ]
        : []),
      "chmod +x /tmp/cli-bin/*",
    ].join("\n");

    return dag
      .container()
      .from("alpine:3.21")
      .withExec(["apk", "add", "--no-cache", "curl", "tar", "unzip", "bash"])
      .withExec(["bash", "-c", script])
      .directory("/tmp/cli-bin");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // setup-rust (standalone — also underpins rustBuildAndTest)
  // ──────────────────────────────────────────────────────────────────────────

  @func()
  async setupRust(
    source: Directory,
    toolchain: string = "stable",
    components: string = "clippy,rustfmt",
    target: string = "",
    crates: string = "",
  ): Promise<Container> {
    return this.buildRustContainer(
      source,
      toolchain,
      components,
      target,
      crates,
    );
  }

  @func()
  async pythonBuildAndTest(
    source: Directory,
    pythonVersion: string = "3.12",
  ): Promise<string> {
    const reporter = this.createReporter("python-build-and-test", {
      sourceDir: ".",
      registryUrls: [],
      credentials: {},
    });
    let container = this.withPythonEnv(source, pythonVersion);

    const runStep = async (
      stepName: string,
      command: readonly [string, ...string[]],
    ): Promise<boolean> => {
      const step = reporter.startStep(stepName, {
        command: command.join(" "),
      });
      const result = await this.runCapturedStep(container, stepName, command);
      reporter.endStep(step, {
        success: result.exitCode === 0,
        stdout: result.stdout,
        stderr: result.stderr,
        stdoutSummary: summarizeText(result.stdout),
        stderrSummary: summarizeText(result.stderr),
        exitCode: result.exitCode,
      });
      container = result.container;
      if (result.exitCode !== 0) {
        reporter.recordError(
          stepName,
          result.stderr || result.stdout,
          `Fix ${stepName} failures before continuing`,
        );
        return false;
      }
      return true;
    };

    if (!(await runStep("uv sync", ["uv", "sync", "--all-groups", "--frozen"]))) {
      const report = reporter.finalize();
      return JSON.stringify({
        success: false,
        markdown: report.markdown,
        report,
        reportMarkdown: report.markdown,
      });
    }

    if (!(await runStep("uv build", ["uv", "build"]))) {
      const report = reporter.finalize();
      return JSON.stringify({
        success: false,
        markdown: report.markdown,
        report,
        reportMarkdown: report.markdown,
      });
    }

    if (!(await runStep("uv run pytest", ["uv", "run", "pytest"]))) {
      const report = reporter.finalize();
      return JSON.stringify({
        success: false,
        markdown: report.markdown,
        report,
        reportMarkdown: report.markdown,
      });
    }

    const report = reporter.finalize();
    return JSON.stringify({
      success: true,
      markdown: report.markdown,
      report,
      reportMarkdown: report.markdown,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // setup-node
  // ──────────────────────────────────────────────────────────────────────────

  @func()
  async setupNode(
    source: Directory,
    nodeVersion: string = "24",
    packageManager: string = "auto",
    installDeps: boolean = false,
  ): Promise<Container> {
    const pm =
      packageManager === "auto"
        ? await this.detectNodePm(source)
        : packageManager;

    let c = dag
      .container()
      .from(`node:${nodeVersion}-bookworm-slim`)
      .withMountedDirectory("/src", source)
      .withWorkdir("/src")
      .withExec(["corepack", "enable"]);

    if (installDeps) {
      if (pm === "pnpm")
        c = c.withExec(["pnpm", "install", "--frozen-lockfile"]);
      else if (pm === "yarn")
        c = c.withExec(["yarn", "install", "--frozen-lockfile"]);
      else c = c.withExec(["npm", "ci"]);
    }
    return c;
  }

  private async detectNodePm(source: Directory): Promise<string> {
    const entries = await source.entries();
    if (entries.includes("pnpm-lock.yaml")) return "pnpm";
    if (entries.includes("yarn.lock")) return "yarn";
    return "npm";
  }

  // ──────────────────────────────────────────────────────────────────────────
  // setup-go
  // ──────────────────────────────────────────────────────────────────────────

  @func()
  async setupGo(
    source: Directory,
    goVersion: string = "1.24",
  ): Promise<Container> {
    return dag
      .container()
      .from(`golang:${goVersion}-bookworm`)
      .withMountedDirectory("/src", source)
      .withWorkdir("/src");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // setup-ruby
  // ──────────────────────────────────────────────────────────────────────────

  @func()
  async setupRuby(
    source: Directory,
    rubyVersion: string = "3.4",
    bundleInstall: boolean = false,
  ): Promise<Container> {
    let c = dag
      .container()
      .from(`ruby:${rubyVersion}-bookworm`)
      .withMountedDirectory("/src", source)
      .withWorkdir("/src");
    if (bundleInstall) {
      c = c.withExec(["bundle", "install"]);
    }
    return c;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // setup-java
  // ──────────────────────────────────────────────────────────────────────────

  @func()
  async setupJava(
    source: Directory,
    javaVersion: string = "21",
    distribution: string = "temurin",
  ): Promise<Container> {
    const imageMap: Record<string, string> = {
      temurin: `eclipse-temurin:${javaVersion}-jdk-bookworm`,
      corretto: `amazoncorretto:${javaVersion}`,
      zulu: `azul/zulu-openjdk-debian:${javaVersion}`,
      liberica: `bellsoft/liberica-openjdk-debian:${javaVersion}`,
    };
    const image = imageMap[distribution] ?? imageMap["temurin"];
    return dag
      .container()
      .from(image)
      .withMountedDirectory("/src", source)
      .withWorkdir("/src");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // setup-terraform
  // ──────────────────────────────────────────────────────────────────────────

  @func()
  async setupTerraform(
    source: Directory,
    terraformVersion: string = "latest",
    useOpentofu: boolean = false,
  ): Promise<Container> {
    const version = terraformVersion === "latest" ? "latest" : terraformVersion;
    const image = useOpentofu
      ? `ghcr.io/opentofu/opentofu:${version}`
      : `hashicorp/terraform:${version}`;
    return dag
      .container()
      .from(image)
      .withEntrypoint([])
      .withMountedDirectory("/src", source)
      .withWorkdir("/src");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // setup-pulumi
  // ──────────────────────────────────────────────────────────────────────────

  @func()
  async setupPulumi(
    source: Directory,
    pulumiVersion: string = "latest",
    runtime: string = "nodejs",
  ): Promise<Container> {
    const tag = pulumiVersion === "latest" ? "latest" : `v${pulumiVersion}`;
    const runtimeImageMap: Record<string, string> = {
      nodejs: `pulumi/pulumi-nodejs:${tag}`,
      python: `pulumi/pulumi-python:${tag}`,
      go: `pulumi/pulumi-go:${tag}`,
      dotnet: `pulumi/pulumi-dotnet:${tag}`,
    };
    const image = runtimeImageMap[runtime] ?? `pulumi/pulumi:${tag}`;
    return dag
      .container()
      .from(image)
      .withMountedDirectory("/src", source)
      .withWorkdir("/src");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // rust-binary-release
  // ──────────────────────────────────────────────────────────────────────────

  @func()
  async rustBinaryRelease(
    source: Directory,
    binaryPathsCsv: string,
    tag: string,
    ghToken: string,
    buildCommand: string = "cargo build --release",
    archiveName: string = "bundle.zip",
    toolchain: string = "stable",
    components: string = "clippy,rustfmt",
    repository: string = "",
    discordWebhook: string = "",
  ): Promise<string> {
    const reporter = this.createReporter("rust-binary-release", {
      sourceDir: ".",
      registryUrls: [],
      credentials: { GH_TOKEN: true },
    });

    const resolvedRepository =
      repository.trim() || process.env.GITHUB_REPOSITORY?.trim() || "";
    if (!resolvedRepository) {
      throw new Error(
        "repository must be provided or GITHUB_REPOSITORY env must be set",
      );
    }

    const archiveDir = "/tmp/release-archive";
    const setupScript = [
      "apt-get update -qq",
      "DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends make zip curl gpg",
      "curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg",
      "chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg",
      `echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list`,
      "apt-get update -qq",
      "DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends gh",
    ].join(" && ");

    let container = (
      await this.buildRustContainer(source, toolchain, components, "", "")
    ).withExec(["sh", "-lc", setupScript]);

    // Build
    const buildStep = reporter.startStep("build", { command: buildCommand });
    const buildResult = await this.runCapturedStep(container, "build", [
      "sh",
      "-lc",
      buildCommand,
    ]);
    reporter.endStep(buildStep, {
      success: buildResult.exitCode === 0,
      stdout: buildResult.stdout,
      stderr: buildResult.stderr,
      stdoutSummary: summarizeText(buildResult.stdout),
      stderrSummary: summarizeText(buildResult.stderr),
      exitCode: buildResult.exitCode,
    });
    if (buildResult.exitCode !== 0) {
      reporter.recordError(
        "build",
        buildResult.stderr || buildResult.stdout,
        "Fix build errors before releasing",
      );
      throw new Error(
        `Build failed:\n${buildResult.stderr || buildResult.stdout}`,
      );
    }

    // Zip
    const binaryPaths = this.splitCsv(binaryPathsCsv);
    const zipScript = [
      `mkdir -p ${archiveDir}`,
      `cd /src && zip ${archiveDir}/${archiveName} ${binaryPaths.join(" ")}`,
    ].join(" && ");

    const zipStep = reporter.startStep("zip", {
      command: `zip ${archiveName}`,
    });
    const zipResult = await this.runCapturedStep(buildResult.container, "zip", [
      "sh",
      "-lc",
      zipScript,
    ]);
    reporter.endStep(zipStep, {
      success: zipResult.exitCode === 0,
      stdout: zipResult.stdout,
      stderr: zipResult.stderr,
      stdoutSummary: summarizeText(zipResult.stdout),
      stderrSummary: summarizeText(zipResult.stderr),
      exitCode: zipResult.exitCode,
    });
    if (zipResult.exitCode !== 0) {
      reporter.recordError(
        "zip",
        zipResult.stderr || zipResult.stdout,
        "Check binary paths exist after build",
      );
      throw new Error(`Zip failed:\n${zipResult.stderr || zipResult.stdout}`);
    }

    // Upload via gh CLI
    const uploadScript = [
      "set -eu",
      `gh release upload ${shellQuote(tag)} ${shellQuote(`${archiveDir}/${archiveName}`)} --clobber --repo ${shellQuote(resolvedRepository)}`,
    ].join("\n");

    const uploadContainer = zipResult.container
      .withSecretVariable("GH_TOKEN", dag.setSecret("gh-token", ghToken))
      .withEnvVariable("GITHUB_REPOSITORY", resolvedRepository);

    const uploadStep = reporter.startStep("gh release upload", {
      command: `gh release upload ${tag} ${archiveName}`,
    });
    const uploadResult = await this.runCapturedStep(
      uploadContainer,
      "gh release upload",
      ["sh", "-c", uploadScript],
    );
    reporter.endStep(uploadStep, {
      success: uploadResult.exitCode === 0,
      stdout: uploadResult.stdout,
      stderr: uploadResult.stderr,
      stdoutSummary: summarizeText(uploadResult.stdout),
      stderrSummary: summarizeText(uploadResult.stderr),
      exitCode: uploadResult.exitCode,
    });
    if (uploadResult.exitCode !== 0) {
      reporter.recordError(
        "gh release upload",
        uploadResult.stderr || uploadResult.stdout,
        "Check GH_TOKEN permissions and that the release exists for this tag",
      );
      throw new Error(
        `Upload failed:\n${uploadResult.stderr || uploadResult.stdout}`,
      );
    }

    const report = reporter.finalize();
    await this.sendDiscordNotification(discordWebhook, {
      username: "gh-reusable",
      embeds: [
        {
          title: `🦀 Release Published — ${tag}`,
          color: this.discordColor("success"),
          timestamp: new Date().toISOString(),
          footer: { text: "gh-reusable · rust-binary-release" },
          fields: [
            {
              name: "Repository",
              value: `\`${resolvedRepository}\``,
              inline: true,
            },
            { name: "Tag", value: `\`${tag}\``, inline: true },
            { name: "Archive", value: `\`${archiveName}\``, inline: true },
          ],
        },
      ],
    });
    return JSON.stringify({
      success: true,
      tag,
      archiveName,
      repository: resolvedRepository,
      markdown: report.markdown,
      report,
      reportMarkdown: report.markdown,
    });
  }

  private async buildRustContainer(
    source: Directory,
    toolchain: string,
    components: string,
    target: string,
    crates: string,
  ): Promise<Container> {
    const componentList = this.splitCsv(components);
    const targetList = this.splitCsv(target);
    const crateList = this.splitCsv(crates);

    let container = dag
      .container()
      .from("rust:1.89-bookworm")
      .withMountedDirectory("/src", source)
      .withWorkdir("/src")
      .withEnvVariable("PATH", this.rustPath())
      .withExec([
        "rustup",
        "toolchain",
        "install",
        toolchain,
        "--profile",
        "minimal",
      ])
      .withExec(["rustup", "default", toolchain]);

    for (const component of componentList) {
      container = container.withExec([
        "rustup",
        "component",
        "add",
        "--toolchain",
        toolchain,
        component,
      ]);
    }
    for (const rustTarget of targetList) {
      container = container.withExec(["rustup", "target", "add", rustTarget]);
    }
    for (const crate of crateList) {
      container = container.withExec(["cargo", "install", crate]);
    }

    return container;
  }

  private splitCsv(value: string): string[] {
    return value
      .replaceAll(",", " ")
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  private rustPath(): string {
    return [
      "/usr/local/cargo/bin",
      "/usr/local/rustup/bin",
      "/usr/local/sbin",
      "/usr/local/bin",
      "/usr/sbin",
      "/usr/bin",
      "/sbin",
      "/bin",
    ].join(":");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // semver (standalone with label + branch-name inference)
  // ──────────────────────────────────────────────────────────────────────────

  @func()
  async computeSemver(
    tagsCsv: string = "",
    base: string = "",
    prefix: string = "",
    increment: string = "",
    prLabelsCsv: string = "",
    branchName: string = "",
    majorLabel: string = "major",
    minorLabel: string = "minor",
    patchLabel: string = "patch",
  ): Promise<string> {
    const resolvedIncrement =
      increment.trim() ||
      this.inferIncrement(
        prLabelsCsv,
        branchName,
        majorLabel,
        minorLabel,
        patchLabel,
      );

    const currentVersion =
      base.trim() ||
      this.csv(tagsCsv)
        .filter((t) => t.startsWith(prefix))
        .map((t) => t.slice(prefix.length))
        .filter((t) => semver.valid(t))
        .sort(semver.rcompare)[0] ||
      null;

    if (!currentVersion) {
      if (resolvedIncrement === "major") return `${prefix}1.0.0`;
      if (resolvedIncrement === "minor") return `${prefix}0.1.0`;
      return `${prefix}0.0.1`;
    }

    const normalizedIncrement =
      resolvedIncrement === "major" || resolvedIncrement === "minor"
        ? resolvedIncrement
        : "patch";
    const next = semver.inc(currentVersion, normalizedIncrement);
    if (!next)
      throw new Error(
        `Unable to increment semver "${currentVersion}" by "${normalizedIncrement}"`,
      );
    return `${prefix}${next}`;
  }

  private inferIncrement(
    prLabelsCsv: string,
    branchName: string,
    majorLabel: string,
    minorLabel: string,
    patchLabel: string,
  ): SemverIncrement {
    const labels = this.csv(prLabelsCsv);
    if (labels.includes(majorLabel)) return "major";
    if (labels.includes(minorLabel)) return "minor";
    if (labels.includes(patchLabel)) return "patch";

    if (branchName) {
      const branchRules: BranchRule[] = [
        {
          increment: "major",
          patterns: [
            /(^|[/-])(major|breaking)([/-]|$)/i,
            /(^|[/-])breaking-change([/-]|$)/i,
          ],
        },
        {
          increment: "minor",
          patterns: [/(^|[/-])(feat|feature|minor)([/-]|$)/i, /^release\/.+/i],
        },
        {
          increment: "patch",
          patterns: [
            /(^|[/-])(fix|patch|hotfix|bugfix|chore|docs|refactor|test|ci|perf)([/-]|$)/i,
          ],
        },
      ];
      for (const rule of branchRules) {
        if (rule.patterns.some((p) => p.test(branchName)))
          return rule.increment;
      }
    }

    return "patch";
  }

  // ──────────────────────────────────────────────────────────────────────────
  // docker-facts (full compose-resolution equivalent of the docker-facts action)
  // ──────────────────────────────────────────────────────────────────────────

  @func()
  async dockerFacts(
    source: Directory,
    image: string,
    version: string,
    registries: string = "",
    dockerfile: string = "./Dockerfile",
    context: string = ".",
    canaryLabel: string = "canary",
    forcePush: boolean = false,
    withLatest: boolean = false,
    target: string = "",
    prependTarget: boolean = false,
    eventName: string = "",
    ref: string = "",
    defaultBranch: string = "main",
    prLabelsCsv: string = "",
  ): Promise<string> {
    const resolvedEventName = eventName || process.env.GITHUB_EVENT_NAME || "";
    const resolvedRef = ref || process.env.GITHUB_REF || "";
    const resolvedDefaultBranch =
      defaultBranch || process.env.GITHUB_DEFAULT_BRANCH || "main";

    const composePaths = [
      "docker-compose.yml",
      "docker-compose.yaml",
      "compose.yml",
      "compose.yaml",
    ];
    let resolvedDockerfile = dockerfile;
    let resolvedContext = context;
    let resolvedTarget = target;
    let buildArgs: Record<string, string> = {};

    for (const composePath of composePaths) {
      let composeRaw: string | null = null;
      try {
        composeRaw = await source.file(composePath).contents();
      } catch {
        continue;
      }
      if (composeRaw) {
        const parsed = this.parseDockerComposeYaml(composeRaw, image);
        if (parsed.dockerfile) {
          resolvedDockerfile = parsed.context
            ? `${parsed.context}/${parsed.dockerfile}`
            : `${context}/${parsed.dockerfile}`;
        }
        if (parsed.context) {
          resolvedContext = `${context}/${parsed.context}`
            .replace(/\/\.$/, "")
            .replace(/^\.\//, "");
        }
        if (parsed.target && !target) {
          resolvedTarget = parsed.target;
        }
        buildArgs = parsed.buildArgs;
        break;
      }
    }

    const push = this.resolveDockerFactsPush({
      eventName: resolvedEventName,
      ref: resolvedRef,
      defaultBranch: resolvedDefaultBranch,
      canaryLabel,
      forcePush,
      prLabelsCsv,
    });

    const targetPrefix =
      prependTarget && resolvedTarget ? `${resolvedTarget}-` : "";
    const versionTag = version.startsWith("v")
      ? `${targetPrefix}${version}`
      : `${targetPrefix}v${version}`;
    const refIsTag = resolvedRef.startsWith("refs/tags/");
    const baseTags: string[] = [`${image}:${versionTag}`];
    if (withLatest && refIsTag && !this.isPreRelease(version)) {
      baseTags.push(`${image}:${targetPrefix}latest`);
    }

    const imageWithoutRegistry = this.stripDockerRegistry(image);
    const tags: string[] = [];
    for (const baseTag of baseTags) {
      tags.push(baseTag);
      const [, tagValue = "latest"] = baseTag.split(":");
      for (const registry of this.csv(registries)) {
        tags.push(`${registry}/${imageWithoutRegistry}:${tagValue}`);
      }
    }

    return JSON.stringify({
      context: resolvedContext,
      dockerfile: resolvedDockerfile,
      target: resolvedTarget,
      push,
      tags,
      tagsCsv: tags.join(","),
      buildArgs,
    });
  }

  private parseDockerComposeYaml(
    raw: string,
    imageName: string,
  ): DockerComposeBuild {
    const fallback: DockerComposeBuild = {
      dockerfile: null,
      context: null,
      target: null,
      buildArgs: {},
    };
    try {
      const compose = parseYaml(raw) as {
        services?: Record<string, { image?: unknown; build?: unknown }>;
      } | null;
      if (!compose?.services) return fallback;
      for (const service of Object.values(compose.services)) {
        if (
          typeof service.image !== "string" ||
          !service.image.startsWith(`${imageName}:`)
        )
          continue;
        const build = service.build;
        if (typeof build === "string") return { ...fallback, context: build };
        if (typeof build !== "object" || !build) return fallback;
        const b = build as Record<string, unknown>;
        return {
          dockerfile:
            typeof b["dockerfile"] === "string" ? b["dockerfile"] : null,
          context: typeof b["context"] === "string" ? b["context"] : null,
          target: typeof b["target"] === "string" ? b["target"] : null,
          buildArgs: this.parseDockerBuildArgs(b["args"]),
        };
      }
    } catch {
      return fallback;
    }
    return fallback;
  }

  private parseDockerBuildArgs(args: unknown): Record<string, string> {
    if (args && typeof args === "object" && !Array.isArray(args)) {
      return Object.fromEntries(
        Object.entries(args as Record<string, unknown>)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      );
    }
    if (Array.isArray(args)) {
      return Object.fromEntries(
        (args as unknown[])
          .filter((v): v is string => typeof v === "string" && v.includes("="))
          .map((pair) => {
            const [name, ...rest] = pair.split("=");
            return [name, rest.join("=")];
          }),
      );
    }
    return {};
  }

  private resolveDockerFactsPush(input: DockerFactsPushInput): boolean {
    if (input.forcePush) return true;
    if (
      input.ref === `refs/heads/${input.defaultBranch}` ||
      input.ref.startsWith("refs/tags/")
    )
      return true;
    if (input.eventName === "pull_request") {
      return this.csv(input.prLabelsCsv).includes(input.canaryLabel);
    }
    return false;
  }

  private stripDockerRegistry(image: string): string {
    if (!image.includes("/")) return image;
    const parts = image.split("/");
    const first = parts[0] ?? "";
    if (
      first.includes(".") ||
      first === "localhost" ||
      first === "ghcr" ||
      first === "docker"
    ) {
      return parts.slice(1).join("/");
    }
    return image;
  }

  private isPreRelease(version: string): boolean {
    return ["alpha", "beta", "rc", "dev"].some((token) =>
      version.includes(token),
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // code-matrix
  // ──────────────────────────────────────────────────────────────────────────

  @func()
  async codeMatrix(source: Directory): Promise<string> {
    const has = async (pattern: string) =>
      (await source.glob(pattern)).length > 0;

    const hasPnpmLock = await has("pnpm-lock.yaml");
    const hasYarnLock = await has("yarn.lock");
    const hasPackageLock = await has("package-lock.json");
    const hasPackageJson = await has("package.json");
    const hasCargoToml = await has("Cargo.toml");
    const hasCargoLock = await has("Cargo.lock");
    const hasPyproject = await has("pyproject.toml");
    const hasRequirements = await has("requirements.txt");
    const hasGoMod = await has("go.mod");
    const hasChartYaml =
      (await has("Chart.yaml")) || (await has("*/Chart.yaml"));
    const hasDockerfile =
      (await has("Dockerfile")) || (await has("Dockerfile.*"));
    const hasCompose =
      (await has("docker-compose.yml")) ||
      (await has("docker-compose.yaml")) ||
      (await has("compose.yml")) ||
      (await has("compose.yaml"));
    const isMonorepo =
      (await has("pnpm-workspace.yaml")) ||
      (await has("lerna.json")) ||
      (await has("nx.json"));
    const hasTsConfig =
      (await has("tsconfig.json")) || (await has("tsconfig.*.json"));

    const languages: string[] = [];
    if (hasPackageJson || hasPnpmLock || hasYarnLock || hasPackageLock) {
      languages.push(hasTsConfig ? "typescript" : "javascript");
    }
    if (hasCargoToml) languages.push("rust");
    if (hasPyproject || hasRequirements) languages.push("python");
    if (hasGoMod) languages.push("go");

    const packageManagers: string[] = [];
    if (hasPnpmLock) packageManagers.push("pnpm");
    if (hasYarnLock) packageManagers.push("yarn");
    if (hasPackageLock) packageManagers.push("npm");
    if (hasCargoToml) packageManagers.push("cargo");
    if (hasPyproject || hasRequirements) packageManagers.push("pip");
    if (hasGoMod) packageManagers.push("go");

    const nodePackageManager = hasPnpmLock
      ? "pnpm"
      : hasYarnLock
        ? "yarn"
        : hasPackageJson || hasPackageLock
          ? "npm"
          : "";

    const publishTargets: string[] = [];
    if (nodePackageManager) publishTargets.push(nodePackageManager);
    if (hasCargoToml) publishTargets.push("rust-crate");
    if (hasChartYaml) publishTargets.push("helm-chart");

    const manifests: string[] = [];
    if (hasPackageJson) manifests.push("package.json");
    if (hasCargoToml) manifests.push("Cargo.toml");
    if (hasPyproject) manifests.push("pyproject.toml");
    if (hasGoMod) manifests.push("go.mod");
    if (hasChartYaml) manifests.push("Chart.yaml");

    const lockfiles: string[] = [];
    if (hasPnpmLock) lockfiles.push("pnpm-lock.yaml");
    if (hasYarnLock) lockfiles.push("yarn.lock");
    if (hasPackageLock) lockfiles.push("package-lock.json");
    if (hasCargoLock) lockfiles.push("Cargo.lock");

    const markdown = this.renderCodeMatrixMarkdown({
      languages,
      packageManagers,
      nodePackageManager,
      hasDocker: hasDockerfile,
      hasHelm: hasChartYaml,
      hasCompose,
      isMonorepo,
      manifests,
      lockfiles,
      publishTargets,
    });

    return JSON.stringify({
      languages,
      packageManagers,
      nodePackageManager,
      hasDocker: hasDockerfile,
      hasHelm: hasChartYaml,
      hasCompose,
      isMonorepo,
      manifests,
      lockfiles,
      publishTargets,
      markdown,
    });
  }

  private renderCodeMatrixMarkdown(r: {
    languages: string[];
    packageManagers: string[];
    nodePackageManager: string;
    hasDocker: boolean;
    hasHelm: boolean;
    hasCompose: boolean;
    isMonorepo: boolean;
    manifests: string[];
    lockfiles: string[];
    publishTargets: string[];
  }): string {
    const bool = (v: boolean) => (v ? "✅" : "❌");
    const list = (arr: string[]) =>
      arr.length > 0 ? arr.map((s) => `\`${s}\``).join(", ") : "_(none)_";
    return [
      "### Code Matrix",
      "",
      "| Field | Value |",
      "| --- | --- |",
      `| Languages | ${list(r.languages)} |`,
      `| Package managers | ${list(r.packageManagers)} |`,
      `| Node package manager | ${r.nodePackageManager ? `\`${r.nodePackageManager}\`` : "_(none)_"} |`,
      `| Publish targets | ${list(r.publishTargets)} |`,
      `| Manifests | ${list(r.manifests)} |`,
      `| Lockfiles | ${list(r.lockfiles)} |`,
      `| Docker | ${bool(r.hasDocker)} |`,
      `| Helm | ${bool(r.hasHelm)} |`,
      `| Docker Compose | ${bool(r.hasCompose)} |`,
      `| Monorepo | ${bool(r.isMonorepo)} |`,
    ].join("\n");
  }
}

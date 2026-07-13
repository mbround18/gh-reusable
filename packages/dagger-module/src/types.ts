import type { Container } from "@dagger.io/dagger";

// ─── Primitive aliases ────────────────────────────────────────────────────────

export type SemverIncrement = "major" | "minor" | "patch";
export type DockerReleaseDecision = "publish" | "skip" | "failed";
export type NodePackageManager = "npm" | "pnpm" | "yarn";
export type PublishTarget =
  | "npm"
  | "pnpm"
  | "yarn"
  | "rust-crate"
  | "helm-chart";

// ─── Publish domain ──────────────────────────────────────────────────────────

export interface NamedVersion {
  name: string;
  version: string;
}

export interface PublishResult {
  target: PublishTarget;
  name: string;
  version: string;
  registry: string;
  url: string;
  digest?: string;
  packageManager?: NodePackageManager;
  artifactPath?: string;
  notes?: string;
}

export interface NodePublishOptions {
  manager: NodePackageManager;
  registry: string;
  token: string;
  tag: string;
  version: string;
  publish?: boolean;
  discordWebhook?: string;
}

// ─── Docker domain ───────────────────────────────────────────────────────────

export interface DockerReleaseSummary {
  decision: DockerReleaseDecision;
  outcome: string;
  image: string;
  versionTag: string;
  releaseTag: string;
  context: string;
  dockerfile: string;
  target: string;
  platforms: string;
  registries: string;
  dockerAuth: boolean;
  ghcrAuth: boolean;
  reason?: string;
  plannedAddresses: string[];
  publishedRefs: string[];
  markdown: string;
}

export interface DockerReleaseContext {
  eventName: string;
  ref: string;
  branchName: string;
  isPullRequestContext: boolean;
  forcePush: boolean;
  canaryLabel: string;
  hasCanaryLabel: boolean;
  runUrl: string;
  runNumber: string;
}

export interface DockerFactsPushInput {
  eventName: string;
  ref: string;
  defaultBranch: string;
  canaryLabel: string;
  forcePush: boolean;
  prLabelsCsv: string;
}

export interface DockerComposeBuild {
  dockerfile: string | null;
  context: string | null;
  target: string | null;
  buildArgs: Record<string, string>;
}

// ─── Pipeline internals ──────────────────────────────────────────────────────

export interface StepResult {
  container: Container;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ReporterInputs {
  sourceDir: string;
  version?: string;
  registryUrls?: readonly string[];
  credentials?: Readonly<Record<string, boolean>>;
}

export interface RustModeOutcome {
  mode: "publish" | "docs";
  enabled: boolean;
  attempted: boolean;
  success?: boolean;
  skippedReason?: string;
  failureReason?: string;
}

export interface RustPipelineModeOutcomes {
  publish: RustModeOutcome;
  docs: RustModeOutcome;
}

export interface BranchRule {
  increment: SemverIncrement;
  patterns: RegExp[];
}

// ─── Discord ─────────────────────────────────────────────────────────────────

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  timestamp?: string;
  thumbnail?: { url: string };
  image?: { url: string };
  author?: { name: string; url?: string; icon_url?: string };
  footer?: { text: string; icon_url?: string };
  fields?: DiscordEmbedField[];
}

export interface DiscordWebhookPayload {
  username?: string;
  avatar_url?: string;
  content?: string;
  embeds?: DiscordEmbed[];
}

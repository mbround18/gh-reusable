export type PipelineStepStatus = 'success' | 'failure' | 'skipped';

export interface PipelineReportMetadata {
  readonly pipelineName: string;
  readonly startTimestamp: string;
  readonly endTimestamp: string;
  readonly gitCommit: string;
  readonly branch: string;
  readonly tag: string;
  readonly daggerEngineVersion: string;
}

export interface PipelineReportInputs {
  readonly sourceDir: string;
  readonly version?: string;
  readonly registryUrls: readonly string[];
  readonly credentials: Readonly<Record<string, boolean>>;
}

export interface PipelineReportStep {
  readonly name: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly containerImage?: string;
  readonly command?: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutSummary: string;
  readonly stderrSummary: string;
  readonly success: boolean;
  readonly exitCode?: number;
}

export interface PipelineReportError {
  readonly step: string;
  readonly exitCode?: number;
  readonly stderrSnippet: string;
  readonly rawLog: string;
  readonly recommendedFix: string;
}

export interface PipelineReportOutputs {
  readonly publishedVersion?: string;
  readonly artifactDigests?: Readonly<Record<string, string>>;
  readonly registryUrls?: readonly string[];
  readonly packageMetadata?: Readonly<Record<string, string>>;
  readonly scanFindings?: Readonly<Record<string, number>>;
  readonly cacheBackend?: string;
  readonly cacheKey?: string;
}

export interface PipelineReport {
  readonly metadata: PipelineReportMetadata;
  readonly inputs: PipelineReportInputs;
  readonly steps: readonly PipelineReportStep[];
  readonly outputs: PipelineReportOutputs;
  readonly errors: readonly PipelineReportError[];
  readonly warnings: readonly string[];
  readonly markdown: string;
}

export interface ReportStepDraft {
  readonly name: string;
  readonly containerImage?: string;
  readonly command?: string;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly stdoutSummary?: string;
  readonly stderrSummary?: string;
  readonly exitCode?: number;
  readonly success: boolean;
  readonly startedAt: Date;
  readonly endedAt: Date;
}

export interface PipelineReporterOptions {
  readonly pipelineName: string;
  readonly sourceDir: string;
  readonly version?: string;
  readonly registryUrls?: readonly string[];
  readonly credentials?: Readonly<Record<string, boolean>>;
  readonly environment?: Readonly<Record<string, string | undefined>>;
}

export class PipelineReporter {
  private readonly metadata: PipelineReportMetadata;
  private readonly inputs: PipelineReportInputs;
  private readonly steps: PipelineReportStep[] = [];
  private readonly errors: PipelineReportError[] = [];
  private readonly warnings: string[] = [];
  private readonly outputs: PipelineReportOutputs = {};

  constructor(options: PipelineReporterOptions) {
    const environment = options.environment ?? process.env;
    this.metadata = {
      pipelineName: options.pipelineName,
      startTimestamp: new Date().toISOString(),
      endTimestamp: new Date().toISOString(),
      gitCommit: environment.GITHUB_SHA ?? '',
      branch: environment.GITHUB_REF_NAME ?? environment.GITHUB_HEAD_REF ?? '',
      tag: environment.GITHUB_REF?.startsWith('refs/tags/') ? environment.GITHUB_REF.slice('refs/tags/'.length) : '',
      daggerEngineVersion: environment.DAGGER_VERSION ?? environment.DAGGER_ENGINE_VERSION ?? ''
    };
    this.inputs = {
      sourceDir: options.sourceDir,
      version: options.version,
      registryUrls: options.registryUrls ?? [],
      credentials: options.credentials ?? {}
    };
  }

  startStep(name: string, details: Pick<ReportStepDraft, 'containerImage' | 'command'> = {}): ReportStepDraft {
    const startedAt = new Date();
    return {
      name,
      startedAt,
      endedAt: startedAt,
      success: false,
      stdoutSummary: '',
      stderrSummary: '',
      ...details
    };
  }

  endStep(step: ReportStepDraft, result: Pick<ReportStepDraft, 'stdout' | 'stderr' | 'stdoutSummary' | 'stderrSummary' | 'exitCode' | 'success'>): void {
    const endedAt = new Date();
    this.steps.push({
      name: step.name,
      startedAt: step.startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: Math.max(0, endedAt.getTime() - step.startedAt.getTime()),
      containerImage: step.containerImage,
      command: step.command,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      stdoutSummary: result.stdoutSummary,
      stderrSummary: result.stderrSummary,
      success: result.success,
      exitCode: result.exitCode
    });
  }

  recordError(step: string, error: unknown, recommendedFix: string): void {
    const { message, exitCode, stderrSnippet } = normalizeError(error);
    this.errors.push({
      step,
      exitCode,
      stderrSnippet: message || stderrSnippet,
      rawLog: typeof error === 'string' ? error : message || stderrSnippet,
      recommendedFix
    });
  }

  recordWarning(message: string): void {
    this.warnings.push(message);
  }

  setOutput<K extends keyof PipelineReportOutputs>(key: K, value: PipelineReportOutputs[K]): void {
    (this.outputs as Record<string, unknown>)[key] = value;
  }

  finalize(): PipelineReport {
    const endTimestamp = new Date().toISOString();
    const metadata = { ...this.metadata, endTimestamp };
    return {
      metadata,
      inputs: this.inputs,
      steps: this.steps,
      outputs: this.outputs,
      errors: this.errors,
      warnings: this.warnings,
      markdown: renderPipelineReportMarkdown(metadata, this.inputs, this.steps, this.outputs, this.errors, this.warnings)
    };
  }
}

export function normalizeError(error: unknown): { message: string; exitCode?: number; stderrSnippet: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      exitCode: extractExitCode(error.message),
      stderrSnippet: error.message
    };
  }

  return {
    message: String(error),
    stderrSnippet: String(error)
  };
}

export function renderPipelineReportMarkdown(
  metadata: PipelineReportMetadata,
  inputs: PipelineReportInputs,
  steps: readonly PipelineReportStep[],
  outputs: PipelineReportOutputs,
  errors: readonly PipelineReportError[],
  warnings: readonly string[] = []
): string {
  const statusIcon = errors.length > 0 ? '❌' : '✅';
  const lines: string[] = [
    `${statusIcon} **${metadata.pipelineName}**`,
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| Start | \`${metadata.startTimestamp}\` |`,
    `| End | \`${metadata.endTimestamp}\` |`,
    `| Commit | \`${metadata.gitCommit || 'n/a'}\` |`,
    `| Branch | \`${metadata.branch || 'n/a'}\` |`,
    `| Tag | \`${metadata.tag || 'n/a'}\` |`,
    `| Dagger engine | \`${metadata.daggerEngineVersion || 'n/a'}\` |`,
    `| Source | \`${inputs.sourceDir}\` |`,
    `| Version | \`${inputs.version || 'n/a'}\` |`,
    `| Registries | \`${inputs.registryUrls.length > 0 ? inputs.registryUrls.join(', ') : 'n/a'}\` |`,
    `| Credentials used | \`${Object.entries(inputs.credentials).filter(([, used]) => used).map(([key]) => key).join(', ') || 'none'}\` |`,
    ''
  ];

  lines.push('### Steps');
  if (steps.length === 0) {
    lines.push('- (none)');
  } else {
    for (const step of steps) {
      const icon = step.success ? '✅' : '❌';
      lines.push(
        `- ${icon} **${step.name}** (${step.durationMs}ms)${step.command ? ` — \`${step.command}\`` : ''}${step.containerImage ? ` [${step.containerImage}]` : ''}`
      );
      if (step.stdoutSummary) {
        lines.push(`  - stdout: ${truncate(step.stdoutSummary, 240)}`);
      }
      if (step.stderrSummary) {
        lines.push(`  - stderr: ${truncate(step.stderrSummary, 240)}`);
      }
    }
  }

  lines.push('', '### Outputs');
  const outputPairs: Array<[string, string | undefined]> = [
    ['Published version', outputs.publishedVersion],
    ['Registry URLs', outputs.registryUrls?.join(', ')],
    ['Artifact digests', outputs.artifactDigests ? JSON.stringify(outputs.artifactDigests) : undefined],
    ['Package metadata', outputs.packageMetadata ? JSON.stringify(outputs.packageMetadata) : undefined],
    ['Scan findings', outputs.scanFindings ? JSON.stringify(outputs.scanFindings) : undefined],
    ['Cache backend', outputs.cacheBackend],
    ['Cache key', outputs.cacheKey]
  ];
  for (const [label, value] of outputPairs) {
    lines.push(`| ${label} | \`${value || 'n/a'}\` |`);
  }

  lines.push('', '### Errors');
  if (errors.length === 0) {
    lines.push('- (none)');
  } else {
    for (const error of errors) {
      lines.push(
        `- ❌ **${error.step}**${error.exitCode !== undefined ? ` (exit ${error.exitCode})` : ''}: ${truncate(error.stderrSnippet, 280)}`
      );
      lines.push(`  - fix: ${error.recommendedFix}`);
      if (error.rawLog) {
        lines.push(renderLogDetails('raw log', error.rawLog));
      }
    }
  }

  lines.push('', '### Warnings');
  if (warnings.length === 0) {
    lines.push('- (none)');
  } else {
    for (const warning of warnings) {
      lines.push(`- ⚠️ ${warning}`);
    }
  }

  const failedSteps = steps.filter((step) => !step.success);
  if (failedSteps.length > 0) {
    lines.push('', '### Failure logs');
    for (const step of failedSteps) {
      lines.push(`- ❌ **${step.name}**${step.exitCode !== undefined ? ` (exit ${step.exitCode})` : ''}`);
      if (step.stdout) {
        lines.push(renderLogDetails('stdout', step.stdout));
      }
      if (step.stderr) {
        lines.push(renderLogDetails('stderr', step.stderr));
      }
    }
  }

  return lines.join('\n');
}

export function summarizeText(text: string, limit = 200): string {
  return truncate(text.trim().replace(/\s+/g, ' '), limit);
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, Math.max(0, limit - 1))}…`;
}

function extractExitCode(message: string): number | undefined {
  const match = message.match(/exit code (\d+)/i);
  return match?.[1] ? Number(match[1]) : undefined;
}

function renderLogDetails(label: string, value: string): string {
  return [
    `<details><summary>${escapeHtml(label)}</summary>`,
    '',
    `<pre>${escapeHtml(value)}</pre>`,
    '</details>'
  ].join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

import * as core from '@actions/core';

import { resolveDockerFacts } from './lib';

function getRequiredInput(name: string): string {
  return core.getInput(name, { required: true });
}

function getBooleanInput(name: string, defaultValue = false): boolean {
  const value = core.getInput(name);
  if (!value) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true';
}

function getStringInput(name: string, defaultValue = ''): string {
  return core.getInput(name) || defaultValue;
}

function parseRegistries(value: string): readonly string[] {
  return value
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function exportBuildArgs(buildArgs: Readonly<Record<string, string>>): void {
  for (const [name, value] of Object.entries(buildArgs)) {
    process.env[`BUILD_ARG_${name.toUpperCase()}`] = value;
  }
}

async function run(): Promise<void> {
  try {
    const result = resolveDockerFacts(
      {
        image: getRequiredInput('image'),
        version: getRequiredInput('version'),
        registries: parseRegistries(getStringInput('registries')),
        dockerfile: getStringInput('dockerfile', './Dockerfile'),
        context: getStringInput('context', '.'),
        canaryLabel: getStringInput('canary_label', 'canary'),
        forcePush: getBooleanInput('force_push'),
        withLatest: getBooleanInput('with_latest'),
        target: getStringInput('target'),
        prependTarget: getBooleanInput('prepend_target')
      },
      {
        workspace: process.env.GITHUB_WORKSPACE || '.',
        eventName: process.env.GITHUB_EVENT_NAME || '',
        ref: process.env.GITHUB_REF || '',
        defaultBranch: process.env.GITHUB_DEFAULT_BRANCH || 'main',
        eventPath: process.env.GITHUB_EVENT_PATH
      }
    );

    exportBuildArgs(result.buildArgs);
    core.setOutput('dockerfile', result.dockerfile);
    core.setOutput('context', result.context);
    core.setOutput('target', result.target);
    core.setOutput('push', result.push ? 'true' : 'false');
    core.setOutput('tags', result.tags.join(','));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(message);
  }
}

void run();

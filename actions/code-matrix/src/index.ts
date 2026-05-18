import * as path from 'node:path';

import * as core from '@actions/core';

import { detectCodeMatrix } from './lib';

async function run(): Promise<void> {
  try {
    const inputPath = core.getInput('path') || '.';
    const resolvedPath = path.resolve(inputPath);

    core.info(`Detecting code matrix for: ${resolvedPath}`);

    const result = detectCodeMatrix(resolvedPath);

    core.setOutput('json', JSON.stringify(result));
    core.setOutput('languages', result.languages);
    core.setOutput('package-managers', result.packageManagers);
    core.setOutput('node-package-manager', result.nodePackageManager);
    core.setOutput('has-docker', String(result.hasDocker));
    core.setOutput('has-helm', String(result.hasHelm));
    core.setOutput('has-compose', String(result.hasCompose));
    core.setOutput('is-monorepo', String(result.isMonorepo));
    core.setOutput('publish-targets', result.publishTargets);

    await core.summary
      .addHeading('Code Matrix Detection Results')
      .addTable([
        [
          { data: 'Property', header: true },
          { data: 'Value', header: true }
        ],
        ['Languages', result.languages || '(none)'],
        ['Package Managers', result.packageManagers || '(none)'],
        ['Node Package Manager', result.nodePackageManager || '(none)'],
        ['Has Docker', String(result.hasDocker)],
        ['Has Helm', String(result.hasHelm)],
        ['Has Compose', String(result.hasCompose)],
        ['Is Monorepo', String(result.isMonorepo)],
        ['Publish Targets', result.publishTargets || '(none)'],
        ['Manifests', result.manifests || '(none)'],
        ['Lockfiles', result.lockfiles || '(none)']
      ])
      .write();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(message);
  }
}

void run();

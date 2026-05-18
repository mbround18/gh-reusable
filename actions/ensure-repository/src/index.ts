import * as core from '@actions/core';

async function run(): Promise<void> {
  try {
    const expectedRepository = core.getInput('repository', { required: true });
    const actualRepository = process.env.GITHUB_REPOSITORY ?? '';

    if (!actualRepository) {
      core.setFailed(
        'GITHUB_REPOSITORY environment variable is not set. This action must run inside a GitHub Actions workflow.'
      );
      return;
    }

    if (actualRepository !== expectedRepository) {
      core.setFailed(
        `Repository mismatch: expected "${expectedRepository}" but this workflow is running in "${actualRepository}". ` +
          'This action is restricted to specific repositories.'
      );
      return;
    }

    core.info(`Repository check passed: "${actualRepository}" matches the expected repository.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(message);
  }
}

void run();

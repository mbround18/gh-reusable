import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { expect, test } from 'vitest';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const repositoryRoot = path.resolve(dirname, '../../../');
const workflowPath = path.join(repositoryRoot, '.github', 'workflows', 'docker-release.yaml');

type WorkflowStep = {
  name?: string;
  id?: string;
  if?: string;
  uses?: string;
  env?: Record<string, string>;
};

function getDockerReleaseSteps(): WorkflowStep[] {
  const workflow = parse(readFileSync(workflowPath, 'utf8')) as {
    jobs?: {
      release?: {
        steps?: WorkflowStep[];
      };
    };
  };
  return workflow.jobs?.release?.steps ?? [];
}

test('docker release workflow has rich summary and PR/release reporting steps', () => {
  const steps = getDockerReleaseSteps();
  const daggerStep = steps.find((step) => step.id === 'dagger_release');
  const summaryStep = steps.find((step) => step.id === 'release_summary');
  const stickyCommentStep = steps.find((step) => step.name === 'Update sticky PR status comment');
  const historyStep = steps.find((step) => step.name === 'Add PR run history comment');
  const releaseNotesStep = steps.find((step) => step.name === 'Update tag release notes');

  expect(daggerStep?.uses).toContain('dagger/dagger-for-github@');
  expect(summaryStep?.if).toContain("github.event_name == 'pull_request'");
  expect(summaryStep?.if).toContain("startsWith(github.ref, 'refs/tags/')");
  expect(stickyCommentStep?.uses).toContain('actions/github-script@');
  expect(historyStep?.uses).toContain('actions/github-script@');
  expect(releaseNotesStep?.if).toContain('inputs.track_release_summary');
});

test('docker release workflow declares optional release summary input', () => {
  const workflow = parse(readFileSync(workflowPath, 'utf8')) as {
    on?: {
      workflow_call?: {
        inputs?: Record<string, { type?: string; default?: unknown }>;
      };
    };
  };

  const input = workflow.on?.workflow_call?.inputs?.track_release_summary;
  expect(input?.type).toBe('boolean');
  expect(input?.default).toBe(false);
});

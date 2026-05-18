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
  with?: Record<string, string>;
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
  const reportStep = steps.find((step) => step.name === 'Materialize docker release report');
  const reportUpload = steps.find((step) => step.name === 'Upload docker release report artifact');
  const stickyCommentStep = steps.find((step) => step.name === 'Update sticky PR status comment');
  const historyStep = steps.find((step) => step.name === 'Add PR run history comment');
  const releaseNotesStep = steps.find((step) => step.name === 'Update tag release notes');
  const failureStep = steps.find((step) => step.name === 'Fail workflow on docker release error');

  expect(daggerStep?.uses).toContain('dagger/dagger-for-github@');
  expect(daggerStep?.with?.call).toContain('--event-name=');
  expect(daggerStep?.with?.call).toContain('--pr-labels-csv=');
  expect(daggerStep?.with?.call).toContain('--docker-token=');
  expect(daggerStep?.with?.call).toContain('--ghcr-token=');
  expect(reportStep?.uses).toContain('actions/github-script@');
  expect(reportUpload?.uses).toContain('actions/upload-artifact@');
  expect(stickyCommentStep?.uses).toContain('actions/github-script@');
  expect(stickyCommentStep?.env?.SUMMARY_JSON).toContain('steps.dagger_release.outputs.stdout');
  expect(historyStep?.uses).toContain('actions/github-script@');
  expect(historyStep?.env?.SUMMARY_JSON).toContain('steps.dagger_release.outputs.stdout');
  expect(releaseNotesStep?.if).toContain('inputs.track_release_summary');
  expect(releaseNotesStep?.env?.SUMMARY_JSON).toContain('steps.dagger_release.outputs.stdout');
  expect(failureStep?.uses).toContain('actions/github-script@');
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

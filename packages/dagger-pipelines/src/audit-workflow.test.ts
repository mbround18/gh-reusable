import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { expect, test } from 'vitest';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const repositoryRoot = path.resolve(dirname, '../../../');
const workflowPath = path.join(repositoryRoot, '.github', 'workflows', 'audit.yaml');

type WorkflowStep = {
  name?: string;
  id?: string;
  if?: string;
  uses?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
};

function readAuditWorkflow(): {
  on?: {
    workflow_call?: {
      inputs?: Record<string, { type?: string; default?: unknown }>;
    };
  };
  permissions?: Record<string, string>;
  jobs?: {
    audit?: {
      steps?: WorkflowStep[];
    };
  };
} {
  return parse(readFileSync(workflowPath, 'utf8'));
}

test('audit workflow exposes reusable inputs and required permissions', () => {
  const workflow = readAuditWorkflow();
  const inputs = workflow.on?.workflow_call?.inputs ?? {};

  expect(inputs.create_alerts?.type).toBe('boolean');
  expect(inputs.create_alerts?.default).toBe(false);
  expect(inputs.track_release_summary?.type).toBe('boolean');
  expect(inputs.track_release_summary?.default).toBe(false);

  expect(workflow.permissions?.['security-events']).toBe('write');
  expect(workflow.permissions?.contents).toBe('write');
  expect(workflow.permissions?.['pull-requests']).toBe('write');
});

test('audit workflow runs module audit and supports SARIF alerts + PR history', () => {
  const steps = readAuditWorkflow().jobs?.audit?.steps ?? [];

  const daggerStep = steps.find((step) => step.id === 'dagger_audit');
  const sarifStep = steps.find((step) => step.name === 'Generate SARIF reports for alerts');
  const semgrepUpload = steps.find((step) => step.name === 'Upload Semgrep SARIF');
  const gitleaksUpload = steps.find((step) => step.name === 'Upload Gitleaks SARIF');
  const reportStep = steps.find((step) => step.name === 'Materialize audit report');
  const reportUpload = steps.find((step) => step.name === 'Upload audit report artifact');
  const stickyComment = steps.find((step) => step.name === 'Update sticky PR audit comment');
  const historyComment = steps.find((step) => step.name === 'Add PR audit history comment');
  const releaseNotes = steps.find((step) => step.name === 'Update tag release notes with audit summary');

  expect(daggerStep?.uses).toContain('dagger/dagger-for-github@');
  expect(daggerStep?.env?.DAGGER_NO_NAG).toBe('1');
  expect(String(daggerStep?.with?.module ?? '')).toContain('/packages/dagger-module@dagger/io');
  expect(String(daggerStep?.with?.call ?? '')).toContain('audit');

  expect(sarifStep?.if).toContain('inputs.create_alerts');
  expect(semgrepUpload?.uses).toContain('github/codeql-action/upload-sarif@');
  expect(gitleaksUpload?.uses).toContain('github/codeql-action/upload-sarif@');
  expect(reportStep?.uses).toContain('actions/github-script@');
  expect(reportUpload?.uses).toContain('actions/upload-artifact@');
  expect(stickyComment?.uses).toContain('actions/github-script@');
  expect(historyComment?.uses).toContain('actions/github-script@');
  expect(releaseNotes?.if).toContain('inputs.track_release_summary');
});

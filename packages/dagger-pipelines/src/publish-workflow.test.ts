import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { expect, test } from 'vitest';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const repositoryRoot = path.resolve(dirname, '../../../');
const workflowPath = path.join(repositoryRoot, '.github', 'workflows', 'publish.yaml');

type WorkflowStep = {
  name?: string;
  id?: string;
  if?: string;
  uses?: string;
  with?: Record<string, string>;
  env?: Record<string, string>;
};

function getWorkflow() {
  return parse(readFileSync(workflowPath, 'utf8')) as {
    on?: {
      workflow_dispatch?: {
        inputs?: Record<string, { type?: string; default?: unknown; options?: string[] }>;
      };
    };
    jobs?: Record<string, { steps?: WorkflowStep[] }>;
  };
}

test('publish workflow exposes manual target selection', () => {
  const workflow = getWorkflow();
  const target = workflow.on?.workflow_dispatch?.inputs?.target;
  const helmRegistry = workflow.on?.workflow_dispatch?.inputs?.helm_registry;

  expect(target?.type).toBe('choice');
  expect(target?.default).toBe('all');
  expect(target?.options).toEqual(expect.arrayContaining(['npm', 'pnpm', 'yarn', 'rust', 'helm']));
  expect(helmRegistry?.default).toBe('oci://registry-1.docker.io/helm-charts');
});

test('publish workflow wires every publish entrypoint', () => {
  const workflow = getWorkflow();
  const jobs = workflow.jobs ?? {};

  expect(Object.keys(jobs)).toEqual(expect.arrayContaining([
    'publish_npm',
    'publish_pnpm',
    'publish_yarn',
    'publish_rust',
    'publish_helm'
  ]));

  const allSteps = Object.entries(jobs).flatMap(([jobName, job]) =>
    (job.steps ?? []).map((step) => ({ jobName, step }))
  );

  const daggerCalls = allSteps.filter(({ step }) => typeof step.uses === 'string' && step.uses.startsWith('dagger/dagger-for-github@'));
  expect(daggerCalls).toHaveLength(5);
  expect(daggerCalls.some(({ step }) => step.with?.call?.includes('publish-npm'))).toBe(true);
  expect(daggerCalls.some(({ step }) => step.with?.call?.includes('publish-pnpm'))).toBe(true);
  expect(daggerCalls.some(({ step }) => step.with?.call?.includes('publish-yarn'))).toBe(true);
  expect(daggerCalls.some(({ step }) => step.with?.call?.includes('publish-rust-crate'))).toBe(true);
  expect(daggerCalls.some(({ step }) => step.with?.call?.includes('publish-helm-chart'))).toBe(true);
});

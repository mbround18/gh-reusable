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
      workflow_call?: {
        secrets?: Record<string, unknown>;
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

test('publish workflow accepts cache secrets for backend selection', () => {
  const workflow = getWorkflow();
  const secrets = workflow.on?.workflow_call?.secrets ?? {};

  expect(secrets.S3_ACCESS_KEY).toBeDefined();
  expect(secrets.S3_SECRET_KEY).toBeDefined();
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

  expect(allSteps.some(({ step }) => step.name?.startsWith('Materialize ') && step.name?.endsWith(' report'))).toBe(true);
  expect(allSteps.some(({ step }) => step.name?.startsWith('Upload ') && step.name?.endsWith(' report artifact'))).toBe(true);

  const daggerCalls = allSteps.filter(({ step }) => typeof step.uses === 'string' && step.uses.startsWith('dagger/dagger-for-github@'));
  expect(daggerCalls).toHaveLength(5);
  expect(daggerCalls.every(({ step }) => step.env?.GITHUB_TOKEN === '${{ secrets.GITHUB_TOKEN }}')).toBe(true);
  expect(daggerCalls.every(({ step }) => step.env?.S3_ENDPOINT === '${{ vars.S3_ENDPOINT }}')).toBe(true);
  expect(daggerCalls.every(({ step }) => step.env?.S3_ACCESS_KEY === '${{ secrets.S3_ACCESS_KEY }}')).toBe(true);
  expect(daggerCalls.every(({ step }) => step.env?.S3_SECRET_KEY === '${{ secrets.S3_SECRET_KEY }}')).toBe(true);
  expect(daggerCalls.some(({ step }) => step.with?.call?.includes('publish-npm'))).toBe(true);
  expect(daggerCalls.some(({ step }) => step.with?.call?.includes('publish-pnpm'))).toBe(true);
  expect(daggerCalls.some(({ step }) => step.with?.call?.includes('publish-yarn'))).toBe(true);
  expect(daggerCalls.some(({ step }) => step.with?.call?.includes('publish-rust-crate'))).toBe(true);
  expect(daggerCalls.some(({ step }) => step.with?.call?.includes('publish-helm-chart'))).toBe(true);
});

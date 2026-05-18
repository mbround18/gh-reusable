import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { expect, test } from 'vitest';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const repositoryRoot = path.resolve(dirname, '../../../');
const workflowsDir = path.join(repositoryRoot, '.github', 'workflows');

type WorkflowDoc = {
  on?: {
    workflow_call?: {
      inputs?: Record<string, unknown>;
      secrets?: Record<string, unknown>;
    };
    workflow_dispatch?: {
      inputs?: Record<string, unknown>;
    };
  };
};

function listWorkflowFiles(): string[] {
  return readdirSync(workflowsDir)
    .filter((entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'))
    .sort();
}

function readWorkflow(fileName: string): { raw: string; doc: WorkflowDoc } {
  const fullPath = path.join(workflowsDir, fileName);
  const raw = readFileSync(fullPath, 'utf8');
  return { raw, doc: parse(raw) as WorkflowDoc };
}

function expectWorkflowReferences(raw: string, kind: 'input' | 'secret', names: string[], workflowFile: string): void {
  for (const name of names) {
    const token = kind === 'input' ? `inputs.${name}` : `secrets.${name}`;
    expect(
      raw.includes(token),
      `${workflowFile} declares ${kind} "${name}" but never references \${{ ${token} }}`
    ).toBe(true);
  }
}

test('workflow inputs and secrets are always referenced', () => {
  for (const workflowFile of listWorkflowFiles()) {
    const { raw, doc } = readWorkflow(workflowFile);
    const callInputs = Object.keys(doc.on?.workflow_call?.inputs ?? {});
    const dispatchInputs = Object.keys(doc.on?.workflow_dispatch?.inputs ?? {});
    const secrets = Object.keys(doc.on?.workflow_call?.secrets ?? {});

    expectWorkflowReferences(raw, 'input', callInputs, workflowFile);
    expectWorkflowReferences(raw, 'input', dispatchInputs, workflowFile);
    expectWorkflowReferences(raw, 'secret', secrets, workflowFile);
  }
});

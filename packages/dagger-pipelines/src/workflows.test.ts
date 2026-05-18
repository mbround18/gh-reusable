import { expect, test } from 'vitest';

import { WORKFLOW_DEFINITIONS, validateWorkflowDefinitions } from './workflows.js';

function getCiWorkflowCommands(workflowId: keyof typeof WORKFLOW_DEFINITIONS): readonly string[] {
  const definition = WORKFLOW_DEFINITIONS[workflowId];
  if (definition.kind !== 'ci') {
    throw new Error(`${workflowId} must be a ci workflow for this test`);
  }

  return definition.config.test.map((command) => command.args.join(' '));
}

test('workflow definitions remain valid', () => {
  expect(validateWorkflowDefinitions()).toEqual([]);
});

test('tier1 workflows use executable parity flows instead of shallow checks', () => {
  const ensureRepository = getCiWorkflowCommands('test-ensure-repository').join('\n');
  expect(ensureRepository).toContain('check_repository');
  expect(ensureRepository).toContain('Repository mismatch');

  const updateReadme = getCiWorkflowCommands('update-readme').join('\n');
  expect(updateReadme).toContain('actions/github-catalog/index.js');
  expect(updateReadme).toContain('GENERATED:GITHUB-CATALOG:START');

  const tagger = getCiWorkflowCommands('tagger').join('\n');
  expect(tagger).toContain('npm --prefix actions/semver test');
  expect(tagger).toContain('git tag -a');
  expect(tagger).toContain('gh release create --help');

  const graphqlAction = getCiWorkflowCommands('test-graphql-action').join('\n');
  expect(graphqlAction).toContain('npm --prefix actions/graphql run build');
  expect(graphqlAction).toContain('defaultBranchRef');
  expect(graphqlAction).toContain('INPUT_URL');

  const installCli = getCiWorkflowCommands('test-install-cli').join('\n');
  expect(installCli).toContain('install_cli_release');
  expect(installCli).toContain('schollz/croc');
  expect(installCli).toContain('astral-sh/uv');
  expect(installCli).toContain('jqlang/jq');
});

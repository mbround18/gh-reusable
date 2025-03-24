const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');
const path = require('path');
const glob = require('glob');
const { render } = require('jinja2');
const { graphql } = require('@octokit/graphql');

// Helpers
const readFile = filePath => fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';

const getLatestVersion = async (graphqlWithAuth, owner, repo) => {
  const queryPath = path.join(__dirname, 'queries', 'get-latest-version.gql');
  const query = fs.readFileSync(queryPath, 'utf-8');

  const data = await graphqlWithAuth(query, { owner, repo });
  const latestTag = data.repository.refs.nodes[0]?.name;
  const defaultBranch = data.repository.defaultBranchRef?.name;
  return latestTag || defaultBranch || 'main';
};


const extractUsageFromWorkflow = (workflowYaml) => {
  const inputs = workflowYaml?.on?.workflow_call?.inputs || {};
  const required = Object.entries(inputs).filter(([_, val]) => val.required).map(([key]) => key);
  const optional = Object.entries(inputs).filter(([_, val]) => !val.required).map(([key]) => key);

  return {
    required,
    optional,
    usage: `uses: <OWNER>/<REPO>/.github/workflows/<FILE>@<VERSION>`
  };
};

const extractUsageFromAction = (actionYaml) => {
  const inputs = actionYaml?.inputs || {};
  const required = Object.entries(inputs).filter(([_, val]) => val.required).map(([key]) => key);
  const optional = Object.entries(inputs).filter(([_, val]) => !val.required).map(([key]) => key);

  return {
    required,
    optional,
    usage: `uses: ./actions/<NAME>`
  };
};

const updateReadme = (readme, tableHTML) => {
  const start = '<!-- GENERATED:GITHUB-CATALOG:START -->';
  const end = '<!-- GENERATED:GITHUB-CATALOG:STOP -->';
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`, 'gm');
  return readme.replace(pattern, `${start}\n${tableHTML}\n${end}`);
};

async function run() {
  try {
    const token = core.getInput('token', { required: true });
    const graphqlWithAuth = graphql.defaults({ headers: { authorization: `token ${token}` } });

    const { owner, repo } = github.context.repo;

    const latestVersion = await getLatestVersion(graphqlWithAuth, owner, repo);

    const workflowPaths = glob.sync('.github/workflows/*.yml').filter(p => !path.basename(p).startsWith('test-'));
    const actionPaths = glob.sync('actions/**/action.yml');

    const workflows = workflowPaths.map(wf => {
      const yaml = require('js-yaml').load(fs.readFileSync(wf, 'utf-8'));
      if (!yaml?.on?.workflow_call) return null;

      const usage = extractUsageFromWorkflow(yaml);
      return {
        name: path.basename(wf),
        description: yaml.description || '',
        workflow: yaml.name || '',
        ...usage
      };
    }).filter(Boolean);

    const actions = actionPaths.map(ap => {
      const yaml = require('js-yaml').load(fs.readFileSync(ap, 'utf-8'));
      const readmePath = path.join(path.dirname(ap), 'README.md');
      const readme = readFile(readmePath);
      const usage = extractUsageFromAction(yaml);
      return {
        name: path.basename(path.dirname(ap)),
        description: (yaml.description || '').split('\n')[0],
        ...usage
      };
    });

    // Load Jinja2 template from /action/catalog-template.html
    const template = fs.readFileSync(path.join(__dirname, '/templates/github-catalog.html'), 'utf-8');
    const rendered = render(template, { workflows, actions, version: latestVersion });

    const readmePath = './README.md';
    const currentReadme = readFile(readmePath);
    const updated = updateReadme(currentReadme, rendered);
    fs.writeFileSync(readmePath, updated);
    console.log('✅ README.md updated successfully.');
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();

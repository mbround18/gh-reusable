const core = require("@actions/core");
const github = require("@actions/github");
const fs = require("fs");
const path = require("path");
const glob = require("glob");
const ejs = require("ejs");
const { graphql } = require("@octokit/graphql");

function getInputPadding(obj, additionalPadding = 0) {
  const longest = Object.entries(obj).reduce((maxLength, [key, value]) => {
    const combinedLength = `${key}${value?.default ?? ""}`.length;
    return Math.max(maxLength, combinedLength);
  }, 0);
  return longest + additionalPadding;
}

function sanitizeInputs(obj) {
  return Object.entries(obj)
    .map(([key, value]) => [
      key,
      {
        ...value,
        default: value.default === undefined ? "" : String(value.default ?? ""),
      },
    ])
    .sort(([aKey, aVal], [bKey, bVal]) => {
      const aReq = !!aVal.required;
      const bReq = !!bVal.required;
      return aReq !== bReq ? (aReq ? -1 : 1) : aKey.localeCompare(bKey);
    })
    .reduce((acc, [key, val]) => {
      acc[key] = val;
      return acc;
    }, {});
}

// Helper to read file content
const readFile = (filePath) =>
  fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";

// Fetch the latest version (tag or default branch)
const getLatestVersion = async (graphqlWithAuth, owner, repo) => {
  const queryPath = path.join(__dirname, "queries", "get-latest-version.gql");
  const query = readFile(queryPath);

  const data = await graphqlWithAuth(query, { owner, repo });
  const latestTag = data.repository.refs.nodes[0]?.name;
  const defaultBranch = data.repository.defaultBranchRef?.name;
  return latestTag || defaultBranch || "main";
};

// Update the README.md with the generated HTML table
const updateReadme = (readme, tableHTML) => {
  const start = "<!-- GENERATED:GITHUB-CATALOG:START -->";
  const end = "<!-- GENERATED:GITHUB-CATALOG:STOP -->";
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`, "gm");
  return readme.replace(pattern, `${start}\n${tableHTML}\n${end}`);
};

async function run() {
  try {
    const token = core.getInput("token", { required: true });
    const graphqlWithAuth = graphql.defaults({
      headers: { authorization: `token ${token}` },
    });

    const { owner, repo } = github.context.repo;

    const latestVersion = await getLatestVersion(graphqlWithAuth, owner, repo);

    const workflowPaths = glob
      .sync(".github/workflows/*.y*ml")
      .filter((p) => !path.basename(p).startsWith("test-"));
    const actionPaths = glob.sync("actions/**/action.yml");

    const workflows = workflowPaths
        .reduce((acc, wf) => {
            console.log("Processing workflow:", wf);
            const yaml = require("js-yaml").load(readFile(wf));
            if (!yaml?.on?.workflow_call) return acc;
            const inputs = sanitizeInputs(yaml.on.workflow_call.inputs || {});
            acc.push({
                name: path.basename(wf),
                description: yaml.description || "",
                workflow: yaml.name || "",
                inputs: inputs,
                inputPadding: getInputPadding(inputs, 4),
            });
            return acc;
        },[]);

    const actions = actionPaths.map((ap) => {
      console.log("Processing action:", ap);
      const yaml = require("js-yaml").load(readFile(ap));
      const inputs = sanitizeInputs(yaml.inputs || {});

      return {
        name: path.basename(path.dirname(ap)),
        description: (yaml.description || "").split("\n")[0],
        inputs: inputs,
        inputPadding: getInputPadding(inputs, 4),
      };
    });

    // Render the EJS template
    const templatePath = path.join(
      __dirname,
      "templates",
      "github-catalog.ejs",
    );
    const rendered = await ejs.renderFile(templatePath, {
      workflows,
      actions,
      version: latestVersion,
      owner,
      repo,
    });

    const readmePath = "./README.md";
    const currentReadme = readFile(readmePath);
    const updated = updateReadme(currentReadme, rendered);
    fs.writeFileSync(readmePath, updated);
    console.log("✅ README.md updated successfully.");
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();

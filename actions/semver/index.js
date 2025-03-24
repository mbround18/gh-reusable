// action/semver.js

const core = require("@actions/core");
const github = require("@actions/github");
const fs = require("fs");
const path = require("path");

async function run() {
  try {
    const token = core.getInput("token") || process.env.GITHUB_TOKEN;
    const base = core.getInput("base");
    let prefix = core.getInput("prefix") || ""; // new input
    const incrementInput = core.getInput("increment") || "patch";
    const majorLabel = core.getInput("major-label") || "major";
    const minorLabel = core.getInput("minor-label") || "minor";
    const patchLabel = core.getInput("patch-label") || "patch";

    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    let lastTag = base;

    if (!lastTag) {
      const getLastTagQuery = fs.readFileSync(
        path.join(__dirname, "get_last_tag.gql"),
        "utf8",
      );
      const res = await octokit.graphql(getLastTagQuery, { owner, repo });
      const nodes = res?.repository?.refs?.nodes || [];
      const tags = nodes.map((n) => n.name);
      const hasVPrefix = tags.every((tag) => tag.startsWith("v"));
      if (hasVPrefix) prefix = "v";

      const matching = tags
        .filter((tag) => tag.startsWith(prefix))
        .sort((a, b) => {
          const va = a.replace(prefix, "");
          const vb = b.replace(prefix, "");
          return compareSemverDesc(va, vb);
        });

      lastTag = matching.length > 0 ? matching[0] : `${prefix}0.0.0`;
      core.info(`Using lastTag: ${lastTag}`);
    }

    let increment = incrementInput;
    const isPR = github.context.eventName === "pull_request";

    if (!incrementInput && isPR) {
      const prLabelsQuery = fs.readFileSync(
        path.join(__dirname, "pr_labels.gql"),
        "utf8",
      );
      const res = await octokit.graphql(prLabelsQuery, {
        owner,
        repo,
        prNumber: github.context.payload.pull_request.number,
      });
      const labels = res.repository.pullRequest.labels.nodes.map((l) => l.name);

      if (labels.includes(majorLabel)) increment = "major";
      else if (labels.includes(minorLabel)) increment = "minor";
      else increment = "patch";
    }

    if (!incrementInput && !isPR) {
      const commitQuery = fs.readFileSync(
        path.join(__dirname, "commit_associated_pr.gql"),
        "utf8",
      );
      const branchQuery = fs.readFileSync(
        path.join(__dirname, "default_branch.gql"),
        "utf8",
      );

      const commitRes = await octokit.graphql(commitQuery, {
        owner,
        repo,
        commitOid: github.context.sha,
      });

      const branchRes = await octokit.graphql(branchQuery, { owner, repo });
      const defaultBranch = branchRes.repository.defaultBranchRef.name;
      const refBranch = github.ref.replace("refs/heads/", "");

      let labels = [];
      if (refBranch === defaultBranch) {
        const pr =
          commitRes.data.repository.object.associatedPullRequests.nodes[0];
        labels = pr?.labels?.nodes?.map((l) => l.name) || [];
      }

      if (labels.includes(majorLabel)) increment = "major";
      else if (labels.includes(minorLabel)) increment = "minor";
      else increment = "patch";
    }

    let newVersion;
    if (isPR && !incrementInput) {
      const shortSha = github.context.sha.substring(0, 7);
      newVersion = `${lastTag}-${shortSha}`;
    } else {
      const semverPart = lastTag.replace(prefix, "");
      const [major, minor, patch] = semverPart.split(".").map(Number);

      let next = [major, minor, patch];
      switch (increment) {
        case "major":
          next = [major + 1, 0, 0];
          break;
        case "minor":
          next = [major, minor + 1, 0];
          break;
        case "patch":
          next = [major, minor, patch + 1];
          break;
      }

      newVersion = `${prefix}${next.join(".")}`;
    }

    core.setOutput("new_version", newVersion);

    if (!/^v?[a-zA-Z0-9\-]*\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$/.test(newVersion)) {
      core.setFailed(`Invalid version format: ${newVersion}`);
    } else {
      console.log(`✅ new_version: ${newVersion}`);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

function compareSemverDesc(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pb[i] - pa[i];
  }
  return 0;
}

run();

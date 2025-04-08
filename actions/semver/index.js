const core = require("@actions/core");
const github = require("@actions/github");
const fs = require("fs").promises;
const path = require("path");
const semver = require("semver");

// Constants for version increments
const INCREMENTS = {
  MAJOR: "major",
  MINOR: "minor",
  PATCH: "patch",
};

// Query cache to avoid repeated file reads
const queryCache = {};

async function fetchQuery(queryPath) {
  if (!queryCache[queryPath]) {
    const filePath = path.join(__dirname, queryPath);
    queryCache[queryPath] = await fs.readFile(filePath, "utf8");
  }
  return queryCache[queryPath];
}

// Helper function to resolve increment from labels
function resolveIncrementFromLabels(labels, majorLabel, minorLabel) {
  if (labels.includes(majorLabel)) return INCREMENTS.MAJOR;
  if (labels.includes(minorLabel)) return INCREMENTS.MINOR;
  return INCREMENTS.PATCH;
}

async function getLastTag(octokit, owner, repo, prefix, base, core) {
  let lastTag = base;

  if (!lastTag) {
    core.startGroup("🔎 Fetching Last Tag");
    const getLastTagQuery = await fetchQuery("queries/get_last_tag.gql");
    const res = await octokit.graphql(getLastTagQuery, { owner, repo });

    if (!res || !res.repository || !res.repository.refs) {
      throw new Error("Failed to fetch last tag information");
    }

    const nodes = res.repository.refs.nodes || [];
    let tags = nodes.map((n) => n.name);
    const hasVPrefix = tags.every((tag) => tag.startsWith("v"));
    if (hasVPrefix) prefix = "v";

    if ((prefix || "").length > 1) {
      tags = tags.filter((tag) => tag.startsWith(prefix));
      const hasDash = tags.every((tag) => tag.startsWith(`${prefix}-`));
      if (hasDash) prefix = `${prefix}-`;
    }

    // Use semver for better version comparison
    const matching = tags.sort((a, b) => {
      const versionA = semver.clean(a.replace(prefix, "")) || "0.0.0";
      const versionB = semver.clean(b.replace(prefix, "")) || "0.0.0";
      return semver.rcompare(versionA, versionB);
    });

    lastTag = matching.length > 0 ? matching[0] : `${prefix}0.0.0`;
    core.info(`Resolved last tag: ${lastTag}`);
    core.endGroup();
  }

  return { lastTag, updatedPrefix: prefix };
}

async function detectIncrement(
  octokit,
  owner,
  repo,
  incrementInput,
  majorLabel,
  minorLabel,
  patchLabel,
  core,
) {
  let increment = incrementInput;
  const isPR = github.context.eventName === "pull_request";

  if (!incrementInput) {
    core.startGroup(
      isPR
        ? "🏷️ Detecting PR Labels"
        : "🔍 Detecting Commit Labels on Default Branch",
    );

    let labels = [];

    if (isPR) {
      const prLabelsQuery = await fetchQuery("queries/pr_labels.gql");
      try {
        const res = await octokit.graphql(prLabelsQuery, {
          owner,
          repo,
          prNumber: github.context.payload.pull_request.number,
        });

        if (!res || !res.repository || !res.repository.pullRequest) {
          throw new Error("Failed to fetch PR information");
        }

        labels = res.repository.pullRequest.labels.nodes.map((l) => l.name);
        core.info(`PR labels: ${labels.join(", ")}`);
      } catch (error) {
        core.warning(`Error fetching PR labels: ${error.message}`);
      }
    } else {
      try {
        const commitQuery = await fetchQuery(
          "queries/commit_associated_pr.gql",
        );
        const branchQuery = await fetchQuery("queries/default_branch.gql");

        const [commitRes, branchRes] = await Promise.all([
          octokit.graphql(commitQuery, {
            owner,
            repo,
            commitOid: github.context.sha,
          }),
          octokit.graphql(branchQuery, { owner, repo }),
        ]);

        if (
          !branchRes ||
          !branchRes.repository ||
          !branchRes.repository.defaultBranchRef
        ) {
          throw new Error("Failed to fetch default branch information");
        }

        const defaultBranch = branchRes.repository.defaultBranchRef.name;
        const refBranch = github.ref.replace("refs/heads/", "");

        if (
          refBranch === defaultBranch &&
          commitRes.data?.repository?.object?.associatedPullRequests?.nodes
            ?.length > 0
        ) {
          const pr =
            commitRes.data.repository.object.associatedPullRequests.nodes[0];
          labels = pr?.labels?.nodes?.map((l) => l.name) || [];
        }

        core.info(`Detected labels: ${labels.join(", ")}`);
      } catch (error) {
        core.warning(`Error fetching commit labels: ${error.message}`);
      }
    }

    increment = resolveIncrementFromLabels(labels, majorLabel, minorLabel);
    core.info(`Resolved increment: ${increment}`);
    core.endGroup();
  }

  return increment;
}

function buildNewVersion(lastTag, prefix, increment, isPR, sha) {
  let newVersion;
  if (isPR && !increment) {
    const shortSha = sha.substring(0, 7);
    newVersion = `${lastTag}-${shortSha}`;
  } else {
    // Extract version part without the prefix
    const versionPart = lastTag.replace(new RegExp(`^${prefix}`), "");
    const cleanVersion = versionPart.startsWith("-")
      ? versionPart.substring(1)
      : versionPart;

    // Use semver to parse and increment the version
    const parsedVersion =
      semver.parse(cleanVersion) || semver.parse(`0.0.0${cleanVersion}`);
    if (!parsedVersion) {
      throw new Error(`Invalid semver: ${lastTag}`);
    }

    const newVersionNumber = semver.inc(parsedVersion.version, increment);
    if (!newVersionNumber) {
      throw new Error(
        `Failed to increment version with increment type: ${increment}`,
      );
    }

    newVersion = prefix + newVersionNumber;
  }

  return newVersion;
}

async function run() {
  try {
    const token = core.getInput("token") || process.env.GITHUB_TOKEN;
    const base = core.getInput("base");
    let prefix = core.getInput("prefix") || "";
    const incrementInput = core.getInput("increment") || INCREMENTS.PATCH;
    const majorLabel = core.getInput("major-label") || "major";
    const minorLabel = core.getInput("minor-label") || "minor";
    const patchLabel = core.getInput("patch-label") || "patch";

    if (!token) {
      throw new Error("GitHub token is required");
    }

    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    core.startGroup("📥 Inputs");
    core.info(`Repository: ${owner}/${repo}`);
    core.info(`Base: ${base}`);
    core.info(`Prefix: ${prefix}`);
    core.info(`Increment Input: ${incrementInput}`);
    core.info(`Major Label: ${majorLabel}`);
    core.info(`Minor Label: ${minorLabel}`);
    core.info(`Patch Label: ${patchLabel}`);
    core.endGroup();

    const { lastTag, updatedPrefix } = await getLastTag(
      octokit,
      owner,
      repo,
      prefix,
      base,
      core,
    );
    prefix = updatedPrefix;

    const increment = await detectIncrement(
      octokit,
      owner,
      repo,
      incrementInput,
      majorLabel,
      minorLabel,
      patchLabel,
      core,
    );

    core.startGroup("🚀 Calculating New Version");
    const newVersion = buildNewVersion(
      lastTag,
      prefix,
      increment,
      github.context.eventName === "pull_request",
      github.context.sha,
    );

    core.setOutput("new_version", newVersion);
    core.info(`✅ new_version: ${newVersion}`);
    core.endGroup();

    // Enhanced semver validation
    if (
      !semver.valid(newVersion.replace(/^[^0-9]*/, "")) &&
      !/^v?[a-zA-Z0-9\-]*\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$/.test(newVersion)
    ) {
      core.setFailed(`❌ Invalid version format: ${newVersion}`);
    }
  } catch (error) {
    core.setFailed(`💥 ${error.message}`);
    if (error.stack) {
      core.debug(`Stack trace: ${error.stack}`);
    }
  }
}

// Export functions for testing
module.exports = {
  fetchQuery,
  resolveIncrementFromLabels,
  getLastTag,
  detectIncrement,
  buildNewVersion,
  run,
};

// Run the action
run();

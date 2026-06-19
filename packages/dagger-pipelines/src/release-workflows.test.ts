import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { expect, test } from "vitest";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const repositoryRoot = path.resolve(dirname, "../../../");
const workflowsDir = path.join(repositoryRoot, ".github", "workflows");

type WorkflowJob = {
  uses?: string;
  with?: Record<string, unknown>;
  secrets?: Record<string, unknown>;
};

function readWorkflow(fileName: string): {
  on?: {
    workflow_call?: {
      inputs?: Record<string, { type?: string; default?: unknown }>;
      secrets?: Record<string, unknown>;
    };
  };
  jobs?: Record<string, WorkflowJob>;
} {
  return parse(readFileSync(path.join(workflowsDir, fileName), "utf8"));
}

test("release pnpm workflow delegates to publish.yaml with package release inputs", () => {
  const workflow = readWorkflow("release-pnpm.yaml");
  const inputs = workflow.on?.workflow_call?.inputs ?? {};
  const secrets = workflow.on?.workflow_call?.secrets ?? {};
  const publishJob = workflow.jobs?.publish;

  expect(inputs.source?.default).toBe(".");
  expect(inputs.registry?.default).toBe("");
  expect(inputs.tag?.default).toBe("");
  expect(inputs.version?.default).toBe("");
  expect(inputs.publish?.default).toBe(true);
  expect(secrets.NPM_TOKEN).toBeDefined();
  expect(secrets.DAGGER_CLOUD_TOKEN).toBeDefined();
  expect(secrets.DISCORD_WEBHOOK_URL).toBeDefined();
  expect(publishJob?.uses).toContain(".github/workflows/publish.yaml");
  expect(publishJob?.with?.target).toBe("node");
  expect(String(publishJob?.with?.source ?? "")).toContain("inputs.source");
  expect(String(publishJob?.with?.registry ?? "")).toContain("inputs.registry");
  expect(String(publishJob?.with?.version ?? "")).toContain("inputs.version");
  expect(String(publishJob?.with?.publish ?? "")).toContain("inputs.publish");
});

test("release docker workflow delegates to docker-release.yaml", () => {
  const workflow = readWorkflow("release-docker.yaml");
  const inputs = workflow.on?.workflow_call?.inputs ?? {};
  const secrets = workflow.on?.workflow_call?.secrets ?? {};
  const releaseJob = workflow.jobs?.release;

  expect(inputs.image?.default).toBe("mbround18/test");
  expect(inputs.semver_prefix?.default).toBe("");
  expect(inputs.track_release_summary?.default).toBe(false);
  expect(secrets.DOCKER_TOKEN).toBeDefined();
  expect(secrets.GHCR_TOKEN).toBeDefined();
  expect(secrets.DAGGER_CLOUD_TOKEN).toBeDefined();
  expect(releaseJob?.uses).toContain(".github/workflows/docker-release.yaml");
  expect(String(releaseJob?.with?.image ?? "")).toContain("inputs.image");
  expect(String(releaseJob?.with?.context ?? "")).toContain("inputs.context");
  expect(String(releaseJob?.with?.semver_prefix ?? "")).toContain(
    "inputs.semver_prefix",
  );
  expect(String(releaseJob?.with?.track_release_summary ?? "")).toContain(
    "inputs.track_release_summary",
  );
});

test("release compose workflow delegates to docker-release.yaml", () => {
  const workflow = readWorkflow("release-compose.yaml");
  const inputs = workflow.on?.workflow_call?.inputs ?? {};
  const releaseJob = workflow.jobs?.release;

  expect(inputs.context?.default).toBe(".");
  expect(inputs.dockerfile?.default).toBe("./Dockerfile");
  expect(inputs.track_release_summary?.default).toBe(false);
  expect(releaseJob?.uses).toContain(".github/workflows/docker-release.yaml");
  expect(String(releaseJob?.with?.image ?? "")).toContain("inputs.image");
  expect(String(releaseJob?.with?.context ?? "")).toContain("inputs.context");
  expect(String(releaseJob?.with?.dockerfile ?? "")).toContain(
    "inputs.dockerfile",
  );
  expect(String(releaseJob?.with?.track_release_summary ?? "")).toContain(
    "inputs.track_release_summary",
  );
});

test("release test workflows run build/package only", () => {
  const pnpmTest = readWorkflow("test-release-pnpm.yaml");
  const dockerTest = readWorkflow("test-release-docker.yaml");
  const composeTest = readWorkflow("test-release-compose.yaml");

  expect(pnpmTest.jobs?.release?.uses).toContain(
    ".github/workflows/release-pnpm.yaml",
  );
  expect(pnpmTest.jobs?.release?.with?.publish).toBe(false);

  expect(dockerTest.jobs?.release?.uses).toContain(
    ".github/workflows/release-docker.yaml",
  );
  expect(dockerTest.jobs?.release?.secrets?.DAGGER_CLOUD_TOKEN).toBeDefined();

  expect(composeTest.jobs?.release?.uses).toContain(
    ".github/workflows/release-compose.yaml",
  );
  expect(composeTest.jobs?.release?.secrets?.DAGGER_CLOUD_TOKEN).toBeDefined();
});

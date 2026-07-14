import { expect, test } from "vitest";

import {
  WORKFLOW_DEFINITIONS,
  evaluateDaggerInvocationStep,
  evaluateConditionalSecretRequirement,
  evaluateWorkflowDefinitionCompliance,
  hasWorkflowReference,
  parseDaggerCallName,
  validateWorkflowDefinitions,
} from "./workflows.js";

function getCiWorkflowCommands(
  workflowId: keyof typeof WORKFLOW_DEFINITIONS,
): readonly string[] {
  const definition = WORKFLOW_DEFINITIONS[workflowId];
  if (definition.kind !== "ci") {
    throw new Error(`${workflowId} must be a ci workflow for this test`);
  }

  return definition.config.test.map((command) => command.args.join(" "));
}

function getCiWorkflowInstallCommand(
  workflowId: keyof typeof WORKFLOW_DEFINITIONS,
): string {
  const definition = WORKFLOW_DEFINITIONS[workflowId];
  if (definition.kind !== "ci") {
    throw new Error(`${workflowId} must be a ci workflow for this test`);
  }

  return definition.config.install.command?.args.join(" ") ?? "";
}

test("workflow definitions remain valid", () => {
  expect(validateWorkflowDefinitions()).toEqual([]);
});

test("tier1 workflows use executable parity flows instead of shallow checks", () => {
  const ensureRepository = getCiWorkflowCommands("test-ensure-repository").join(
    "\n",
  );
  expect(ensureRepository).toContain("check_repository");
  expect(ensureRepository).toContain("Repository mismatch");

  const updateReadme = getCiWorkflowCommands("update-readme").join("\n");
  expect(updateReadme).toContain("actions/github-catalog/index.js");
  expect(updateReadme).toContain("GENERATED:GITHUB-CATALOG:START");

  const tagger = getCiWorkflowCommands("tagger").join("\n");
  expect(tagger).toContain("npm --prefix actions/semver test");
  expect(tagger).toContain("git tag -a");
  expect(tagger).toContain("gh release create --help");

  const graphqlAction = getCiWorkflowCommands("test-graphql-action").join("\n");
  expect(graphqlAction).toContain("npm --prefix actions/graphql run build");
  expect(graphqlAction).toContain("defaultBranchRef");
  expect(graphqlAction).toContain("INPUT_URL");

  const installCli = getCiWorkflowCommands("test-install-cli").join("\n");
  expect(installCli).toContain("install_cli_release");
  expect(installCli).toContain("schollz/croc");
  expect(installCli).toContain("astral-sh/uv");
  expect(installCli).toContain("jqlang/jq");

  const pythonBuildAndTest = getCiWorkflowCommands("python-build-n-test").join(
    "\n",
  );
  expect(getCiWorkflowInstallCommand("python-build-n-test")).toContain(
    "uv sync --all-groups --frozen",
  );
  expect(pythonBuildAndTest).toContain("uv build");
  expect(pythonBuildAndTest).toContain("uv run pytest");

  const pythonParity = getCiWorkflowCommands("test-python-build-n-test").join(
    "\n",
  );
  expect(getCiWorkflowInstallCommand("test-python-build-n-test")).toContain(
    "uv sync --all-groups --frozen",
  );
  expect(pythonParity).toContain("uv build");
  expect(pythonParity).toContain("uv run pytest");

  const pnpmBuildAndTest =
    getCiWorkflowCommands("pnpm-build-n-test").join("\n");
  expect(getCiWorkflowInstallCommand("pnpm-build-n-test")).toContain(
    "pnpm install --frozen-lockfile",
  );
  expect(pnpmBuildAndTest).toContain("pnpm run build");
  expect(pnpmBuildAndTest).toContain("pnpm run test");

  const pnpmParity = getCiWorkflowCommands("test-pnpm-build-n-test").join("\n");
  expect(getCiWorkflowInstallCommand("test-pnpm-build-n-test")).toContain(
    "pnpm install --frozen-lockfile",
  );
  expect(pnpmParity).toContain("pnpm run build");
  expect(pnpmParity).toContain("pnpm run test");
});

test("conditional secret helper validates publish contract snippets", () => {
  const raw = `
  if: inputs.publish
  run: echo \${{ secrets.CARGO_REGISTRY_TOKEN }}
  `;
  const result = evaluateConditionalSecretRequirement({
    workflowFile: "rust-build-n-test.yaml",
    workflowRaw: raw,
    whenInput: "publish",
    secret: "CARGO_REGISTRY_TOKEN",
    conditionSnippet: "inputs.publish",
  });
  expect(result.status).toBe("pass");
});

test("parseDaggerCallName returns the first token", () => {
  expect(parseDaggerCallName("rust-pipeline --source=. --publish=false")).toBe(
    "rust-pipeline",
  );
  expect(parseDaggerCallName("   publish-rust-crate   --source=libs/x ")).toBe(
    "publish-rust-crate",
  );
  expect(parseDaggerCallName("   ")).toBe("");
});

test("workflow reference helper detects input and secret tokens", () => {
  const raw =
    "if: inputs.publish\nrun: echo ${{ secrets.CARGO_REGISTRY_TOKEN }}";
  expect(hasWorkflowReference(raw, "input", "publish")).toBe(true);
  expect(hasWorkflowReference(raw, "secret", "CARGO_REGISTRY_TOKEN")).toBe(
    true,
  );
  expect(hasWorkflowReference(raw, "input", "missing_input")).toBe(false);
  expect(hasWorkflowReference(raw, "secret", "MISSING_SECRET")).toBe(false);
});

test("conditional secret helper reports all missing requirements", () => {
  const result = evaluateConditionalSecretRequirement({
    workflowFile: "rust-build-n-test.yaml",
    workflowRaw: "jobs:\n  build:\n    steps:\n      - run: echo no refs",
    whenInput: "publish",
    secret: "CARGO_REGISTRY_TOKEN",
    conditionSnippet: "inputs.publish",
  });

  expect(result.status).toBe("fail");
  expect(result.issues.map((issue) => issue.code)).toEqual([
    "missing-conditional-input-reference",
    "missing-conditional-secret-reference",
    "missing-conditional-guard",
  ]);
});

test("dagger invocation evaluator ignores non-dagger steps", () => {
  const result = evaluateDaggerInvocationStep({
    workflowFile: "x.yaml",
    jobName: "build",
    uses: "actions/checkout@v4",
    with: {},
  });
  expect(result.status).toBe("pass");
  expect(result.issues).toEqual([]);
});

test("dagger invocation evaluator reports direct-step contract violations", () => {
  const result = evaluateDaggerInvocationStep({
    workflowFile: "x.yaml",
    jobName: "build",
    uses: "dagger/dagger-for-github@v8",
    with: {
      call: "   ",
      verb: "call",
      args: "foo",
    },
  });

  expect(result.status).toBe("fail");
  expect(result.issues.map((issue) => issue.code)).toEqual([
    "missing-call",
    "legacy-verb",
    "legacy-args",
    "missing-module",
  ]);
});

test("dagger invocation evaluator enforces explicit module when required", () => {
  const result = evaluateDaggerInvocationStep({
    workflowFile: "x.yaml",
    jobName: "build",
    uses: "./.github/actions/dagger-run",
    with: {
      call: "rust-pipeline --source=.",
    },
    requireExplicitModule: true,
  });

  expect(result.status).toBe("fail");
  expect(result.issues.map((issue) => issue.code)).toEqual(["missing-module"]);
});

test("workflow definition compliance catches empty command arrays", () => {
  const invalidDefinitions = {
    ...WORKFLOW_DEFINITIONS,
    "test-ensure-repository": {
      kind: "ci" as const,
      config: {
        ...WORKFLOW_DEFINITIONS["test-ensure-repository"].config,
        lint: [],
        test: [],
      },
    },
    "docker-release": {
      kind: "buildAndPush" as const,
      config: {
        ...WORKFLOW_DEFINITIONS["docker-release"].config,
        build: [],
      },
    },
  };

  const issues = evaluateWorkflowDefinitionCompliance(invalidDefinitions);
  expect(issues.map((issue) => issue.message)).toEqual(
    expect.arrayContaining([
      "test-ensure-repository: ci workflow must include at least one command",
      "docker-release: buildAndPush workflow must include at least one build command",
    ]),
  );
});

test("workflow definition compliance flags commands with missing executable args", () => {
  const invalidDefinitions = {
    ...WORKFLOW_DEFINITIONS,
    "test-pnpm-build-n-test": {
      ...WORKFLOW_DEFINITIONS["test-pnpm-build-n-test"],
      config: {
        ...WORKFLOW_DEFINITIONS["test-pnpm-build-n-test"].config,
        test: [{ name: "broken", args: [] }],
      },
    },
  };

  const issues = evaluateWorkflowDefinitionCompliance(invalidDefinitions);
  expect(issues.map((issue) => issue.message)).toContain(
    "test-pnpm-build-n-test: command 'broken' has no executable arguments",
  );
});

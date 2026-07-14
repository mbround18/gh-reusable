import { expect, test } from "vitest";
import {
  dockerReleaseWorkflow,
  runWorkflow,
  workflowFunctions,
  type WorkflowId,
} from "./workflows.js";

class FakeDirectory {
  constructor(public readonly name: string) {}

  directory(subpath: string): FakeDirectory {
    return new FakeDirectory(`${this.name}/${subpath}`);
  }

  dockerBuild(_config: unknown): FakeContainer {
    return new FakeContainer();
  }
}

class FakeContainer {
  private readonly root = new FakeDirectory(".");
  private stdoutValue = "ok";

  from(_image: string): this {
    return this;
  }

  withWorkdir(_workdir: string): this {
    return this;
  }

  withEnvVariable(_name: string, _value: string): this {
    return this;
  }

  withMountedDirectory(_mountPath: string, _directory: FakeDirectory): this {
    return this;
  }

  withMountedCache(_cachePath: string, _cacheVolume: { key: string }): this {
    return this;
  }

  withExec(args: string[]): this {
    this.stdoutValue = args.join(" ");
    return this;
  }

  withDirectory(_mountPath: string, _directory: FakeDirectory): this {
    return this;
  }

  withRegistryAuth(
    _address: string,
    _username: string,
    _secret: { name: string; value: string },
  ): this {
    return this;
  }

  directory(_subpath: string): FakeDirectory {
    return this.root;
  }

  async publish(address: string): Promise<string> {
    return `published:${address}`;
  }

  async stdout(): Promise<string> {
    return this.stdoutValue;
  }
}

class FakeClient {
  private readonly containerInstance = new FakeContainer();

  container(): FakeContainer {
    return this.containerInstance;
  }

  host(): {
    directory: (path: string, options: { exclude?: string[] }) => FakeDirectory;
  } {
    return {
      directory: (hostPath: string, _options: { exclude?: string[] }) =>
        new FakeDirectory(hostPath),
    };
  }

  cacheVolume(key: string): { key: string } {
    return { key };
  }

  setSecret(name: string, value: string): { name: string; value: string } {
    return { name, value };
  }
}

test("runWorkflow routes ci and docker-release definitions", async () => {
  const client = new FakeClient();

  const ciResult = await runWorkflow(
    client as unknown as never,
    "test-semver",
    {},
  );
  expect("stdout" in ciResult).toBe(true);

  const dockerResult = await runWorkflow(
    client as unknown as never,
    "docker-release",
    {
      GITHUB_EVENT_NAME: "push",
      GITHUB_REF: "refs/heads/main",
      GITHUB_WORKSPACE: ".",
      DOCKER_TOKEN: "token",
      DOCKER_RELEASE_REGISTRIES: "ghcr.io",
      GHCR_TOKEN: "token",
    },
  );
  expect("reference" in dockerResult).toBe(true);
  expect("pushed" in dockerResult && dockerResult.pushed).toBe(true);
});

test("workflow function wrappers are callable for all workflow ids", async () => {
  const client = new FakeClient();
  const ids = Object.keys(workflowFunctions) as WorkflowId[];

  for (const workflowId of ids) {
    const fn = workflowFunctions[workflowId];
    const result =
      workflowId === "docker-release"
        ? await dockerReleaseWorkflow(client as unknown as never, {
            GITHUB_EVENT_NAME: "push",
            GITHUB_REF: "refs/heads/main",
            GITHUB_WORKSPACE: ".",
            DOCKER_TOKEN: "token",
          })
        : await fn(client as unknown as never);

    expect(result).toBeDefined();
  }
});

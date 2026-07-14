import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  buildAndPush,
  ci,
  createBaseContainer,
  runCommand,
  runCommands,
  sourceDirectory,
  withDependencies,
  withMountedSource,
  type BaseContainerConfig,
  type BuildAndPushConfig,
  type CiConfig,
  type CommandDefinition,
  type InstallConfig,
} from "./index.js";

type RegistryAuthCall = {
  address: string;
  username: string;
  secret: { name: string; value: string };
};

class FakeDirectory {
  public readonly dockerBuildCalls: Array<{
    dockerfile?: string;
    target?: string;
    buildArgs?: Array<{ name: string; value: string }>;
  }> = [];

  public readonly children: string[] = [];

  constructor(public readonly pathValue: string) {}

  directory(subpath: string): FakeDirectory {
    this.children.push(subpath);
    return new FakeDirectory(path.posix.join(this.pathValue, subpath));
  }

  dockerBuild(input: {
    dockerfile?: string;
    target?: string;
    buildArgs?: Array<{ name: string; value: string }>;
  }): FakeContainer {
    this.dockerBuildCalls.push(input);
    const container = new FakeContainer();
    container.builtFrom = input;
    return container;
  }
}

class FakeContainer {
  public fromImage = "";
  public workdir = "";
  public readonly env: Record<string, string> = {};
  public readonly execs: string[][] = [];
  public readonly mountedCaches: Array<{ path: string; key: string }> = [];
  public readonly mountedDirectories: Array<{ path: string; source: string }> =
    [];
  public readonly registryAuthCalls: RegistryAuthCall[] = [];
  public readonly publishCalls: string[] = [];
  public builtFrom:
    | {
        dockerfile?: string;
        target?: string;
        buildArgs?: Array<{ name: string; value: string }>;
      }
    | undefined;

  private readonly rootDirectory = new FakeDirectory(".");

  from(image: string): this {
    this.fromImage = image;
    return this;
  }

  withWorkdir(workdir: string): this {
    this.workdir = workdir;
    return this;
  }

  withEnvVariable(name: string, value: string): this {
    this.env[name] = value;
    return this;
  }

  withMountedCache(cachePath: string, cacheVolume: { key: string }): this {
    this.mountedCaches.push({ path: cachePath, key: cacheVolume.key });
    return this;
  }

  withMountedDirectory(mountPath: string, sourceDir: FakeDirectory): this {
    this.mountedDirectories.push({
      path: mountPath,
      source: sourceDir.pathValue,
    });
    return this;
  }

  withExec(args: string[]): this {
    this.execs.push(args);
    return this;
  }

  withDirectory(_mountPath: string, _directory: FakeDirectory): this {
    return this;
  }

  directory(_subpath: string): FakeDirectory {
    return this.rootDirectory;
  }

  withRegistryAuth(
    address: string,
    username: string,
    secret: { name: string; value: string },
  ): this {
    this.registryAuthCalls.push({ address, username, secret });
    return this;
  }

  async publish(address: string): Promise<string> {
    this.publishCalls.push(address);
    return `published:${address}`;
  }

  async stdout(): Promise<string> {
    return this.execs.map((parts) => parts.join(" ")).join("\n");
  }
}

class FakeClient {
  public readonly hostDirectoryCalls: Array<{
    path: string;
    exclude?: string[];
  }> = [];
  public readonly cacheVolumeCalls: string[] = [];
  public readonly setSecretCalls: Array<{ name: string; value: string }> = [];

  private readonly containerInstance = new FakeContainer();
  private readonly hostApi = {
    directory: (directoryPath: string, options: { exclude?: string[] }) => {
      this.hostDirectoryCalls.push({
        path: directoryPath,
        exclude: options.exclude,
      });
      return new FakeDirectory(directoryPath);
    },
  };

  container(): FakeContainer {
    return this.containerInstance;
  }

  host(): {
    directory: (path: string, options: { exclude?: string[] }) => FakeDirectory;
  } {
    return this.hostApi;
  }

  cacheVolume(key: string): { key: string } {
    this.cacheVolumeCalls.push(key);
    return { key };
  }

  setSecret(name: string, value: string): { name: string; value: string } {
    this.setSecretCalls.push({ name, value });
    return { name, value };
  }
}

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

test("base container, source mounting, and dependency install defaults are wired", () => {
  const client = new FakeClient();
  const base = createBaseContainer(
    client as unknown as never,
    {
      env: { FOO: "bar" },
    } as BaseContainerConfig,
  ) as unknown as FakeContainer;
  const source = sourceDirectory(client as unknown as never, {
    path: "src",
    exclude: ["node_modules"],
  });
  const mounted = withMountedSource(base as unknown as never, source);
  const withDeps = withDependencies(
    client as unknown as never,
    mounted as unknown as never,
    { packageManager: "pnpm" } as InstallConfig,
  ) as unknown as FakeContainer;

  expect(withDeps.fromImage).toContain("node:");
  expect(withDeps.workdir).toBe("/workspace");
  expect(withDeps.env.CI).toBe("true");
  expect(withDeps.env.FOO).toBe("bar");
  expect(client.hostDirectoryCalls).toEqual([
    { path: "src", exclude: ["node_modules"] },
  ]);
  expect(withDeps.mountedDirectories).toEqual([{ path: ".", source: "src" }]);
  expect(client.cacheVolumeCalls).toEqual(["deps-pnpm"]);
  expect(withDeps.mountedCaches).toEqual([
    { path: "/pnpm/store", key: "deps-pnpm" },
  ]);
  expect(withDeps.execs[0]).toEqual(["corepack", "enable"]);
  expect(withDeps.execs[1]).toEqual(["pnpm", "install", "--frozen-lockfile"]);
});

test("runCommand and runCommands apply workdir/env and preserve order", () => {
  const container = new FakeContainer().withWorkdir("/workspace");
  const first: CommandDefinition = {
    name: "first",
    args: ["echo", "one"],
    workdir: "/tmp",
    env: { X: "1" },
  };
  const second: CommandDefinition = { name: "second", args: ["echo", "two"] };

  const executed = runCommands(
    runCommand(container as unknown as never, first),
    [second],
  ) as unknown as FakeContainer;

  expect(executed.workdir).toBe("/tmp");
  expect(executed.env.X).toBe("1");
  expect(executed.execs).toEqual([
    ["echo", "one"],
    ["echo", "two"],
  ]);
});

test("ci runs lint and test commands and returns stdout", async () => {
  const client = new FakeClient();
  const config: CiConfig = {
    source: { path: "." },
    install: {
      packageManager: "npm",
      command: { name: "install", args: ["npm", "ci"] },
    },
    lint: [{ name: "lint", args: ["npm", "run", "lint"] }],
    test: [{ name: "test", args: ["npm", "test"] }],
  };

  const result = await ci(client as unknown as never, config);
  expect(result.stdout).toContain("npm ci");
  expect(result.stdout).toContain("npm run lint");
  expect(result.stdout).toContain("npm test");
});

test("buildAndPush publishes docker tags when push is enabled", async () => {
  const client = new FakeClient();
  const workspace = tempDir("dagger-pipelines-workspace-");
  const config: BuildAndPushConfig = {
    source: { path: workspace },
    install: {
      packageManager: "npm",
      command: { name: "noop", args: ["true"] },
    },
    build: [{ name: "build", args: ["echo", "build"] }],
    publish: {
      address: "docker.io/org/app:latest",
      auth: {
        address: "docker.io",
        username: "ci-user",
        passwordEnv: "DOCKER_TOKEN",
      },
    },
    docker: {
      image: "org/app",
      version: "1.2.3",
      registries: ["ghcr.io/org"],
      withLatest: true,
      context: ".",
      dockerfile: "./Dockerfile",
    },
  };

  const result = await buildAndPush(client as unknown as never, config, {
    GITHUB_EVENT_NAME: "push",
    GITHUB_REF: "refs/heads/main",
    GITHUB_WORKSPACE: workspace,
    DOCKER_TOKEN: "token-value",
  });

  expect(result.pushed).toBe(true);
  expect(result.references?.length).toBeGreaterThan(0);
  expect(result.reference.startsWith("published:")).toBe(true);
  expect(client.setSecretCalls[0]?.value).toBe("token-value");
});

test("buildAndPush returns tags without publishing when push is disabled", async () => {
  const client = new FakeClient();
  const workspace = tempDir("dagger-pipelines-no-push-");
  const config: BuildAndPushConfig = {
    source: { path: workspace },
    install: {
      packageManager: "npm",
      command: { name: "noop", args: ["true"] },
    },
    build: [{ name: "build", args: ["echo", "build"] }],
    publish: { address: "docker.io/org/app:latest" },
    docker: {
      image: "org/app",
      version: "1.2.3-beta.1",
      withLatest: true,
      context: ".",
      dockerfile: "./Dockerfile",
    },
  };

  const result = await buildAndPush(client as unknown as never, config, {
    GITHUB_EVENT_NAME: "pull_request",
    GITHUB_REF: "refs/pull/42/merge",
    GITHUB_WORKSPACE: workspace,
  });

  expect(result.pushed).toBe(false);
  expect(result.tags?.[0]).toBe("org/app:v1.2.3-beta.1");
  expect(result.reference).toBe("org/app:v1.2.3-beta.1");
});

test("buildAndPush reads registry auth from docker config when env token is absent", async () => {
  const client = new FakeClient();
  const workspace = tempDir("dagger-pipelines-auth-");
  const dockerConfigDir = tempDir("dagger-pipelines-docker-config-");
  const authValue = Buffer.from("docker-user:docker-pass", "utf8").toString(
    "base64",
  );
  writeFileSync(
    path.join(dockerConfigDir, "config.json"),
    JSON.stringify({
      auths: {
        "https://index.docker.io/v1/": {
          auth: authValue,
        },
      },
    }),
  );

  const config: BuildAndPushConfig = {
    source: { path: workspace },
    install: {
      packageManager: "npm",
      command: { name: "noop", args: ["true"] },
    },
    build: [{ name: "build", args: ["echo", "build"] }],
    publish: {
      address: "docker.io/org/app:latest",
      auth: {
        address: "docker.io",
        username: "fallback-user",
        passwordEnv: "DOCKER_TOKEN",
      },
    },
  };

  const result = await buildAndPush(client as unknown as never, config, {
    DOCKER_CONFIG: dockerConfigDir,
  });

  expect(result.reference).toBe("published:docker.io/org/app:latest");
  expect(client.setSecretCalls[0]).toEqual({
    name: "docker-user-docker.io-registry-auth-0",
    value: "docker-pass",
  });
});

test("buildAndPush throws when configured auth cannot be resolved", async () => {
  const client = new FakeClient();
  const workspace = tempDir("dagger-pipelines-missing-auth-");
  const dockerConfigDir = tempDir("dagger-pipelines-empty-config-");
  mkdirSync(dockerConfigDir, { recursive: true });

  const config: BuildAndPushConfig = {
    source: { path: workspace },
    install: {
      packageManager: "npm",
      command: { name: "noop", args: ["true"] },
    },
    build: [{ name: "build", args: ["echo", "build"] }],
    publish: {
      address: "docker.io/org/app:latest",
      auth: {
        address: "docker.io",
        username: "ci-user",
        passwordEnv: "DOCKER_TOKEN",
      },
    },
  };

  await expect(
    buildAndPush(client as unknown as never, config, {
      DOCKER_CONFIG: dockerConfigDir,
    }),
  ).rejects.toThrow("Missing registry credentials for docker.io");
});

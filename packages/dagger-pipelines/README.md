# `@gh-reusable/dagger-pipelines`

Minimal Dagger TypeScript module for reproducible local/CI pipelines driven by JSON-friendly config.

## API surface

- `ci(client, config)`
  - Runs a deterministic Node CI flow: source mount, install, lint, test.
- `buildAndPush(client, config, environment?)`
  - Runs install + build and publishes an OCI image to a registry.
  - Supports docker-facts parity via `config.docker` (compose discovery, push gating, and tag resolution).
- Reusable helpers
  - `createBaseContainer`, `sourceDirectory`, `withMountedSource`, `withDependencies`, `runCommand`, `runCommands`.
  - Docker parity helpers: `resolveDockerParity`, `findDockerCompose`, `findDockerfile`, `generateTags`, `shouldPushImage`.
- CLI entrypoint
  - `node dist/cli.js ci`
  - `node dist/cli.js build-and-push`
  - `node dist/cli.js workflow --id <workflow-id>`

## Example

```ts
import { connect } from '@dagger.io/dagger';
import { buildAndPush, ci } from '@gh-reusable/dagger-pipelines';

await connect(async (client) => {
  await ci(client, {
    source: { path: '.', exclude: ['**/node_modules'] },
    install: { packageManager: 'pnpm' },
    lint: [{ name: 'lint', args: ['pnpm', '-r', '--if-present', 'run', 'lint'] }],
    test: [{ name: 'test', args: ['pnpm', '-r', '--if-present', 'run', 'test'] }]
  });

  await buildAndPush(client, {
    source: { path: '.', exclude: ['**/node_modules'] },
    install: { packageManager: 'pnpm' },
    build: [{ name: 'build', args: ['pnpm', '-r', '--if-present', 'run', 'build'] }],
    publish: {
      address: 'docker.io/example/gh-reusable:latest',
      auth: {
        address: 'docker.io/example/gh-reusable:latest',
        username: 'example',
        passwordEnv: 'DOCKER_TOKEN'
      }
    }
  });
});
```

## GitHub Actions wrapper (`dagger/dagger-for-github@v8`)

Use the Dagger GitHub Action to execute this module from CI:

```yaml
- name: Run Dagger CI
  uses: dagger/dagger-for-github@v8
  with:
    version: latest
    verb: run
    args: pnpm --filter @gh-reusable/dagger-pipelines run dagger:ci
```

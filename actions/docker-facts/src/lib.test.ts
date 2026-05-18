import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

import {
  findDockerfile,
  generateTags,
  parseDockerCompose,
  resolveDockerFacts,
  shouldPushImage
} from './lib';

function withWorkspace(name: string, fn: (workspace: string) => void): void {
  const root = path.join(process.cwd(), '.test-workdirs');
  mkdirSync(root, { recursive: true });
  const workspace = path.join(root, name);
  rmSync(workspace, { force: true, recursive: true });
  mkdirSync(workspace, { recursive: true });
  try {
    fn(workspace);
  } finally {
    rmSync(workspace, { force: true, recursive: true });
  }
}

test('resolveDockerFacts reads compose metadata and builds tags', () => {
  withWorkspace('docker-facts-compose', (workspace) => {
    mkdirSync(path.join(workspace, 'app'), { recursive: true });
    writeFileSync(path.join(workspace, 'Dockerfile'), 'FROM busybox\n');
    writeFileSync(path.join(workspace, 'app', 'Dockerfile.prod'), 'FROM alpine\n');
    writeFileSync(
      path.join(workspace, 'docker-compose.yml'),
      [
        'services:',
        '  app:',
        '    image: sample:latest',
        '    build:',
        '      context: ./app',
        '      dockerfile: Dockerfile.prod',
        '      target: prod',
        '      args:',
        '        VERSION: 1.2.3'
      ].join('\n')
    );

    const facts = resolveDockerFacts(
      {
        image: 'sample',
        version: '1.2.3',
        registries: ['docker.io'],
        dockerfile: './Dockerfile',
        context: '.',
        canaryLabel: 'canary',
        forcePush: false,
        withLatest: false,
        target: '',
        prependTarget: false
      },
      {
        workspace,
        eventName: 'push',
        ref: 'refs/heads/main',
        defaultBranch: 'main'
      }
    );

    expect(facts.context).toBe('./app');
    expect(facts.dockerfile).toBe('./app/Dockerfile.prod');
    expect(facts.target).toBe('prod');
    expect(facts.push).toBe(true);
    expect(facts.tags).toEqual(['sample:v1.2.3', 'docker.io/sample:v1.2.3']);
    expect(facts.buildArgs).toEqual({ VERSION: '1.2.3' });
  });
});

test('shouldPushImage supports canary label on pull requests', () => {
  withWorkspace('docker-facts-pr', (workspace) => {
    const eventPath = path.join(workspace, 'event.json');
    writeFileSync(
      eventPath,
      JSON.stringify({
        pull_request: {
          labels: [{ name: 'preview' }]
        }
      })
    );

    expect(
      shouldPushImage({
        eventName: 'pull_request',
        ref: 'refs/pull/2/merge',
        defaultBranch: 'main',
        canaryLabel: 'preview',
        forcePush: false,
        eventPath
      }),
    ).toBe(true);
  });
});

test('shouldPushImage supports force push and non-matching refs', () => {
  expect(
    shouldPushImage({
      eventName: 'push',
      ref: 'refs/heads/feature/test',
      defaultBranch: 'main',
      canaryLabel: 'preview',
      forcePush: true
    })
  ).toBe(true);

  expect(
    shouldPushImage({
      eventName: 'push',
      ref: 'refs/heads/feature/test',
      defaultBranch: 'main',
      canaryLabel: 'preview',
      forcePush: false
    })
  ).toBe(false);
});

test('generateTags supports target prefix and latest', () => {
  expect(
    generateTags({
      image: 'ghcr.io/org/app',
      version: '1.0.0',
      registries: ['docker.io'],
      withLatest: true,
      ref: 'refs/tags/v1.0.0',
      target: 'alpine',
      prependTarget: true
    })
  ).toEqual([
    'ghcr.io/org/app:alpine-v1.0.0',
    'docker.io/org/app:alpine-v1.0.0',
    'ghcr.io/org/app:alpine-latest',
    'docker.io/org/app:alpine-latest'
  ]);
});

test('generateTags handles plain image names and prerelease versions', () => {
  expect(
    generateTags({
      image: 'sample',
      version: '2.0.0-beta.1',
      registries: [],
      withLatest: true,
      ref: 'refs/tags/v2.0.0-beta.1',
      target: '',
      prependTarget: false
    })
  ).toEqual(['sample:v2.0.0-beta.1']);
});

test('parseDockerCompose handles string build and invalid yaml safely', () => {
  withWorkspace('docker-facts-parse-compose', (workspace) => {
    const composePath = path.join(workspace, 'docker-compose.yml');
    writeFileSync(
      composePath,
      ['services:', '  app:', '    image: sample:latest', '    build: ./service'].join('\n')
    );

    expect(parseDockerCompose(composePath, 'sample')).toEqual({
      dockerfile: null,
      context: './service',
      buildArgs: {},
      target: null
    });

    const invalidPath = path.join(workspace, 'bad-compose.yml');
    writeFileSync(invalidPath, 'services: [:::');
    expect(parseDockerCompose(invalidPath, 'sample')).toEqual({
      dockerfile: null,
      context: null,
      buildArgs: {},
      target: null
    });
  });
});

test('findDockerfile falls back to default absolute path when candidates are missing', () => {
  withWorkspace('docker-facts-find-dockerfile', (workspace) => {
    mkdirSync(path.join(workspace, 'context'), { recursive: true });
    const result = findDockerfile(workspace, './MissingDockerfile', './context');
    expect(result).toBe(path.join(workspace, 'MissingDockerfile'));
  });
});

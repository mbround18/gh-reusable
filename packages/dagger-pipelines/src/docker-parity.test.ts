import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

import {
  findDockerCompose,
  generateTags,
  resolveDockerParity,
  shouldPushImage
} from './docker-parity.js';

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

test('resolveDockerParity uses compose build metadata and generates registry tags', () => {
  withWorkspace('docker-parity-compose', (workspace) => {
    mkdirSync(path.join(workspace, 'app'), { recursive: true });
    writeFileSync(path.join(workspace, 'Dockerfile'), 'FROM busybox\n');
    writeFileSync(path.join(workspace, 'app', 'Dockerfile.prod'), 'FROM alpine\n');
    writeFileSync(
      path.join(workspace, 'docker-compose.yml'),
      [
        'services:',
        '  app:',
        '    image: test-image:latest',
        '    build:',
        '      context: ./app',
        '      dockerfile: Dockerfile.prod',
        '      target: production',
        '      args:',
        '        VERSION: 1.0.0',
        '        DEBUG: false'
      ].join('\n')
    );

    const result = resolveDockerParity({
      inputs: {
        image: 'test-image',
        version: '1.0.0',
        dockerfile: './Dockerfile',
        context: '.',
        registries: ['docker.io']
      },
      github: {
        workspace,
        eventName: 'push',
        ref: 'refs/heads/main',
        defaultBranch: 'main'
      }
    });

    expect(result.context).toBe('./app');
    expect(result.dockerfile).toBe('./app/Dockerfile.prod');
    expect(result.target).toBe('production');
    expect(result.push).toBe(true);
    expect(result.tags).toEqual(['test-image:v1.0.0', 'docker.io/test-image:v1.0.0']);
    expect(result.buildArgs).toEqual({ VERSION: '1.0.0', DEBUG: 'false' });
  });
});

test('findDockerCompose prefers workspace files over context files', () => {
  withWorkspace('docker-parity-compose-search', (workspace) => {
    mkdirSync(path.join(workspace, 'service'), { recursive: true });
    writeFileSync(path.join(workspace, 'docker-compose.yml'), 'services: {}\n');
    writeFileSync(path.join(workspace, 'service', 'docker-compose.yaml'), 'services: {}\n');

    expect(findDockerCompose(workspace, './service')).toBe(path.join(workspace, 'docker-compose.yml'));
  });
});

test('shouldPushImage respects canary label on pull requests', () => {
  withWorkspace('docker-parity-push', (workspace) => {
    const eventPath = path.join(workspace, 'event.json');
    writeFileSync(
      eventPath,
      JSON.stringify({
        pull_request: {
          labels: [{ name: 'preview' }]
        }
      })
    );

    const push = shouldPushImage({
      eventName: 'pull_request',
      ref: 'refs/pull/1/merge',
      defaultBranch: 'main',
      canaryLabel: 'preview',
      forcePush: false,
      eventPath
    });

    expect(push).toBe(true);
  });
});

test('generateTags handles target prefixes and strips source registry when adding new ones', () => {
  const tags = generateTags({
    image: 'ghcr.io/org/app',
    version: '1.2.3',
    registries: ['docker.io'],
    withLatest: true,
    ref: 'refs/tags/v1.2.3',
    target: 'alpine',
    prependTarget: true
  });

  expect(tags).toEqual([
    'ghcr.io/org/app:alpine-v1.2.3',
    'docker.io/org/app:alpine-v1.2.3',
    'ghcr.io/org/app:alpine-latest',
    'docker.io/org/app:alpine-latest'
  ]);
});

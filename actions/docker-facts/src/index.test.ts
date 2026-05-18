import { afterEach, describe, expect, test, vi } from 'vitest';

const mockGetInput = vi.fn<(name: string) => string>();
const mockSetOutput = vi.fn<(name: string, value: string) => void>();
const mockSetFailed = vi.fn<(message: string) => void>();
const mockResolveDockerFacts = vi.fn();

vi.mock('@actions/core', () => ({
  getInput: (name: string) => mockGetInput(name),
  setOutput: (name: string, value: string) => mockSetOutput(name, value),
  setFailed: (message: string) => mockSetFailed(message)
}));

vi.mock('./lib', () => ({
  resolveDockerFacts: (...args: unknown[]) => mockResolveDockerFacts(...args)
}));

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  mockGetInput.mockReset();
  mockSetOutput.mockReset();
  mockSetFailed.mockReset();
  mockResolveDockerFacts.mockReset();
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe('docker-facts index entrypoint', () => {
  test('maps inputs and sets outputs on success', async () => {
    const inputMap: Record<string, string> = {
      image: 'sample',
      version: '1.2.3',
      registries: 'docker.io,ghcr.io',
      dockerfile: './Dockerfile',
      context: '.',
      canary_label: 'canary',
      force_push: 'false',
      with_latest: 'true',
      target: 'prod',
      prepend_target: 'true'
    };
    mockGetInput.mockImplementation((name: string) => inputMap[name] ?? '');
    mockResolveDockerFacts.mockReturnValue({
      dockerfile: './Dockerfile',
      context: '.',
      target: 'prod',
      push: true,
      tags: ['sample:v1.2.3', 'docker.io/sample:v1.2.3'],
      buildArgs: { VERSION: '1.2.3' }
    });

    process.env.GITHUB_WORKSPACE = '/tmp/workspace';
    process.env.GITHUB_EVENT_NAME = 'push';
    process.env.GITHUB_REF = 'refs/heads/main';
    process.env.GITHUB_DEFAULT_BRANCH = 'main';
    process.env.GITHUB_EVENT_PATH = '/tmp/event.json';

    await import('./index.js');

    expect(mockResolveDockerFacts).toHaveBeenCalledTimes(1);
    expect(mockSetOutput).toHaveBeenCalledWith('dockerfile', './Dockerfile');
    expect(mockSetOutput).toHaveBeenCalledWith('context', '.');
    expect(mockSetOutput).toHaveBeenCalledWith('target', 'prod');
    expect(mockSetOutput).toHaveBeenCalledWith('push', 'true');
    expect(mockSetOutput).toHaveBeenCalledWith(
      'tags',
      'sample:v1.2.3,docker.io/sample:v1.2.3'
    );
    expect(process.env.BUILD_ARG_VERSION).toBe('1.2.3');
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  test('reports failures through core.setFailed', async () => {
    const inputMap: Record<string, string> = {
      image: 'sample',
      version: '1.2.3',
      registries: '',
      dockerfile: '',
      context: '',
      canary_label: '',
      force_push: '',
      with_latest: '',
      target: '',
      prepend_target: ''
    };
    mockGetInput.mockImplementation((name: string) => inputMap[name] ?? '');
    mockResolveDockerFacts.mockImplementation(() => {
      throw new Error('boom');
    });

    await import('./index.js');

    expect(mockSetFailed).toHaveBeenCalledWith('boom');
  });
});

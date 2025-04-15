# Docker Facts Action

This action extracts Dockerfile paths, context directories, and build arguments from docker-compose.yml files or uses provided fallback values. It also generates appropriate Docker tags based on branch, version, and registries.

## Features

- Automatically locates Dockerfile and context from docker-compose.yml
- Extract build arguments from docker-compose.yml
- Generates appropriate tags, including multi-registry support
- Smart decision logic for when to push images
- Support for multi-stage builds

## Inputs

| Name             | Description                                                            | Required | Default        |
| ---------------- | ---------------------------------------------------------------------- | -------- | -------------- |
| `image`          | The name of the image to build                                         | Yes      |                |
| `version`        | The version to tag the image with                                      | Yes      |                |
| `registries`     | Comma-separated list of registries to push to                          | No       |                |
| `dockerfile`     | Path to the Dockerfile (fallback if not found in docker-compose)       | No       | `./Dockerfile` |
| `context`        | Path to the build context (fallback if not found in docker-compose)    | No       | `.`            |
| `canary_label`   | Label to check for when determining if a canary build should be pushed | No       | `canary`       |
| `force_push`     | Force push the image even if conditions are not met                    | No       | `false`        |
| `with_latest`    | Also tag the image with latest                                         | No       | `false`        |
| `target`         | Target stage to build                                                  | No       |                |
| `prepend_target` | Prepend target to the tag name                                         | No       | `false`        |

## Outputs

| Name         | Description                                        |
| ------------ | -------------------------------------------------- |
| `dockerfile` | Path to the Dockerfile to use                      |
| `context`    | Path to the build context to use                   |
| `target`     | Target stage to build (if any)                     |
| `push`       | Whether to push the image (true/false)             |
| `tags`       | Comma-separated list of tags to apply to the image |

## Usage

### Basic Usage

```yaml
- name: Get Docker Facts
  id: docker-facts
  uses: mbround18/gh-reusable/actions/docker-facts@main
  with:
    image: my-app
    version: 1.0.0
```

### Using with Docker Build Action

```yaml
- name: Get Docker Facts
  id: docker-facts
  uses: mbround18/gh-reusable/actions/docker-facts@main
  with:
    image: my-app
    version: ${{ github.event.release.tag_name }}
    registries: docker.io,ghcr.io
    with_latest: true

- name: Build and Push Docker Image
  uses: docker/build-push-action@v4
  with:
    context: ${{ steps.docker-facts.outputs.context }}
    file: ${{ steps.docker-facts.outputs.dockerfile }}
    target: ${{ steps.docker-facts.outputs.target }}
    push: ${{ steps.docker-facts.outputs.push }}
    tags: ${{ steps.docker-facts.outputs.tags }}
```

### Using with docker-compose.yml

If you have a docker-compose.yml file like this:

```yaml
services:
  app:
    image: my-app:latest
    build:
      context: ./app
      dockerfile: Dockerfile.prod
      target: production
      args:
        VERSION: 1.0.0
        DEBUG: "false"
```

The action will automatically extract:

1. `dockerfile` = `./app/Dockerfile.prod`
2. `context` = `./app`
3. `target` = `production`
4. Build args will be available as `BUILD_ARG_VERSION` and `BUILD_ARG_DEBUG` environment variables

## Push Rules

Images will be pushed when:

1. The action is on the default branch (main/master)
2. The action is on a tagged release
3. The PR has the canary label (configurable via `canary_label` input)
4. Force push is enabled (`force_push: true`)

## License

MIT

Below is the updated README that follows the patterns from your repository:

---

# Docker Build Composite Action

The Docker Build Composite Action builds Docker images using Docker Buildx with support for build arguments, secrets, multi-platform builds, and registry re-tagging. It extracts build arguments and secrets from environment variables and appends key build details (including image ID and digest) to the GitHub Actions job summary.

## Usage

Reference this action in your workflow file as shown below:

```yaml
jobs:
  build-docker:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      # Login to Docker Hub
      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      # Login to additional registry (if needed)
      - name: Login to Additional Registry
        uses: docker/login-action@v3
        with:
          registry: registry.example.com
          username: ${{ secrets.REGISTRY_USERNAME }}
          password: ${{ secrets.REGISTRY_TOKEN }}

      # Set build variables for build args and secrets
      - name: Set Build Variables
        run: |
          echo "BUILD_ARG_VERSION=1.2.3" >> $GITHUB_ENV
          echo "BUILD_SECRET_API_KEY=${{ secrets.API_KEY }}" >> $GITHUB_ENV

      - name: Build Docker Image
        uses: mbround18/gh-reusable/actions/docker-build@v1.0.0
        with:
          image: "your-image-name"
          dockerfile_path: "./Dockerfile"
          context: "."
          version: "latest"
          push: "true"
          platforms: "linux/amd64,linux/arm64"
          registries: "registry.example.com"
```

## Inputs

| Name              | Description                                                                 | Required | Default          |
| ----------------- | --------------------------------------------------------------------------- | -------- | ---------------- |
| `image`           | Name of the Docker image to be built.                                       | Yes      | `mbround18/test` |
| `registries`      | Comma separated list of registries to re-tag the image with.                | No       | `""`             |
| `dockerfile_path` | Path to the Dockerfile relative to the build context.                       | Yes      | `./Dockerfile`   |
| `context`         | Directory to build in.                                                      | Yes      | `.`              |
| `version`         | Docker image tag version.                                                   | Yes      | `latest`         |
| `push`            | Whether to push the image (set to `"true"` to push).                        | No       | `"false"`        |
| `platforms`       | Comma separated list of target platforms (e.g., `linux/amd64,linux/arm64`). | No       | `linux/amd64`    |

## Outputs

This action appends build details to the GitHub Actions job summary, including:

- **Image ID**: The built Docker image ID.
- **Digest**: The image digest.

These details are captured from the outputs of the Docker build-push action.

## Registry Authentication

If you specify additional registries via the `registries` input, ensure that you log in to each registry before using this action. Use [docker/login-action](https://github.com/docker/login-action) to authenticate, as shown in the usage example.

## Environment Variables

Pass build arguments and secrets via environment variables:

- **Build Arguments:**  
  Variables with the prefix `BUILD_ARG_` are passed as build arguments.  
  Example:
  ```yaml
  env:
    BUILD_ARG_VERSION: "1.2.3"
  ```
- **Build Secrets:**  
  Variables with the prefix `BUILD_SECRET_` are passed as build secrets.  
  Example:
  ```yaml
  env:
    BUILD_SECRET_API_KEY: ${{ secrets.API_KEY }}
  ```

## Contributing

Contributions, issues, and feature requests are welcome! Please open a pull request or issue in the repository.

## License

This project is licensed under the MIT License.

---

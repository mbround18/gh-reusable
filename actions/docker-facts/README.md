# 🚀 Docker Facts Action

**Extract Dockerfile, context, and build arguments from `docker-compose.yml` or fallback values.**

This action automatically detects the appropriate Dockerfile path, context directory, and build arguments for a given image in your `docker-compose.yml`. If no match is found or the file doesn’t exist, it falls back to provided defaults. It also determines whether the image should be pushed based on the current event context.

---

## 🧰 Usage

```yaml
jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v3

      - name: Get Docker Build Facts
        id: facts
        uses: mbround18/gh-reusable/actions/docker-facts@v0.0.6
        with:
          image: mbround18/steamcmd
          dockerfile: ./Dockerfile # optional fallback
          context: . # optional fallback
          canary_label: canary # optional label match

      - name: Show Results
        run: |
          echo "Dockerfile: ${{ steps.facts.outputs.dockerfile }}"
          echo "Context: ${{ steps.facts.outputs.context }}"
          echo "Should Push: ${{ steps.facts.outputs.push }}"
```

---

## 📥 Inputs

| Name           | Description                                                                    | Required | Default        |
| -------------- | ------------------------------------------------------------------------------ | -------- | -------------- |
| `image`        | Base image name (e.g., `mbround18/steamcmd`) to match in `docker-compose.yml`. | ✅ Yes   | N/A            |
| `dockerfile`   | Fallback Dockerfile path if not found in `docker-compose.yml`.                 | No       | `./Dockerfile` |
| `context`      | Fallback build context if not found in `docker-compose.yml`.                   | No       | `.`            |
| `canary_label` | Optional PR label to allow canary push on pull requests.                       | No       | `canary`       |

---

## 📤 Outputs

| Name         | Description                                        |
| ------------ | -------------------------------------------------- |
| `dockerfile` | Dockerfile path from compose or fallback.          |
| `context`    | Context path from compose or fallback.             |
| `push`       | Whether the build should be pushed (`true/false`). |

---

## 🧠 Behavior

- If `docker-compose.yml` exists and contains a service whose image starts with `${image}:`, the action extracts:
  - `build.dockerfile`
  - `build.context`
  - `build.args` (exported to `$BUILD_ARG_*` environment variables)
- If not found, it uses the fallback `dockerfile` and `context` values.
- The `push` output is set to `true` if:
  - PR includes the `canary_label`
  - Or the ref is the default branch
  - Or the ref is a tag

---

## 🔗 Related Resources

- [@actions/core](https://github.com/actions/toolkit/tree/main/packages/core)
- [js-yaml](https://github.com/nodeca/js-yaml)
- [GitHub Actions Context Docs](https://docs.github.com/en/actions/learn-github-actions/contexts)

---

## 🛠 Example Compose

```yaml
services:
  game-server:
    image: mbround18/steamcmd:latest
    build:
      context: ./server
      dockerfile: Dockerfile
      args:
        VERSION: 1.2.3
        DEBUG: true
```

This action would detect:

- Dockerfile: `Dockerfile`
- Context: `./server`
- Exported ENV: `BUILD_ARG_VERSION=1.2.3`, `BUILD_ARG_DEBUG=true`

---

## 📦 Contributing

Pull requests welcome! If you hit issues or have suggestions, feel free to open an issue or PR.
if you want this published to the Marketplace with metadata and logo, or bundled into a reusable workflow template.zs

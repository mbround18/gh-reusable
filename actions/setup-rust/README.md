# Setup Rust Action

This GitHub Action sets up a Rust toolchain, installs additional components and targets, caches Cargo dependencies, and installs specified CLI crates. It's designed to streamline Rust development workflows in CI environments by automating the setup and caching process.

## Features

- Install specific Rust toolchains (e.g., stable, nightly, beta).
- Install additional Rust components like `clippy` and `rustfmt`.
- Install additional compilation targets.
- Cache Cargo dependencies to speed up builds.
- Install Rust CLI tools such as `trunk`, `wasm-bindgen`, and others.
- Flexibly install other crates using a comma-separated list.

## Usage

Add this to your workflow YAML file to use the action.

```yaml
name: Build Rust Project

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Setup Rust
        uses: mbround18/gh-reusable/actions/setup-rust@v1
        with:
          toolchain: "stable"
          components: "clippy,rustfmt"
          target: "wasm32-unknown-unknown"
          crates: "wasm-pack,trunk"
```

## Inputs

| Name        | Description                                      | Required | Default            |
|-------------|--------------------------------------------------|----------|--------------------|
| `toolchain` | Rust toolchain to use (e.g., stable, nightly)    | No       | `stable`           |
| `components`| Comma-separated list of Rust components to install | No       | `""`               |
| `target`    | Comma-separated list of additional Rust compilation targets | No       | `""`               |
| `crates`    | Comma-separated list of CLI crates to install    | No       | `""`               |

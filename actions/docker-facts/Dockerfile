# Build stage
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS builder

# Set the working directory
WORKDIR /action

# Copy dependency files
COPY pyproject.toml uv.lock* ./

# Install dependencies into the virtual environment
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-install-project --no-dev

# Runtime stage
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

# Set the working directory
WORKDIR /action

# Copy the virtual environment from the builder stage
COPY --from=builder /action/.venv/ /action/.venv/

# Set the PATH to include the virtual environment's bin directory
ENV PATH="/action/.venv/bin:$PATH"

# Copy the action code
COPY . .

# Define the entrypoint
ENTRYPOINT ["python", "/action/index.py"]

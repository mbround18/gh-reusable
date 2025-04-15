# Build stage
FROM python:3.13-slim AS builder

# Set the working directory
WORKDIR /action

# Install system dependencies required for building Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install PDM
RUN pip install --no-cache-dir pdm

# Disable PDM update check
ENV PDM_CHECK_UPDATE=false

# Copy pyproject.toml and pdm.lock (if available) 
COPY pyproject.toml pdm.lock* ./

# Install dependencies and project into a local virtual environment
RUN pdm install --check --prod --no-editable

# Runtime stage
FROM python:3.13-slim

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

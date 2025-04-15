FROM python:3.13-slim

# Set the working directory
WORKDIR /action

# Install system dependencies required for building Python packages and installing PDM
RUN apt-get update && apt-get install -y --no-install-recommends build-essential curl && rm -rf /var/lib/apt/lists/*

# Install PDM, the Python dependency manager
RUN pip install --no-cache-dir pdm

# Copy pyproject.toml and pdm.lock (if available) to install dependencies
COPY pyproject.toml pdm.lock* ./

# Install production dependencies using PDM
RUN pdm install --prod

# Copy the rest of the action code
COPY . .

# Define the entrypoint to run your action script. Make sure your main file is at /action/index.py.
ENTRYPOINT ["pdm", "run", "python", "/action/index.py"]

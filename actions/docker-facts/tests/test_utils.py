"""Test utilities for Docker Facts tests."""

import os
import sys
from unittest.mock import patch

# Add the parent directory to the path so we can import our module
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


def setup_test_environment():
    """Set up a standard test environment with common environment variables."""
    env_patcher = patch.dict(
        "os.environ",
        {
            "GITHUB_WORKSPACE": "/workspace",
            "GITHUB_EVENT_NAME": "push",
            "GITHUB_REF": "refs/heads/main",
            "GITHUB_DEFAULT_BRANCH": "main",
            "INPUT_IMAGE": "test-image",
            "INPUT_VERSION": "1.0.0",
            "INPUT_DOCKERFILE": "./Dockerfile",
            "INPUT_CONTEXT": ".",
        },
    )
    return env_patcher

#!/usr/bin/env python3
"""Tests for the Dockerfile path resolution logic"""

import os
import sys
import tempfile
import unittest
from unittest.mock import patch, MagicMock

# Add parent directory to path so we can import the module
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import index


class TestDockerfileResolution(unittest.TestCase):
    """Test cases for the Dockerfile resolution logic"""

    def setUp(self):
        """Set up test environment"""
        # Create a temporary directory structure for tests
        self.temp_dir = tempfile.TemporaryDirectory()
        self.workspace = self.temp_dir.name

        # Create some test directories
        self.context_dir = os.path.join(self.workspace, "app")
        self.nested_dir = os.path.join(self.context_dir, "docker")
        os.makedirs(self.context_dir, exist_ok=True)
        os.makedirs(self.nested_dir, exist_ok=True)

        # Create test Dockerfiles in different locations
        with open(os.path.join(self.workspace, "Dockerfile"), "w") as f:
            f.write("FROM python:3.9\n")

        with open(os.path.join(self.context_dir, "Dockerfile.prod"), "w") as f:
            f.write("FROM python:3.9-slim\n")

        with open(os.path.join(self.nested_dir, "Dockerfile.dev"), "w") as f:
            f.write("FROM python:3.9-alpine\n")

    def tearDown(self):
        """Clean up after tests"""
        self.temp_dir.cleanup()

    @patch("index.resolve_path")
    @patch("index.get_github_workspace")
    def test_find_dockerfile_exact_path(self, mock_workspace, mock_resolve):
        """Test finding Dockerfile with exact path"""
        # Setup mocks
        mock_workspace.return_value = self.workspace
        mock_resolve.side_effect = lambda path, to_relative=False: os.path.join(
            self.workspace, path.lstrip("./")
        )

        dockerfile_path = "./Dockerfile"
        context_path = "."

        result = index.find_dockerfile(dockerfile_path, context_path)

        # Should find the exact file
        self.assertEqual(result, os.path.join(self.workspace, "Dockerfile"))

    @patch("index.resolve_path")
    @patch("index.get_github_workspace")
    def test_find_dockerfile_in_context(self, mock_workspace, mock_resolve):
        """Test finding Dockerfile in context directory"""
        # Setup mocks
        mock_workspace.return_value = self.workspace
        mock_resolve.side_effect = lambda path, to_relative=False: os.path.join(
            self.workspace, path.lstrip("./")
        )

        dockerfile_path = "Dockerfile.prod"  # Just the filename
        context_path = "./app"  # Context directory

        result = index.find_dockerfile(dockerfile_path, context_path)

        # Should find the file in context
        self.assertEqual(result, os.path.join(self.workspace, "app/Dockerfile.prod"))

    @patch("index.resolve_path")
    @patch("index.get_github_workspace")
    def test_find_dockerfile_nested_path(self, mock_workspace, mock_resolve):
        """Test finding Dockerfile with nested path"""
        # Setup mocks
        mock_workspace.return_value = self.workspace
        mock_resolve.side_effect = lambda path, to_relative=False: os.path.join(
            self.workspace, path.lstrip("./")
        )

        dockerfile_path = "docker/Dockerfile.dev"
        context_path = "./app"

        result = index.find_dockerfile(dockerfile_path, context_path)

        # Should find the nested file
        self.assertEqual(
            result, os.path.join(self.workspace, "app/docker/Dockerfile.dev")
        )

    @patch("index.resolve_path")
    @patch("index.get_github_workspace")
    def test_find_dockerfile_fallback(self, mock_workspace, mock_resolve):
        """Test fallback to original path when file doesn't exist"""
        # Setup mocks
        mock_workspace.return_value = self.workspace
        mock_resolve.side_effect = lambda path, to_relative=False: os.path.join(
            self.workspace, path.lstrip("./")
        )

        dockerfile_path = "nonexistent/Dockerfile"
        context_path = "./app"

        result = index.find_dockerfile(dockerfile_path, context_path)

        # Should return the resolved original path even though file doesn't exist
        self.assertEqual(result, os.path.join(self.workspace, "nonexistent/Dockerfile"))

    @patch("index.resolve_path")
    @patch("index.get_github_workspace")
    def test_find_dockerfile_absolute_path(self, mock_workspace, mock_resolve):
        """Test finding Dockerfile with absolute path"""
        # Setup mocks
        mock_workspace.return_value = self.workspace
        abs_dockerfile = os.path.join(self.workspace, "Dockerfile")

        def mock_resolve_side_effect(path, to_relative=False):
            if path == abs_dockerfile:
                return abs_dockerfile
            return os.path.join(self.workspace, path.lstrip("./"))

        mock_resolve.side_effect = mock_resolve_side_effect

        # Use absolute path
        dockerfile_path = abs_dockerfile
        context_path = "."

        result = index.find_dockerfile(dockerfile_path, context_path)

        # Should find the file with absolute path
        self.assertEqual(result, abs_dockerfile)


if __name__ == "__main__":
    unittest.main()

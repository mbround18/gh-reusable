#!/usr/bin/env python3
"""Tests for Docker Compose file resolution logic"""

import os
import sys
import tempfile
import unittest
from unittest.mock import patch, MagicMock

# Add parent directory to path so we can import the module
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import index


class TestDockerComposeResolution(unittest.TestCase):
    """Test cases for the Docker Compose file resolution logic"""

    def setUp(self):
        """Set up test environment"""
        # Create a temporary directory structure for tests
        self.temp_dir = tempfile.TemporaryDirectory()
        self.workspace = self.temp_dir.name

        # Create some test directories
        self.context_dir = os.path.join(self.workspace, "app")
        os.makedirs(self.context_dir, exist_ok=True)

        # Create test Docker Compose files in different locations
        with open(os.path.join(self.workspace, "docker-compose.yml"), "w") as f:
            f.write("version: '3'\nservices:\n  app:\n    image: test:latest\n")

        with open(os.path.join(self.context_dir, "docker-compose.yaml"), "w") as f:
            f.write("version: '3'\nservices:\n  app:\n    image: test-context:latest\n")

    def tearDown(self):
        """Clean up after tests"""
        self.temp_dir.cleanup()

    @patch("index.get_github_workspace")
    @patch("index.resolve_path")
    def test_find_docker_compose_in_workspace_root(self, mock_resolve, mock_workspace):
        """Test finding Docker Compose file in workspace root"""
        mock_workspace.return_value = self.workspace
        mock_resolve.side_effect = (
            lambda path, to_relative=False: os.path.join(self.workspace, path)
            if path and not os.path.isabs(path)
            else path
        )

        # No context provided
        result = index.find_docker_compose()

        self.assertEqual(result, os.path.join(self.workspace, "docker-compose.yml"))

    @patch("index.get_github_workspace")
    @patch("index.resolve_path")
    def test_find_docker_compose_in_context_dir(self, mock_resolve, mock_workspace):
        """Test finding Docker Compose file in context directory when workspace has none"""
        mock_workspace.return_value = self.workspace

        def mock_resolve_side_effect(path, to_relative=False):
            if path == "./app" or path == "app":
                return os.path.join(self.workspace, "app")
            return path

        mock_resolve.side_effect = mock_resolve_side_effect

        # Remove the workspace file so we find the context one
        os.remove(os.path.join(self.workspace, "docker-compose.yml"))

        # Provide context path
        context_path = "./app"
        result = index.find_docker_compose(context_path)

        self.assertEqual(
            result, os.path.join(self.workspace, "app/docker-compose.yaml")
        )

    @patch("index.get_github_workspace")
    @patch("index.resolve_path")
    def test_prefer_workspace_over_context(self, mock_resolve, mock_workspace):
        """Test preferring workspace file over context file when both exist"""
        mock_workspace.return_value = self.workspace

        def mock_resolve_side_effect(path, to_relative=False):
            if path == "./app" or path == "app":
                return os.path.join(self.workspace, "app")
            return path

        mock_resolve.side_effect = mock_resolve_side_effect

        # Provide context path
        context_path = "./app"
        result = index.find_docker_compose(context_path)

        # Should find the one in workspace first, even with a different name
        self.assertEqual(result, os.path.join(self.workspace, "docker-compose.yml"))

    @patch("index.get_github_workspace")
    @patch("index.resolve_path")
    def test_search_alternative_filenames_in_workspace(
        self, mock_resolve, mock_workspace
    ):
        """Test finding alternative Docker Compose filenames in workspace"""
        mock_workspace.return_value = self.workspace
        mock_resolve.side_effect = lambda path, to_relative=False: path

        # Remove the default file
        os.remove(os.path.join(self.workspace, "docker-compose.yml"))

        # Create an alternative format
        compose_filename = "compose.yml"
        with open(os.path.join(self.workspace, compose_filename), "w") as f:
            f.write("version: '3'\nservices:\n  app:\n    image: workspace:latest\n")

        # No context provided
        result = index.find_docker_compose()

        # Should find the alternative filename
        self.assertEqual(result, os.path.join(self.workspace, compose_filename))

    @patch("index.get_github_workspace")
    @patch("index.resolve_path")
    def test_no_docker_compose_found(self, mock_resolve, mock_workspace):
        """Test when no Docker Compose file exists"""
        mock_workspace.return_value = self.workspace

        def mock_resolve_side_effect(path, to_relative=False):
            if path == "./app" or path == "app":
                return os.path.join(self.workspace, "app")
            return path

        mock_resolve.side_effect = mock_resolve_side_effect

        # Remove all Docker Compose files
        os.remove(os.path.join(self.workspace, "docker-compose.yml"))
        os.remove(os.path.join(self.context_dir, "docker-compose.yaml"))

        # Provide context path
        context_path = "./app"
        result = index.find_docker_compose(context_path)

        # Should return None
        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()

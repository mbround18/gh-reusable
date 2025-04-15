"""Tests for nested path resolution with Docker Compose."""

import unittest
from unittest.mock import patch, mock_open, MagicMock
import os
import tempfile

from tests.test_utils import setup_test_environment
import index


class TestNestedPaths(unittest.TestCase):
    """Test cases for nested path resolution."""

    def setUp(self):
        self.env_patcher = setup_test_environment()
        self.env_patcher.start()

    def tearDown(self):
        self.env_patcher.stop()

    def test_nested_context_resolution(self):
        """Test nested context and dockerfile resolution."""
        # Mock a compose file that has both dockerfile and context
        mock_compose_data = {
            "dockerfile": "Dockerfile.prod",
            "context": "app",
            "target": "production",
            "build_args": {},
        }

        with (
            patch(
                "index.find_docker_compose",
                return_value="/workspace/docker-compose.yml",
            ),
            patch("index.parse_docker_compose", return_value=mock_compose_data),
            tempfile.NamedTemporaryFile() as temp_file,
        ):
            with patch.dict(
                "os.environ",
                {
                    "GITHUB_OUTPUT": temp_file.name,
                    "INPUT_IMAGE": "test-image",
                    "INPUT_VERSION": "1.0.0",
                    "INPUT_CONTEXT": "docker",
                    "INPUT_DOCKERFILE": "Dockerfile.default",
                },
            ):
                index.main()

                # Check output file
                temp_file.seek(0)
                output_content = temp_file.read().decode("utf-8")

                # Now expect relative paths
                self.assertIn("dockerfile=./docker/app/Dockerfile.prod", output_content)
                self.assertIn("context=./docker/app", output_content)
                self.assertIn("target=production", output_content)

    def test_dockerfile_without_context(self):
        """Test handling of dockerfile-only specification in docker-compose."""
        # Mock a compose file that has dockerfile but no context
        mock_compose_data = {
            "dockerfile": "Dockerfile.special",
            "context": None,
            "target": None,
            "build_args": {},
        }

        with (
            patch(
                "index.find_docker_compose",
                return_value="/workspace/docker-compose.yml",
            ),
            patch("index.parse_docker_compose", return_value=mock_compose_data),
            tempfile.NamedTemporaryFile() as temp_file,
        ):
            with patch.dict(
                "os.environ",
                {
                    "GITHUB_OUTPUT": temp_file.name,
                    "INPUT_IMAGE": "test-image",
                    "INPUT_VERSION": "1.0.0",
                    "INPUT_CONTEXT": "docker",
                    "INPUT_DOCKERFILE": "Dockerfile.default",
                },
            ):
                index.main()

                # Check output file
                temp_file.seek(0)
                output_content = temp_file.read().decode("utf-8")

                # Now expect relative paths
                self.assertIn("dockerfile=./docker/Dockerfile.special", output_content)
                self.assertIn("context=./docker", output_content)

    def test_context_only(self):
        """Test handling of context-only specification in docker-compose."""
        # Mock a compose file that has only context (no dockerfile)
        mock_compose_data = {
            "dockerfile": None,
            "context": "web",
            "target": None,
            "build_args": {},
        }

        with (
            patch(
                "index.find_docker_compose",
                return_value="/workspace/docker-compose.yml",
            ),
            patch("index.parse_docker_compose", return_value=mock_compose_data),
            tempfile.NamedTemporaryFile() as temp_file,
        ):
            with patch.dict(
                "os.environ",
                {
                    "GITHUB_OUTPUT": temp_file.name,
                    "INPUT_IMAGE": "test-image",
                    "INPUT_VERSION": "1.0.0",
                    "INPUT_CONTEXT": "docker",
                    "INPUT_DOCKERFILE": "Dockerfile.default",
                },
            ):
                index.main()

                # Check output file
                temp_file.seek(0)
                output_content = temp_file.read().decode("utf-8")

                # Now expect relative paths
                self.assertIn("dockerfile=./Dockerfile.default", output_content)
                self.assertIn("context=./docker/web", output_content)

    @patch("index.find_docker_compose")
    @patch("index.parse_docker_compose")
    def test_absolute_paths(self, mock_parse_compose, mock_find_compose):
        """Test resolution with absolute paths in Docker Compose."""
        # Setup mocks
        mock_find_compose.return_value = "/workspace/docker-compose.yml"
        mock_parse_compose.return_value = {
            "dockerfile": "/absolute/path/Dockerfile",
            "context": "/absolute/path/context",
            "target": None,
            "build_args": {},
        }

        # Create a temp file for GITHUB_OUTPUT
        with tempfile.NamedTemporaryFile() as temp_file:
            with patch.dict(
                "os.environ",
                {
                    "GITHUB_OUTPUT": temp_file.name,
                    "INPUT_IMAGE": "test-image",
                    "INPUT_VERSION": "1.0.0",
                    "INPUT_CONTEXT": "./docker",  # Should be ignored for absolute paths
                },
            ):
                index.main()

                # Read the output file
                temp_file.seek(0)
                output_content = temp_file.read().decode("utf-8")

                # Absolute paths should be preserved
                self.assertIn("context=/absolute/path/context", output_content)
                self.assertIn("dockerfile=/absolute/path/Dockerfile", output_content)


if __name__ == "__main__":
    unittest.main()

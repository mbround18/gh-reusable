"""Tests for the main function."""

import os
import unittest
import tempfile
import io
import sys
from unittest.mock import patch, mock_open, MagicMock

from tests.test_utils import setup_test_environment
import index


class TestMainFunction(unittest.TestCase):
    """Test cases for the main function."""

    def setUp(self):
        self.env_patcher = setup_test_environment()
        self.env_patcher.start()

    def tearDown(self):
        self.env_patcher.stop()

    @patch("index.find_docker_compose")
    @patch("index.resolve_path")
    @patch("index.should_push_image")
    @patch("index.generate_tags")
    def test_main_function_with_github_output(
        self,
        mock_generate_tags,
        mock_should_push,
        mock_resolve_path,
        mock_find_docker_compose,
    ):
        """Test the main function with GitHub output file."""
        # Setup mocks
        mock_find_docker_compose.return_value = None
        mock_should_push.return_value = True
        mock_resolve_path.side_effect = (
            lambda path: f"/workspace/{path}" if path else ""
        )
        mock_generate_tags.return_value = ["test-image:v1.0.0", "test-image:latest"]

        # Test with GitHub output file
        with tempfile.NamedTemporaryFile() as temp_file:
            with patch.dict(
                "os.environ",
                {
                    "GITHUB_OUTPUT": temp_file.name,
                    "INPUT_IMAGE": "test-image",
                    "INPUT_VERSION": "1.0.0",
                },
            ):
                index.main()

                # Read the output file
                temp_file.seek(0)
                output_content = temp_file.read().decode("utf-8")

                self.assertIn("dockerfile=", output_content)
                self.assertIn("context=", output_content)
                self.assertIn("push=true", output_content)
                self.assertIn(
                    "tags=test-image:v1.0.0,test-image:latest", output_content
                )

    @patch("index.find_docker_compose")
    @patch("index.parse_docker_compose")
    @patch("sys.stdout", new_callable=io.StringIO)
    def test_main_function_with_stdout(
        self, mock_stdout, mock_parse_compose, mock_find_compose
    ):
        """Test main function with stdout output (no GITHUB_OUTPUT)."""
        # Setup mocks
        mock_find_compose.return_value = "/workspace/docker-compose.yml"
        mock_parse_compose.return_value = {
            "dockerfile": "Dockerfile.prod",
            "context": "./app",
            "target": "production",
            "build_args": {"VERSION": "1.0.0"},
        }

        with patch.dict(
            "os.environ",
            {
                "GITHUB_OUTPUT": "",
                "INPUT_IMAGE": "test-image",
                "INPUT_VERSION": "1.0.0",
            },
        ):
            index.main()
            output = mock_stdout.getvalue()

            self.assertIn("::set-output name=dockerfile::", output)
            self.assertIn("::set-output name=context::", output)
            self.assertIn("::set-output name=target::production", output)

    @patch("sys.exit")
    def test_main_function_missing_inputs(self, mock_exit):
        """Test main function with missing required inputs."""
        # Test missing image
        with patch.dict("os.environ", {"INPUT_IMAGE": "", "INPUT_VERSION": "1.0.0"}):
            index.main()
            mock_exit.assert_called_with(1)

        # Reset mock
        mock_exit.reset_mock()

        # Test missing version
        with patch.dict(
            "os.environ", {"INPUT_IMAGE": "test-image", "INPUT_VERSION": ""}
        ):
            index.main()
            mock_exit.assert_called_with(1)

    @patch("index.find_docker_compose")
    @patch("index.parse_docker_compose")
    def test_main_function_with_compose_data(
        self, mock_parse_compose, mock_find_compose
    ):
        """Test main function with Docker Compose data."""
        # Setup mocks
        mock_find_compose.return_value = "/workspace/docker-compose.yml"
        mock_parse_compose.return_value = {
            "dockerfile": "Dockerfile.prod",
            "context": "./app",
            "target": "production",
            "build_args": {"VERSION": "1.0.0", "DEBUG": "false"},
        }

        # Create a temp file for GITHUB_OUTPUT
        with tempfile.NamedTemporaryFile() as temp_file:
            with patch.dict(
                "os.environ",
                {
                    "GITHUB_OUTPUT": temp_file.name,
                    "INPUT_IMAGE": "test-image",
                    "INPUT_VERSION": "1.0.0",
                },
            ):
                # Check that environment variables for build args are set
                index.main()

                self.assertEqual(os.environ.get("BUILD_ARG_VERSION"), "1.0.0")
                self.assertEqual(os.environ.get("BUILD_ARG_DEBUG"), "false")

                # Check output file
                temp_file.seek(0)
                output_content = temp_file.read().decode("utf-8")
                self.assertIn("target=production", output_content)

    @patch("index.find_docker_compose")
    @patch("os.path.dirname")
    @patch("os.path.exists")
    def test_main_function_with_github_output_directory_error(
        self, mock_exists, mock_dirname, mock_find_compose
    ):
        """Test main function when GITHUB_OUTPUT directory doesn't exist."""
        # Setup mocks
        mock_find_compose.return_value = None
        mock_dirname.return_value = "/nonexistent/directory"
        mock_exists.return_value = False

        # Mock stdout to capture output
        mock_stdout = io.StringIO()
        with (
            patch("sys.stdout", mock_stdout),
            patch.dict(
                "os.environ",
                {
                    "GITHUB_OUTPUT": "/nonexistent/directory/output",
                    "INPUT_IMAGE": "test-image",
                    "INPUT_VERSION": "1.0.0",
                },
            ),
        ):
            index.main()
            output = mock_stdout.getvalue()

            # Should fall back to stdout
            self.assertIn("::set-output name=", output)

    @patch("index.find_docker_compose")
    @patch("index.parse_docker_compose")
    def test_main_function_with_partial_compose_data(
        self, mock_parse_compose, mock_find_compose
    ):
        """Test main function with partial Docker Compose data."""
        # Setup mocks
        mock_find_compose.return_value = "/workspace/docker-compose.yml"
        # Return partial data (only context, no dockerfile or target)
        mock_parse_compose.return_value = {
            "dockerfile": None,
            "context": "./app",
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
                    "INPUT_DOCKERFILE": "./Dockerfile.custom",
                    "INPUT_TARGET": "custom-target",
                },
            ):
                index.main()

                # Check output file - should use context from compose but dockerfile and target from inputs
                temp_file.seek(0)
                output_content = temp_file.read().decode("utf-8")
                self.assertIn("context=", output_content)
                self.assertIn("target=custom-target", output_content)


if __name__ == "__main__":
    unittest.main()

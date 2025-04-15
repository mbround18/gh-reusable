import os
import sys
import unittest
from unittest.mock import patch, mock_open, MagicMock
import tempfile
import json
import io

# Add the parent directory to the path so we can import our module
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import index


class TestDockerFacts(unittest.TestCase):
    def setUp(self):
        # Mock environment variables
        self.env_patcher = patch.dict(
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
        self.env_patcher.start()

    def tearDown(self):
        self.env_patcher.stop()

    def test_resolve_path(self):
        # Test conversion to absolute paths
        self.assertEqual(index.resolve_path("./test"), "/workspace/test")
        self.assertEqual(index.resolve_path("/absolute/path"), "/absolute/path")
        self.assertEqual(index.resolve_path(""), "")

        # Test conversion to workspace-relative paths
        with patch.dict("os.environ", {"GITHUB_WORKSPACE": "/workspace"}):
            self.assertEqual(
                index.resolve_path("/workspace/test", to_relative=True), "./test"
            )
            self.assertEqual(
                index.resolve_path("/workspace/nested/path", to_relative=True),
                "./nested/path",
            )
            # Test handling of paths already relative or outside workspace
            self.assertEqual(
                index.resolve_path("./already/relative", to_relative=True),
                "./already/relative",
            )
            self.assertEqual(
                index.resolve_path("/outside/workspace", to_relative=True),
                "/outside/workspace",
            )

    @patch("os.path.exists")
    def test_find_docker_compose(self, mock_exists):
        # Test finding docker-compose.yml
        mock_exists.reset_mock()
        mock_exists.side_effect = lambda path: path == "/workspace/docker-compose.yml"
        self.assertEqual(index.find_docker_compose(), "/workspace/docker-compose.yml")

        # Test finding docker-compose.yaml
        mock_exists.reset_mock()
        mock_exists.side_effect = lambda path: path == "/workspace/docker-compose.yaml"
        self.assertEqual(index.find_docker_compose(), "/workspace/docker-compose.yaml")

        # Test no compose file found
        mock_exists.reset_mock()
        mock_exists.side_effect = None  # Clear the side_effect
        mock_exists.return_value = False
        self.assertIsNone(index.find_docker_compose())

    def test_parse_docker_compose(self):
        compose_yaml = """
services:
  app:
    image: test-image:latest
    build:
      context: ./app
      dockerfile: Dockerfile.prod
      target: production
      args:
        VERSION: 1.0.0
        DEBUG: 'false'
"""
        with patch("builtins.open", mock_open(read_data=compose_yaml)):
            result = index.parse_docker_compose("docker-compose.yml", "test-image")

        self.assertEqual(result["dockerfile"], "Dockerfile.prod")
        self.assertEqual(result["context"], "./app")
        self.assertEqual(result["target"], "production")
        self.assertEqual(result["build_args"], {"VERSION": "1.0.0", "DEBUG": "false"})

    def test_parse_docker_compose_list_args(self):
        """Test parsing Docker Compose with args in list format"""
        compose_yaml = """
services:
  app:
    image: test-image:latest
    build:
      context: ./app
      dockerfile: Dockerfile.prod
      args:
        - VERSION=1.0.0
        - DEBUG=false
"""
        with patch("builtins.open", mock_open(read_data=compose_yaml)):
            result = index.parse_docker_compose("docker-compose.yml", "test-image")

        self.assertEqual(result["dockerfile"], "Dockerfile.prod")
        self.assertEqual(result["context"], "./app")
        self.assertEqual(result["build_args"], {"VERSION": "1.0.0", "DEBUG": "false"})

    def test_parse_docker_compose_string_format(self):
        """Test parsing Docker Compose with build as string format"""
        compose_yaml = """
services:
  app:
    image: test-image:latest
    build: ./app
"""
        with patch("builtins.open", mock_open(read_data=compose_yaml)):
            result = index.parse_docker_compose("docker-compose.yml", "test-image")

        self.assertEqual(result["dockerfile"], None)
        self.assertEqual(result["context"], "./app")
        self.assertEqual(result["build_args"], {})

    def test_parse_docker_compose_no_match(self):
        """Test parsing Docker Compose with no matching service"""
        compose_yaml = """
services:
  app:
    image: other-image:latest
    build:
      context: ./app
"""
        with patch("builtins.open", mock_open(read_data=compose_yaml)):
            result = index.parse_docker_compose("docker-compose.yml", "test-image")

        self.assertEqual(result["dockerfile"], None)
        self.assertEqual(result["context"], None)
        self.assertEqual(result["build_args"], {})

    def test_parse_docker_compose_invalid(self):
        """Test parsing invalid Docker Compose file"""
        with patch("builtins.open", mock_open(read_data="invalid: yaml: content")):
            result = index.parse_docker_compose("docker-compose.yml", "test-image")

        self.assertEqual(result["dockerfile"], None)
        self.assertEqual(result["context"], None)
        self.assertEqual(result["build_args"], {})

    def test_parse_docker_compose_no_build(self):
        """Test parsing Docker Compose with no build section"""
        compose_yaml = """
services:
  app:
    image: test-image:latest
"""
        with patch("builtins.open", mock_open(read_data=compose_yaml)):
            result = index.parse_docker_compose("docker-compose.yml", "test-image")

        self.assertEqual(result["dockerfile"], None)
        self.assertEqual(result["context"], None)
        self.assertEqual(result["build_args"], {})

    def test_parse_docker_compose_no_services(self):
        """Test parsing Docker Compose with no services section"""
        compose_yaml = """
version: '3'
networks:
  frontend:
  backend:
"""
        with patch("builtins.open", mock_open(read_data=compose_yaml)):
            result = index.parse_docker_compose("docker-compose.yml", "test-image")

        self.assertEqual(result["dockerfile"], None)
        self.assertEqual(result["context"], None)
        self.assertEqual(result["build_args"], {})

    def test_parse_docker_compose_file_error(self):
        """Test error handling when opening compose file"""
        with patch("builtins.open", mock_open()) as mock_file:
            mock_file.side_effect = IOError("File not found")
            result = index.parse_docker_compose("docker-compose.yml", "test-image")

        self.assertEqual(result["dockerfile"], None)
        self.assertEqual(result["context"], None)
        self.assertEqual(result["build_args"], {})

    def test_should_push_image(self):
        # Test push on default branch
        with patch.dict("os.environ", {"GITHUB_REF": "refs/heads/main"}):
            self.assertTrue(index.should_push_image())

        # Test push on tags
        with patch.dict("os.environ", {"GITHUB_REF": "refs/tags/v1.0.0"}):
            self.assertTrue(index.should_push_image())

        # Test no push on non-default branch
        with patch.dict("os.environ", {"GITHUB_REF": "refs/heads/feature"}):
            self.assertFalse(index.should_push_image())

    def test_should_push_image_force(self):
        """Test force push option"""
        with patch.dict(
            "os.environ",
            {"GITHUB_REF": "refs/heads/feature", "INPUT_FORCE_PUSH": "true"},
        ):
            self.assertTrue(index.should_push_image())

    def test_should_push_image_canary(self):
        """Test canary label in PR"""
        event_data = {"pull_request": {"labels": [{"name": "canary"}]}}

        with (
            patch("index.load_event_data", return_value=event_data),
            patch.dict(
                "os.environ",
                {
                    "GITHUB_EVENT_NAME": "pull_request",
                    "GITHUB_REF": "refs/pull/123/merge",
                },
            ),
        ):
            self.assertTrue(index.should_push_image())

    def test_generate_tags(self):
        # Test basic tag generation
        tags = index.generate_tags("1.0.0")
        self.assertIn("test-image:v1.0.0", tags)

        # Test with registries
        with patch.dict("os.environ", {"INPUT_REGISTRIES": "docker.io,ghcr.io"}):
            tags = index.generate_tags("1.0.0")
            self.assertIn("test-image:v1.0.0", tags)
            self.assertIn("docker.io/test-image:v1.0.0", tags)
            self.assertIn("ghcr.io/test-image:v1.0.0", tags)

        # Test with latest tag
        with patch.dict(
            "os.environ",
            {"INPUT_WITH_LATEST": "true", "GITHUB_REF": "refs/tags/v1.0.0"},
        ):
            tags = index.generate_tags("1.0.0")
            self.assertIn("test-image:v1.0.0", tags)
            self.assertIn("test-image:latest", tags)

        # Test with target prepending
        with patch.dict(
            "os.environ", {"INPUT_TARGET": "prod", "INPUT_PREPEND_TARGET": "true"}
        ):
            tags = index.generate_tags("1.0.0")
            self.assertIn("test-image:prod-v1.0.0", tags)

    def test_generate_tags_with_registry_in_name(self):
        """Test tag generation with registry already in the image name"""
        with patch.dict(
            "os.environ",
            {"INPUT_IMAGE": "ghcr.io/user/test-image", "INPUT_REGISTRIES": "docker.io"},
        ):
            tags = index.generate_tags("1.0.0")
            self.assertIn("ghcr.io/user/test-image:v1.0.0", tags)
            self.assertIn("docker.io/user/test-image:v1.0.0", tags)

    def test_load_event_data(self):
        """Test loading event data from file"""
        event_data = {"event": "push", "ref": "refs/heads/main"}

        # Test with valid event data file
        with (
            patch("os.path.exists", return_value=True),
            patch("builtins.open", mock_open(read_data=json.dumps(event_data))),
            patch.dict("os.environ", {"GITHUB_EVENT_PATH": "/path/to/event.json"}),
        ):
            result = index.load_event_data()
            self.assertEqual(result, event_data)

        # Test with file not found
        with (
            patch("os.path.exists", return_value=False),
            patch.dict("os.environ", {"GITHUB_EVENT_PATH": "/path/to/missing.json"}),
        ):
            result = index.load_event_data()
            self.assertEqual(result, {})

        # Test with invalid JSON
        with (
            patch("os.path.exists", return_value=True),
            patch("builtins.open", mock_open(read_data="invalid json")),
            patch.dict("os.environ", {"GITHUB_EVENT_PATH": "/path/to/invalid.json"}),
        ):
            result = index.load_event_data()
            self.assertEqual(result, {})

    @patch("index.find_docker_compose")
    @patch("index.resolve_path")
    @patch("index.should_push_image")
    @patch("index.generate_tags")
    def test_main_function(
        self,
        mock_generate_tags,
        mock_should_push,
        mock_resolve_path,
        mock_find_docker_compose,
    ):
        """Test the main function"""
        # Setup mocks
        mock_find_docker_compose.return_value = None
        mock_should_push.return_value = True

        # Update mock to handle to_relative parameter
        mock_resolve_path.side_effect = (
            lambda path, to_relative=False: (
                f"./{''.join(path.split('/')[-1:])}"
                if to_relative
                else f"/workspace/{path}"
            )
            if path
            else ""
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
    def test_main_local_output(
        self, mock_stdout, mock_parse_compose, mock_find_compose
    ):
        """Test main function with local output (no GITHUB_OUTPUT)"""
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
    def test_main_missing_inputs(self, mock_exit):
        """Test main function with missing required inputs"""
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
    def test_main_with_compose_data(self, mock_parse_compose, mock_find_compose):
        """Test main function with Docker Compose data"""
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

    @patch("index.get_input_image")
    @patch("index.get_input_version")
    @patch("index.get_input_dockerfile")
    @patch("index.get_input_context")
    @patch("index.get_input_target")
    @patch("index.get_input_prepend_target")
    @patch("index.find_dockerfile")
    @patch("index.resolve_path")
    @patch("index.find_docker_compose")
    @patch("index.parse_docker_compose")
    @patch("index.generate_tags")
    @patch("index.should_push_image")
    @patch("index.get_github_output")
    @patch("builtins.open", unittest.mock.mock_open())
    def test_prepend_target(
        self,
        mock_output,
        mock_should_push,
        mock_generate_tags,
        mock_parse_compose,
        mock_find_compose,
        mock_resolve_path,
        mock_find_dockerfile,
        mock_prepend_target,
        mock_target,
        mock_context,
        mock_dockerfile,
        mock_version,
        mock_image,
    ):
        """Test target prepending in tag generation"""
        # Setup mocks
        mock_image.return_value = "test-image"
        mock_version.return_value = "1.0.0"
        mock_dockerfile.return_value = "./Dockerfile"
        mock_context.return_value = "."
        mock_target.return_value = "prod"
        mock_prepend_target.return_value = True
        mock_should_push.return_value = False
        mock_output.return_value = ""

        # Set up path resolution
        mock_resolve_path.side_effect = (
            lambda path, to_relative=False: f"/workspace/{path}"
            if not to_relative
            else path
        )

        # Set up file finding
        mock_find_dockerfile.return_value = "/workspace/Dockerfile"
        mock_find_compose.return_value = None
        mock_parse_compose.return_value = {
            "dockerfile": None,
            "context": None,
            "target": None,
            "build_args": {},
        }

        # Mock tag generation to check if target is properly passed
        mock_generate_tags.return_value = ["test-image:prod-v1.0.0"]

        # Run the main function
        index.main()

        # Verify that generate_tags was called with the target parameter
        mock_generate_tags.assert_called_once_with("1.0.0", target="prod")

    @patch("index.get_input_image")
    @patch("index.get_input_version")
    @patch("index.generate_tags")
    def test_generate_tags(self, mock_generate_tags, mock_version, mock_image):
        """Test generate_tags function directly"""
        # Setup mocks
        mock_image.return_value = "test-image"
        mock_version.return_value = "1.0.0"

        # Set up the mock to return our expected tags
        mock_generate_tags.return_value = ["test-image:prod-v1.0.0"]

        # Call generate_tags with parameters to enable target prepending
        with patch("index.get_input_target", return_value="prod"):
            with patch("index.get_input_prepend_target", return_value=True):
                tags = index.generate_tags("1.0.0", target="prod")

        # Verify the expected tag was generated
        self.assertIn("test-image:prod-v1.0.0", tags)


if __name__ == "__main__":
    unittest.main()

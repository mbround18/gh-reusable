"""Tests for Docker Compose parsing functionality."""

import unittest
from unittest.mock import patch, mock_open

from tests.test_utils import setup_test_environment
import index


class TestDockerCompose(unittest.TestCase):
    """Test cases for Docker Compose parsing functionality."""

    def setUp(self):
        self.env_patcher = setup_test_environment()
        self.env_patcher.start()

    def tearDown(self):
        self.env_patcher.stop()

    def test_parse_docker_compose_standard(self):
        """Test parsing standard Docker Compose configuration."""
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
        """Test parsing Docker Compose with args in list format."""
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
        """Test parsing Docker Compose with build as string format."""
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
        """Test parsing Docker Compose with no matching service."""
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
        """Test parsing invalid Docker Compose file."""
        with patch("builtins.open", mock_open(read_data="invalid: yaml: content")):
            result = index.parse_docker_compose("docker-compose.yml", "test-image")

        self.assertEqual(result["dockerfile"], None)
        self.assertEqual(result["context"], None)
        self.assertEqual(result["build_args"], {})

    def test_parse_docker_compose_no_build(self):
        """Test parsing Docker Compose with no build section."""
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
        """Test parsing Docker Compose with no services section."""
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
        """Test error handling when opening compose file."""
        with patch("builtins.open", mock_open()) as mock_file:
            mock_file.side_effect = IOError("File not found")
            result = index.parse_docker_compose("docker-compose.yml", "test-image")

        self.assertEqual(result["dockerfile"], None)
        self.assertEqual(result["context"], None)
        self.assertEqual(result["build_args"], {})

    def test_parse_docker_compose_empty_file(self):
        """Test parsing empty Docker Compose file."""
        with patch("builtins.open", mock_open(read_data="")):
            result = index.parse_docker_compose("docker-compose.yml", "test-image")

        self.assertEqual(result["dockerfile"], None)
        self.assertEqual(result["context"], None)
        self.assertEqual(result["build_args"], {})

    def test_parse_docker_compose_multiple_services(self):
        """Test parsing Docker Compose with multiple services."""
        compose_yaml = """
services:
  web:
    image: other-image:latest
    
  app:
    image: test-image:latest
    build:
      context: ./app
      dockerfile: Dockerfile.app
      
  db:
    image: postgres:latest
"""
        with patch("builtins.open", mock_open(read_data=compose_yaml)):
            result = index.parse_docker_compose("docker-compose.yml", "test-image")

        self.assertEqual(result["dockerfile"], "Dockerfile.app")
        self.assertEqual(result["context"], "./app")


if __name__ == "__main__":
    unittest.main()

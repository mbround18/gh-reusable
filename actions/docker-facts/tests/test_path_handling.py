"""Tests for path resolution and Docker Compose file finding."""

import unittest
from unittest.mock import patch
import os
import sys

from tests.test_utils import setup_test_environment
import index


class TestPathHandling(unittest.TestCase):
    """Test cases for path resolution and Docker Compose file finding."""

    def setUp(self):
        self.env_patcher = setup_test_environment()
        self.env_patcher.start()

    def tearDown(self):
        self.env_patcher.stop()

    def test_resolve_path(self):
        """Test path resolution functionality."""
        self.assertEqual(index.resolve_path("./test"), "/workspace/test")
        self.assertEqual(index.resolve_path("/absolute/path"), "/absolute/path")
        self.assertEqual(index.resolve_path(""), "")
        self.assertEqual(
            index.resolve_path("relative/path"), "/workspace/relative/path"
        )
        self.assertEqual(
            index.resolve_path("./path/with/dots/../"), "/workspace/path/with"
        )

    @patch("os.path.exists")
    def test_find_docker_compose(self, mock_exists):
        """Test finding Docker Compose files."""
        # Test finding docker-compose.yml
        mock_exists.reset_mock()
        mock_exists.side_effect = lambda path: path == "/workspace/docker-compose.yml"
        self.assertEqual(index.find_docker_compose(), "/workspace/docker-compose.yml")

        # Test finding docker-compose.yaml
        mock_exists.reset_mock()
        mock_exists.side_effect = lambda path: path == "/workspace/docker-compose.yaml"
        self.assertEqual(index.find_docker_compose(), "/workspace/docker-compose.yaml")

        # Test finding compose.yml
        mock_exists.reset_mock()
        mock_exists.side_effect = lambda path: path == "/workspace/compose.yml"
        self.assertEqual(index.find_docker_compose(), "/workspace/compose.yml")

        # Test finding compose.yaml
        mock_exists.reset_mock()
        mock_exists.side_effect = lambda path: path == "/workspace/compose.yaml"
        self.assertEqual(index.find_docker_compose(), "/workspace/compose.yaml")

        # Test no compose file found
        mock_exists.reset_mock()
        mock_exists.side_effect = None
        mock_exists.return_value = False
        self.assertIsNone(index.find_docker_compose())


if __name__ == "__main__":
    unittest.main()

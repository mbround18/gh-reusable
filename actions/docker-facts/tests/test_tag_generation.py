#!/usr/bin/env python3
"""Tests for Docker tag generation"""

import os
import sys
import unittest
from unittest.mock import patch, MagicMock

# Add parent directory to path so we can import the module
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import index


class TestTagGeneration(unittest.TestCase):
    """Test cases for the Docker tag generation logic"""

    @patch("index.get_input_image")
    @patch("index.get_input_version")
    @patch("index.get_github_ref")
    @patch("index.get_input_with_latest")
    @patch("index.get_input_registries")
    @patch("index.get_input_target")
    @patch("index.get_input_prepend_target")
    def test_generate_tags_basic(
        self,
        mock_prepend_target,
        mock_target,
        mock_registries,
        mock_with_latest,
        mock_github_ref,
        mock_version,
        mock_image,
    ):
        """Test basic tag generation"""
        # Setup mocks
        mock_image.return_value = "test-image"
        mock_version.return_value = "1.0.0"
        mock_github_ref.return_value = "refs/heads/main"
        mock_with_latest.return_value = False
        mock_registries.return_value = ""
        mock_target.return_value = ""
        mock_prepend_target.return_value = False

        # Generate tags
        tags = index.generate_tags("1.0.0")

        # Should generate just the version tag
        self.assertEqual(tags, ["test-image:v1.0.0"])

    @patch("index.get_input_image")
    @patch("index.get_input_version")
    @patch("index.get_github_ref")
    @patch("index.get_input_with_latest")
    @patch("index.get_input_registries")
    @patch("index.get_input_target")
    @patch("index.get_input_prepend_target")
    def test_generate_tags_with_target(
        self,
        mock_prepend_target,
        mock_target,
        mock_registries,
        mock_with_latest,
        mock_github_ref,
        mock_version,
        mock_image,
    ):
        """Test tag generation with target"""
        # Setup mocks
        mock_image.return_value = "test-image"
        mock_version.return_value = "1.0.0"
        mock_github_ref.return_value = "refs/heads/main"
        mock_with_latest.return_value = False
        mock_registries.return_value = ""
        mock_target.return_value = "prod"
        mock_prepend_target.return_value = True

        # Generate tags
        tags = index.generate_tags("1.0.0", target="prod")

        # Should prepend target to version tag
        self.assertEqual(tags, ["test-image:prod-v1.0.0"])

    @patch("index.get_input_image")
    @patch("index.get_input_version")
    @patch("index.get_github_ref")
    @patch("index.get_input_with_latest")
    @patch("index.get_input_registries")
    @patch("index.get_input_target")
    @patch("index.get_input_prepend_target")
    def test_generate_tags_with_registry(
        self,
        mock_prepend_target,
        mock_target,
        mock_registries,
        mock_with_latest,
        mock_github_ref,
        mock_version,
        mock_image,
    ):
        """Test tag generation with registry"""
        # Setup mocks
        mock_image.return_value = "test-image"
        mock_version.return_value = "1.0.0"
        mock_github_ref.return_value = "refs/heads/main"
        mock_with_latest.return_value = False
        mock_registries.return_value = "docker.io,ghcr.io"
        mock_target.return_value = ""
        mock_prepend_target.return_value = False

        # Generate tags
        tags = index.generate_tags("1.0.0")

        # Should include registry-prefixed tags
        self.assertEqual(
            tags,
            [
                "test-image:v1.0.0",
                "docker.io/test-image:v1.0.0",
                "ghcr.io/test-image:v1.0.0",
            ],
        )

    @patch("index.get_input_image")
    @patch("index.get_input_version")
    @patch("index.get_github_ref")
    @patch("index.get_input_with_latest")
    @patch("index.get_input_registries")
    @patch("index.get_input_target")
    @patch("index.get_input_prepend_target")
    def test_generate_tags_with_latest(
        self,
        mock_prepend_target,
        mock_target,
        mock_registries,
        mock_with_latest,
        mock_github_ref,
        mock_version,
        mock_image,
    ):
        """Test tag generation with latest tag"""
        # Setup mocks
        mock_image.return_value = "test-image"
        mock_version.return_value = "1.0.0"
        mock_github_ref.return_value = "refs/tags/v1.0.0"  # Tagged release
        mock_with_latest.return_value = True
        mock_registries.return_value = ""
        mock_target.return_value = ""
        mock_prepend_target.return_value = False

        # Generate tags
        tags = index.generate_tags("1.0.0")

        # Should include latest tag
        self.assertEqual(tags, ["test-image:v1.0.0", "test-image:latest"])

    @patch("index.get_input_image")
    @patch("index.get_input_version")
    @patch("index.get_github_ref")
    @patch("index.get_input_with_latest")
    @patch("index.get_input_registries")
    @patch("index.get_input_target")
    @patch("index.get_input_prepend_target")
    def test_generate_tags_with_latest_and_target(
        self,
        mock_prepend_target,
        mock_target,
        mock_registries,
        mock_with_latest,
        mock_github_ref,
        mock_version,
        mock_image,
    ):
        """Test tag generation with latest tag and target"""
        # Setup mocks
        mock_image.return_value = "test-image"
        mock_version.return_value = "1.0.0"
        mock_github_ref.return_value = "refs/tags/v1.0.0"  # Tagged release
        mock_with_latest.return_value = True
        mock_registries.return_value = ""
        mock_target.return_value = "prod"
        mock_prepend_target.return_value = True

        # Generate tags
        tags = index.generate_tags("1.0.0", target="prod")

        # Should include target-prefixed latest tag
        self.assertEqual(tags, ["test-image:prod-v1.0.0", "test-image:prod-latest"])

    @patch("index.get_input_image")
    @patch("index.get_input_version")
    @patch("index.get_github_ref")
    @patch("index.get_input_with_latest")
    @patch("index.get_input_registries")
    @patch("index.get_input_target")
    @patch("index.get_input_prepend_target")
    def test_generate_tags_with_all_options(
        self,
        mock_prepend_target,
        mock_target,
        mock_registries,
        mock_with_latest,
        mock_github_ref,
        mock_version,
        mock_image,
    ):
        """Test tag generation with all options enabled"""
        # Setup mocks
        mock_image.return_value = "myorg/app"
        mock_version.return_value = "1.0.0"
        mock_github_ref.return_value = "refs/tags/v1.0.0"  # Tagged release
        mock_with_latest.return_value = True
        mock_registries.return_value = "docker.io,ghcr.io"
        mock_target.return_value = "alpine"
        mock_prepend_target.return_value = True

        # Generate tags with all options
        tags = index.generate_tags("1.0.0", target="alpine")

        # Should include all combinations
        expected_tags = [
            "myorg/app:alpine-v1.0.0",
            "docker.io/myorg/app:alpine-v1.0.0",
            "ghcr.io/myorg/app:alpine-v1.0.0",
            "myorg/app:alpine-latest",
            "docker.io/myorg/app:alpine-latest",
            "ghcr.io/myorg/app:alpine-latest",
        ]

        self.assertEqual(sorted(tags), sorted(expected_tags))


if __name__ == "__main__":
    unittest.main()

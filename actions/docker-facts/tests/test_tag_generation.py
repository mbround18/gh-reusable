"""Tests for Docker tag generation functionality."""

import unittest
from unittest.mock import patch

from tests.test_utils import setup_test_environment
import index


class TestTagGeneration(unittest.TestCase):
    """Test cases for Docker tag generation."""

    def setUp(self):
        self.env_patcher = setup_test_environment()
        self.env_patcher.start()

    def tearDown(self):
        self.env_patcher.stop()

    def test_generate_tags_basic(self):
        """Test basic tag generation."""
        tags = index.generate_tags("1.0.0")
        self.assertIn("test-image:v1.0.0", tags)
        self.assertEqual(len(tags), 1)

    def test_generate_tags_with_v_prefix(self):
        """Test tag generation with version already having v prefix."""
        tags = index.generate_tags("v1.0.0")
        self.assertIn("test-image:v1.0.0", tags)

    def test_generate_tags_with_registries(self):
        """Test tag generation with multiple registries."""
        with patch.dict("os.environ", {"INPUT_REGISTRIES": "docker.io,ghcr.io"}):
            tags = index.generate_tags("1.0.0")
            self.assertIn("test-image:v1.0.0", tags)
            self.assertIn("docker.io/test-image:v1.0.0", tags)
            self.assertIn("ghcr.io/test-image:v1.0.0", tags)
            self.assertEqual(len(tags), 3)

    def test_generate_tags_with_latest(self):
        """Test tag generation with latest tag."""
        with patch.dict(
            "os.environ",
            {"INPUT_WITH_LATEST": "true", "GITHUB_REF": "refs/tags/v1.0.0"},
        ):
            tags = index.generate_tags("1.0.0")
            self.assertIn("test-image:v1.0.0", tags)
            self.assertIn("test-image:latest", tags)

    def test_generate_tags_with_target(self):
        """Test tag generation with target prepending."""
        with patch.dict(
            "os.environ", {"INPUT_TARGET": "prod", "INPUT_PREPEND_TARGET": "true"}
        ):
            tags = index.generate_tags("1.0.0")
            self.assertIn("test-image:prod-v1.0.0", tags)

    def test_generate_tags_with_registry_in_name(self):
        """Test tag generation with registry already in the image name."""
        with patch.dict(
            "os.environ",
            {"INPUT_IMAGE": "ghcr.io/user/test-image", "INPUT_REGISTRIES": "docker.io"},
        ):
            tags = index.generate_tags("1.0.0")
            self.assertIn("ghcr.io/user/test-image:v1.0.0", tags)
            self.assertIn("docker.io/user/test-image:v1.0.0", tags)

    def test_generate_tags_with_complex_image_name(self):
        """Test tag generation with complex image names."""
        with patch.dict(
            "os.environ",
            {"INPUT_IMAGE": "org/repo/image", "INPUT_REGISTRIES": "ghcr.io,docker.io"},
        ):
            tags = index.generate_tags("1.0.0")
            self.assertIn("org/repo/image:v1.0.0", tags)
            self.assertIn("ghcr.io/org/repo/image:v1.0.0", tags)
            self.assertIn("docker.io/org/repo/image:v1.0.0", tags)

    def test_generate_tags_with_prerelease_versions(self):
        """Test tag generation with prerelease versions."""
        # Beta version should not get latest tag
        with patch.dict(
            "os.environ",
            {
                "INPUT_WITH_LATEST": "true",
                "GITHUB_REF": "refs/tags/v1.0.0-beta.1",
                "INPUT_VERSION": "1.0.0-beta.1",
            },
        ):
            tags = index.generate_tags("1.0.0-beta.1")
            self.assertIn("test-image:v1.0.0-beta.1", tags)
            self.assertNotIn("test-image:latest", tags)

    def test_generate_tags_with_all_options(self):
        """Test tag generation with all options combined."""
        with patch.dict(
            "os.environ",
            {
                "INPUT_IMAGE": "myorg/app",
                "INPUT_REGISTRIES": "docker.io,ghcr.io",
                "INPUT_TARGET": "alpine",
                "INPUT_PREPEND_TARGET": "true",
                "INPUT_WITH_LATEST": "true",
                "GITHUB_REF": "refs/tags/v1.0.0",
            },
        ):
            tags = index.generate_tags("1.0.0")
            self.assertIn("myorg/app:alpine-v1.0.0", tags)
            self.assertIn("myorg/app:alpine-latest", tags)
            self.assertIn("docker.io/myorg/app:alpine-v1.0.0", tags)
            self.assertIn("docker.io/myorg/app:alpine-latest", tags)
            self.assertIn("ghcr.io/myorg/app:alpine-v1.0.0", tags)
            self.assertIn("ghcr.io/myorg/app:alpine-latest", tags)

    def test_generate_tags_with_empty_image(self):
        """Test tag generation with empty image name."""
        with patch.dict("os.environ", {"INPUT_IMAGE": ""}):
            tags = index.generate_tags("1.0.0")
            self.assertIn("unnamed:v1.0.0", tags)


if __name__ == "__main__":
    unittest.main()

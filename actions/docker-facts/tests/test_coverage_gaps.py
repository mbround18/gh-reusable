#!/usr/bin/env python3
"""Tests specifically targeting coverage gaps in the Docker Facts Action"""

import os
import sys
import unittest
from unittest.mock import patch, mock_open, MagicMock

# Add parent directory to path so we can import the module
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import index


class TestCoverageGaps(unittest.TestCase):
    """Test cases targeting specific coverage gaps"""

    def test_github_default_branch_env(self):
        """Test get_github_default_branch function"""
        # Test with env var set
        with patch.dict("os.environ", {"GITHUB_DEFAULT_BRANCH": "master"}):
            self.assertEqual(index.get_github_default_branch(), "master")

        # Test with env var not set
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(index.get_github_default_branch(), "main")

    def test_github_head_ref_env(self):
        """Test get_github_head_ref function"""
        # Test with env var set
        with patch.dict("os.environ", {"GITHUB_HEAD_REF": "feature-branch"}):
            self.assertEqual(index.get_github_head_ref(), "feature-branch")

        # Test with env var not set
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(index.get_github_head_ref(), "")

    def test_github_base_ref_env(self):
        """Test get_github_base_ref function"""
        # Test with env var set
        with patch.dict("os.environ", {"GITHUB_BASE_REF": "main"}):
            self.assertEqual(index.get_github_base_ref(), "main")

        # Test with env var not set
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(index.get_github_base_ref(), "")

    def test_resolve_path_edge_cases(self):
        """Test edge cases in resolve_path function"""
        # Test empty path
        self.assertEqual(index.resolve_path(""), "")

        # Test with workspace not in path when converting to relative
        with patch("index.get_github_workspace") as mock_workspace:
            mock_workspace.return_value = "/workspace"

            # Path outside of workspace
            self.assertEqual(
                index.resolve_path("/outside/workspace", to_relative=True),
                "/outside/workspace",
            )

    def test_main_output_fallback(self):
        """Test main function's fallback when GITHUB_OUTPUT is not writable"""
        # Set up input mocks
        with patch.dict(
            "os.environ",
            {
                "INPUT_IMAGE": "test-image",
                "INPUT_VERSION": "1.0.0",
                "GITHUB_OUTPUT": "/nonexistent/directory/file",
            },
        ):
            # Mock all the function calls in main
            with patch("index.find_dockerfile", return_value="/workspace/Dockerfile"):
                with patch("index.find_docker_compose", return_value=None):
                    with patch(
                        "index.generate_tags", return_value=["test-image:v1.0.0"]
                    ):
                        with patch("index.should_push_image", return_value=False):
                            with patch("index.resolve_path") as mock_resolve:
                                mock_resolve.side_effect = (
                                    lambda path, to_relative=False: path
                                )

                                # Mock stdout to capture output
                                with patch("sys.stdout") as mock_stdout:
                                    # Run the main function
                                    index.main()

                                    # Verify the fallback was used
                                    mock_stdout.write.assert_called()


if __name__ == "__main__":
    unittest.main()

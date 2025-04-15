"""Tests for push decision logic."""

import unittest
from unittest.mock import patch

from tests.test_utils import setup_test_environment
import index


class TestPushDecision(unittest.TestCase):
    """Test cases for push decision logic."""

    def setUp(self):
        self.env_patcher = setup_test_environment()
        self.env_patcher.start()

    def tearDown(self):
        self.env_patcher.stop()

    def test_should_push_on_default_branch(self):
        """Test push on default branch."""
        # Test exact match
        with patch.dict("os.environ", {"GITHUB_REF": "refs/heads/main"}):
            self.assertTrue(index.should_push_image())

        # Test branch with main prefix
        with patch.dict("os.environ", {"GITHUB_REF": "refs/heads/main-feature"}):
            self.assertFalse(index.should_push_image())

        # Test with different default branch
        with patch.dict(
            "os.environ",
            {"GITHUB_REF": "refs/heads/master", "GITHUB_DEFAULT_BRANCH": "master"},
        ):
            self.assertTrue(index.should_push_image())

    def test_should_push_on_tags(self):
        """Test push on tags."""
        with patch.dict("os.environ", {"GITHUB_REF": "refs/tags/v1.0.0"}):
            self.assertTrue(index.should_push_image())

        with patch.dict("os.environ", {"GITHUB_REF": "refs/tags/beta"}):
            self.assertTrue(index.should_push_image())

    def test_should_push_on_force(self):
        """Test force push option."""
        with patch.dict(
            "os.environ",
            {"GITHUB_REF": "refs/heads/feature", "INPUT_FORCE_PUSH": "true"},
        ):
            self.assertTrue(index.should_push_image())

    def test_should_push_on_canary(self):
        """Test canary label in PR."""
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

    def test_should_not_push_by_default(self):
        """Test no push on non-default branch."""
        with patch.dict("os.environ", {"GITHUB_REF": "refs/heads/feature"}):
            self.assertFalse(index.should_push_image())

    def test_should_push_with_custom_canary_label(self):
        """Test custom canary label."""
        event_data = {"pull_request": {"labels": [{"name": "preview"}]}}

        with (
            patch("index.load_event_data", return_value=event_data),
            patch.dict(
                "os.environ",
                {
                    "GITHUB_EVENT_NAME": "pull_request",
                    "GITHUB_REF": "refs/pull/123/merge",
                    "INPUT_CANARY_LABEL": "preview",
                },
            ),
        ):
            self.assertTrue(index.should_push_image())

    def test_should_not_push_on_pr_without_canary(self):
        """Test no push on PR without canary label."""
        event_data = {"pull_request": {"labels": [{"name": "enhancement"}]}}

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
            self.assertFalse(index.should_push_image())

    def test_should_not_push_on_pr_with_no_labels(self):
        """Test no push on PR with no labels."""
        event_data = {"pull_request": {"labels": []}}

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
            self.assertFalse(index.should_push_image())


if __name__ == "__main__":
    unittest.main()

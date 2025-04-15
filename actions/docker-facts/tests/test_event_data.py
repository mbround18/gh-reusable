"""Tests for GitHub event data loading."""

import unittest
from unittest.mock import patch, mock_open
import json

from tests.test_utils import setup_test_environment
import index


class TestEventData(unittest.TestCase):
    """Test cases for GitHub event data loading."""

    def setUp(self):
        self.env_patcher = setup_test_environment()
        self.env_patcher.start()

    def tearDown(self):
        self.env_patcher.stop()

    def test_load_event_data_success(self):
        """Test successful loading of event data."""
        event_data = {"event": "push", "ref": "refs/heads/main"}

        with (
            patch("os.path.exists", return_value=True),
            patch("builtins.open", mock_open(read_data=json.dumps(event_data))),
            patch.dict("os.environ", {"GITHUB_EVENT_PATH": "/path/to/event.json"}),
        ):
            result = index.load_event_data()
            self.assertEqual(result, event_data)

    def test_load_event_data_file_not_found(self):
        """Test handling of missing event data file."""
        with (
            patch("os.path.exists", return_value=False),
            patch.dict("os.environ", {"GITHUB_EVENT_PATH": "/path/to/missing.json"}),
        ):
            result = index.load_event_data()
            self.assertEqual(result, {})

    def test_load_event_data_invalid_json(self):
        """Test handling of invalid JSON in event data file."""
        with (
            patch("os.path.exists", return_value=True),
            patch("builtins.open", mock_open(read_data="invalid json")),
            patch.dict("os.environ", {"GITHUB_EVENT_PATH": "/path/to/invalid.json"}),
        ):
            result = index.load_event_data()
            self.assertEqual(result, {})

    def test_load_event_data_no_path(self):
        """Test handling of missing event path environment variable."""
        with patch.dict("os.environ", {"GITHUB_EVENT_PATH": ""}):
            result = index.load_event_data()
            self.assertEqual(result, {})

    def test_load_event_data_permission_error(self):
        """Test handling of permission errors."""
        with (
            patch("os.path.exists", return_value=True),
            patch("builtins.open", mock_open()) as mock_file,
            patch.dict("os.environ", {"GITHUB_EVENT_PATH": "/path/to/event.json"}),
        ):
            mock_file.side_effect = PermissionError("Permission denied")
            result = index.load_event_data()
            self.assertEqual(result, {})

    def test_load_event_data_large_file(self):
        """Test handling of large event data files."""
        # Create a large but valid JSON object
        large_data = {
            "event": "push",
            "repo": "test-repo",
            "items": [f"item-{i}" for i in range(1000)],
        }

        with (
            patch("os.path.exists", return_value=True),
            patch("builtins.open", mock_open(read_data=json.dumps(large_data))),
            patch.dict("os.environ", {"GITHUB_EVENT_PATH": "/path/to/large.json"}),
        ):
            result = index.load_event_data()
            self.assertEqual(result["event"], "push")
            self.assertEqual(result["repo"], "test-repo")
            self.assertEqual(len(result["items"]), 1000)


if __name__ == "__main__":
    unittest.main()

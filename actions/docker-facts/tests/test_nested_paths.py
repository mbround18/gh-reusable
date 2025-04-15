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
    
    @patch('index.find_docker_compose')
    @patch('index.parse_docker_compose')
    def test_nested_context_resolution(self, mock_parse_compose, mock_find_compose):
        """Test resolution of nested context paths from Docker Compose."""
        # Setup mocks
        mock_find_compose.return_value = '/workspace/docker-compose.yml'
        mock_parse_compose.return_value = {
            'dockerfile': 'Dockerfile.prod',
            'context': './app',
            'target': 'production',
            'build_args': {}
        }
        
        # Create a temp file for GITHUB_OUTPUT
        with tempfile.NamedTemporaryFile() as temp_file:
            with patch.dict('os.environ', {
                'GITHUB_OUTPUT': temp_file.name,
                'INPUT_IMAGE': 'test-image',
                'INPUT_VERSION': '1.0.0',
                'INPUT_CONTEXT': './docker'  # Nested context
            }):
                index.main()
                
                # Read the output file
                temp_file.seek(0)
                output_content = temp_file.read().decode('utf-8')
                
                # Should resolve to '/workspace/docker/app'
                expected_context = os.path.normpath('/workspace/docker/app')
                self.assertIn(f'context={expected_context}', output_content)
                
                # Dockerfile should be resolved relative to context
                expected_dockerfile = os.path.normpath('/workspace/docker/app/Dockerfile.prod')
                self.assertIn(f'dockerfile={expected_dockerfile}', output_content)
    
    @patch('index.find_docker_compose')
    @patch('index.parse_docker_compose')
    def test_dockerfile_without_context(self, mock_parse_compose, mock_find_compose):
        """Test resolution of dockerfile without context in Docker Compose."""
        # Setup mocks
        mock_find_compose.return_value = '/workspace/docker-compose.yml'
        mock_parse_compose.return_value = {
            'dockerfile': 'Dockerfile.special',
            'context': None,
            'target': None,
            'build_args': {}
        }
        
        # Create a temp file for GITHUB_OUTPUT
        with tempfile.NamedTemporaryFile() as temp_file:
            with patch.dict('os.environ', {
                'GITHUB_OUTPUT': temp_file.name,
                'INPUT_IMAGE': 'test-image',
                'INPUT_VERSION': '1.0.0',
                'INPUT_CONTEXT': './docker'  # Nested context
            }):
                index.main()
                
                # Read the output file
                temp_file.seek(0)
                output_content = temp_file.read().decode('utf-8')
                
                # Context should be input context
                expected_context = os.path.normpath('/workspace/docker')
                self.assertIn(f'context={expected_context}', output_content)
                
                # Dockerfile should be resolved relative to input context
                expected_dockerfile = os.path.normpath('/workspace/docker/Dockerfile.special')
                self.assertIn(f'dockerfile={expected_dockerfile}', output_content)
    
    @patch('index.find_docker_compose')
    @patch('index.parse_docker_compose')
    def test_context_only(self, mock_parse_compose, mock_find_compose):
        """Test resolution of context only in Docker Compose."""
        # Setup mocks
        mock_find_compose.return_value = '/workspace/docker-compose.yml'
        mock_parse_compose.return_value = {
            'dockerfile': None,
            'context': './web',
            'target': None,
            'build_args': {}
        }
        
        # Create a temp file for GITHUB_OUTPUT
        with tempfile.NamedTemporaryFile() as temp_file:
            with patch.dict('os.environ', {
                'GITHUB_OUTPUT': temp_file.name,
                'INPUT_IMAGE': 'test-image',
                'INPUT_VERSION': '1.0.0',
                'INPUT_CONTEXT': './docker',  # Nested context
                'INPUT_DOCKERFILE': 'Dockerfile.default'  # Custom default
            }):
                index.main()
                
                # Read the output file
                temp_file.seek(0)
                output_content = temp_file.read().decode('utf-8')
                
                # Context should be input context + compose context
                expected_context = os.path.normpath('/workspace/docker/web')
                self.assertIn(f'context={expected_context}', output_content)
                
                # Dockerfile should be from input, but not resolved within the composed context
                expected_dockerfile = os.path.normpath('/workspace/Dockerfile.default')
                self.assertIn(f'dockerfile={expected_dockerfile}', output_content)
    
    @patch('index.find_docker_compose')
    @patch('index.parse_docker_compose')
    def test_absolute_paths(self, mock_parse_compose, mock_find_compose):
        """Test resolution with absolute paths in Docker Compose."""
        # Setup mocks
        mock_find_compose.return_value = '/workspace/docker-compose.yml'
        mock_parse_compose.return_value = {
            'dockerfile': '/absolute/path/Dockerfile',
            'context': '/absolute/path/context',
            'target': None,
            'build_args': {}
        }
        
        # Create a temp file for GITHUB_OUTPUT
        with tempfile.NamedTemporaryFile() as temp_file:
            with patch.dict('os.environ', {
                'GITHUB_OUTPUT': temp_file.name,
                'INPUT_IMAGE': 'test-image',
                'INPUT_VERSION': '1.0.0',
                'INPUT_CONTEXT': './docker'  # Should be ignored for absolute paths
            }):
                index.main()
                
                # Read the output file
                temp_file.seek(0)
                output_content = temp_file.read().decode('utf-8')
                
                # Absolute paths should be preserved
                self.assertIn('context=/absolute/path/context', output_content)
                self.assertIn('dockerfile=/absolute/path/Dockerfile', output_content)


if __name__ == '__main__':
    unittest.main()
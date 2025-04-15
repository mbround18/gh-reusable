#!/usr/bin/env python3
"""
Docker Facts Action

This script extracts Dockerfile paths, context directories, and build arguments
from docker-compose.yml files or falls back to provided defaults.
"""

import os
import sys
import json
import yaml
import logging
from typing import Dict, List, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger("docker-facts")


# Functions to get environment variables dynamically
def get_github_workspace() -> str:
    return os.environ.get("GITHUB_WORKSPACE", ".")


def get_github_event_name() -> str:
    return os.environ.get("GITHUB_EVENT_NAME", "")


def get_github_ref() -> str:
    return os.environ.get("GITHUB_REF", "")


def get_github_head_ref() -> str:
    return os.environ.get("GITHUB_HEAD_REF", "")


def get_github_base_ref() -> str:
    return os.environ.get("GITHUB_BASE_REF", "")


def get_github_repository() -> str:
    return os.environ.get("GITHUB_REPOSITORY", "")


def get_github_event_path() -> str:
    return os.environ.get("GITHUB_EVENT_PATH", "")


def get_github_output() -> str:
    return os.environ.get("GITHUB_OUTPUT", "")


def get_github_default_branch() -> str:
    return os.environ.get("GITHUB_DEFAULT_BRANCH", "main")


def get_input_image() -> str:
    return os.environ.get("INPUT_IMAGE", "")


def get_input_version() -> str:
    return os.environ.get("INPUT_VERSION", "")


def get_input_registries() -> str:
    return os.environ.get("INPUT_REGISTRIES", "")


def get_input_dockerfile() -> str:
    return os.environ.get("INPUT_DOCKERFILE", "./Dockerfile")


def get_input_context() -> str:
    return os.environ.get("INPUT_CONTEXT", ".")


def get_input_canary_label() -> str:
    return os.environ.get("INPUT_CANARY_LABEL", "canary")


def get_input_force_push() -> bool:
    return os.environ.get("INPUT_FORCE_PUSH", "false").lower() == "true"


def get_input_with_latest() -> bool:
    return os.environ.get("INPUT_WITH_LATEST", "false").lower() == "true"


def get_input_target() -> str:
    return os.environ.get("INPUT_TARGET", "")


def get_input_prepend_target() -> bool:
    return os.environ.get("INPUT_PREPEND_TARGET", "false").lower() == "true"


def load_event_data() -> Dict:
    """Load GitHub event data from GITHUB_EVENT_PATH"""
    event_data = {}
    event_path = get_github_event_path()
    if event_path and os.path.exists(event_path):
        try:
            with open(event_path, "r") as f:
                event_data = json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load event data: {e}")
    return event_data


def resolve_path(path: str, to_relative: bool = False) -> str:
    """
    Resolve a path relative to the GitHub workspace.

    Args:
        path: The path to resolve
        to_relative: If True, convert absolute paths to workspace-relative paths

    Returns:
        Resolved path, either absolute or relative to workspace
    """
    if not path:
        return ""

    workspace = get_github_workspace()

    if to_relative:
        # Convert absolute path to workspace-relative path
        if path.startswith(workspace):
            rel_path = os.path.relpath(path, workspace)
            return "./" + rel_path if not rel_path.startswith(".") else rel_path
        return path
    else:
        # Convert relative path to absolute path
        if os.path.isabs(path):
            return path
        # Join with workspace and normalize to handle .. notation
        return os.path.normpath(os.path.join(workspace, path.lstrip("./")))


def find_dockerfile(dockerfile_path: str, context_path: str) -> str:
    """
    Find Dockerfile by checking multiple possible locations.

    Args:
        dockerfile_path: User-provided Dockerfile path
        context_path: Build context path

    Returns:
        Resolved Dockerfile path that exists, or the original path if none found
    """
    # Resolve the absolute paths
    abs_dockerfile = resolve_path(dockerfile_path)
    abs_context = resolve_path(context_path)

    # Try these locations in order:
    # 1. As provided by the user (absolute path)
    # 2. Relative to the workspace (as provided)
    # 3. Relative to the context
    # 4. Just the filename in the context

    possible_paths = [
        abs_dockerfile,
        # If it's a simple filename like "Dockerfile", try it in the context
        os.path.join(abs_context, os.path.basename(dockerfile_path)),
        # If dockerfile path has directories, try appending to context
        os.path.join(abs_context, dockerfile_path.lstrip("./")),
    ]

    # Remove duplicates while preserving order
    unique_paths = []
    for path in possible_paths:
        if path not in unique_paths:
            unique_paths.append(path)

    # Check each path
    for path in unique_paths:
        if os.path.exists(path):
            logger.info(f"Found Dockerfile at: {path}")
            return path

    # If no file found, return the original path for consistency
    logger.warning(
        f"Could not find Dockerfile at any expected location, using: {abs_dockerfile}"
    )
    return abs_dockerfile


def find_docker_compose(context_path: str = None) -> Optional[str]:
    """
    Find docker-compose.yml in the repository
    
    Args:
        context_path: Optional context directory to also search in
        
    Returns:
        Path to the found docker-compose file or None
    """
    compose_paths = [
        "docker-compose.yml",
        "docker-compose.yaml",
        "compose.yml",
        "compose.yaml",
    ]

    workspace = get_github_workspace()
    
    # Search in workspace first for each file
    for path in compose_paths:
        full_path = os.path.join(workspace, path)
        if os.path.exists(full_path):
            logger.info(f"Found Docker Compose file in workspace: {full_path}")
            return full_path
    
    # If not found in workspace and context path is provided and different from workspace, 
    # search there
    if context_path and context_path not in [".", "./"]:
        abs_context = resolve_path(context_path)
        if abs_context != workspace:
            for path in compose_paths:
                full_path = os.path.join(abs_context, path)
                if os.path.exists(full_path):
                    logger.info(f"Found Docker Compose file in context: {full_path}")
                    return full_path

    logger.info("No Docker Compose file found")
    return None


def parse_docker_compose(file_path: str, image_name: str) -> Dict:
    """
    Parse docker-compose.yml and find the service that matches the given image name.

    Returns a dictionary with dockerfile, context, and build_args.
    """
    result = {
        "dockerfile": None,
        "context": None,
        "build_args": {},
        "target": None,
    }

    try:
        with open(file_path, "r") as file:
            compose_data = yaml.safe_load(file)

        if not compose_data or "services" not in compose_data:
            logger.warning(f"No services found in {file_path}")
            return result

        for service_name, service_data in compose_data["services"].items():
            # Check if this service matches our target image
            if "image" in service_data and service_data["image"].startswith(
                f"{image_name}:"
            ):
                logger.info(f"Found matching service: {service_name}")

                if "build" in service_data:
                    build_data = service_data["build"]

                    # Handle string format (just context)
                    if isinstance(build_data, str):
                        result["context"] = build_data
                    # Handle dictionary format
                    elif isinstance(build_data, dict):
                        result["dockerfile"] = build_data.get("dockerfile")
                        result["context"] = build_data.get("context")
                        result["target"] = build_data.get("target")

                        # Extract build args
                        if "args" in build_data:
                            args = build_data["args"]
                            # Handle both dictionary and list formats for args
                            if isinstance(args, dict):
                                result["build_args"] = args
                            elif isinstance(args, list):
                                result["build_args"] = {
                                    arg.split("=")[0]: arg.split("=")[1]
                                    for arg in args
                                    if "=" in arg
                                }

                # Found a match, no need to continue
                break

    except Exception as e:
        logger.error(f"Error parsing Docker Compose file: {e}")

    return result


def should_push_image() -> bool:
    """Determine if the image should be pushed based on GitHub context"""
    event_data = load_event_data()

    # Always push if force_push is set
    if get_input_force_push():
        logger.info("Force push enabled")
        return True

    github_ref = get_github_ref()
    default_branch = get_github_default_branch()

    # Push on default branch - exact match only
    if github_ref == f"refs/heads/{default_branch}":
        logger.info("Push enabled: on default branch")
        return True

    # Push on tags
    if github_ref.startswith("refs/tags/"):
        logger.info("Push enabled: tagged release")
        return True

    # Check for canary label in PR
    if get_github_event_name() == "pull_request":
        pr_data = event_data.get("pull_request", {})
        labels = [label.get("name", "") for label in pr_data.get("labels", [])]

        if get_input_canary_label() in labels:
            logger.info(f"Push enabled: found '{get_input_canary_label()}' label in PR")
            return True

    logger.info("Push disabled: conditions not met")
    return False


def generate_tags(version: str, registries: List[str] = None) -> List[str]:
    """
    Generate Docker tags based on the version and registries

    Args:
        version: The version string
        registries: List of registry prefixes

    Returns:
        List of complete tag strings
    """
    if not registries:
        registries = []

    input_registries = get_input_registries()
    if not registries and input_registries:
        registries = [r.strip() for r in input_registries.split(",") if r.strip()]

    # Dynamically read the image name
    base_img = get_input_image()
    if not base_img:
        base_img = "unnamed"

    tags = []

    # Handle target prepending if enabled
    target_prefix = ""
    input_target = get_input_target()
    if input_target and get_input_prepend_target():
        target_prefix = f"{input_target}-"
    elif get_input_prepend_target() and not input_target:
        logger.warning(
            "Target prepending enabled but no target provided. Skipping target prefix."
        )

    # Main version tag
    version_tag = (
        f"{target_prefix}v{version}"
        if not version.startswith("v")
        else f"{target_prefix}{version}"
    )

    # Add the version tag
    tags.append(f"{base_img}:{version_tag}")

    # Check if we should include a 'latest' tag
    github_ref = get_github_ref()
    is_release_version = github_ref.startswith("refs/tags/") and not any(
        x in version for x in ["alpha", "beta", "rc", "dev"]
    )

    if get_input_with_latest() and is_release_version:
        # If prepending target, also add it to latest tag
        if target_prefix:
            tags.append(f"{base_img}:{target_prefix}latest")
        else:
            tags.append(f"{base_img}:latest")

    # Generate registry-prefixed tags
    all_tags = []
    for tag in tags:
        all_tags.append(tag)  # Add the non-prefixed tag
        for registry in registries:
            # Extract the image name without existing registry
            if "/" in base_img:
                img_parts = base_img.split("/")
                # Check if first part might be a registry
                if "." in img_parts[0] or img_parts[0] in [
                    "localhost",
                    "ghcr",
                    "docker",
                ]:
                    # It's likely a registry, so take everything after it
                    img_without_registry = "/".join(img_parts[1:])
                else:
                    # No registry in the image name
                    img_without_registry = base_img
            else:
                img_without_registry = base_img

            registry_tag = f"{registry}/{img_without_registry}:{tag.split(':')[1]}"
            all_tags.append(registry_tag)

    return all_tags


def main():
    """Main function to process Docker facts and set outputs"""
    # Validate required inputs
    if not get_input_image():
        logger.error("Required input 'image' not provided")
        sys.exit(1)

    if not get_input_version():
        logger.error("Required input 'version' not provided")
        sys.exit(1)

    # Get input context and dockerfile paths
    input_context = get_input_context()
    input_dockerfile = get_input_dockerfile()

    # Initialize result with defaults - initially use absolute paths for processing
    result = {
        "context": resolve_path(input_context),
        "target": get_input_target(),
        "push": should_push_image(),
    }
    
    # First resolve the dockerfile path with our more robust finder
    result["dockerfile"] = find_dockerfile(input_dockerfile, input_context)

    # Find and parse docker-compose file - now passing the context path
    compose_file = find_docker_compose(input_context)
    if compose_file:
        compose_data = parse_docker_compose(compose_file, get_input_image())

        # Override defaults with compose values if available
        if compose_data["dockerfile"]:
            # If docker-compose specifies a dockerfile, resolve it relative to the context
            if compose_data["context"]:
                # Resolve the compose context path
                compose_context = os.path.join(input_context, compose_data["context"])
                result["context"] = resolve_path(compose_context)
                # Resolve dockerfile relative to the compose context
                dockerfile_path = os.path.join(
                    compose_context, compose_data["dockerfile"]
                )
                result["dockerfile"] = find_dockerfile(dockerfile_path, result["context"])
            else:
                # No context in compose, just resolve dockerfile relative to input context
                dockerfile_path = os.path.join(
                    input_context, compose_data["dockerfile"]
                )
                result["dockerfile"] = find_dockerfile(dockerfile_path, result["context"])
        elif compose_data["context"]:
            # Only context specified in compose, resolve it relative to input context
            compose_context = os.path.join(input_context, compose_data["context"])
            result["context"] = resolve_path(compose_context)
            # Re-check dockerfile against new context
            result["dockerfile"] = find_dockerfile(input_dockerfile, result["context"])

        if compose_data["target"] and not get_input_target():
            result["target"] = compose_data["target"]

        # Set build args as environment variables
        for name, value in compose_data["build_args"].items():
            env_var_name = f"BUILD_ARG_{name.upper()}"
            os.environ[env_var_name] = str(value)
            logger.info(f"Setting build arg: {env_var_name}={value}")

    # Generate tags
    tags = generate_tags(get_input_version())
    result["tags"] = ",".join(tags)

    # Convert paths to relative format before output
    result["dockerfile"] = resolve_path(result["dockerfile"], to_relative=True)
    result["context"] = resolve_path(result["context"], to_relative=True)

    # Log results
    logger.info(f"Dockerfile: {result['dockerfile']}")
    logger.info(f"Context: {result['context']}")
    logger.info(f"Target: {result['target']}")
    logger.info(f"Should push: {result['push']}")
    logger.info(f"Tags: {result['tags']}")

    # Set GitHub outputs
    github_output = get_github_output()
    if github_output and os.path.exists(os.path.dirname(github_output)):
        with open(github_output, "a") as f:
            for key, value in result.items():
                if isinstance(value, bool):
                    value = str(value).lower()
                f.write(f"{key}={value}\n")
    else:
        # For local testing, print to stdout
        for key, value in result.items():
            print(f"::set-output name={key}::{value}")


if __name__ == "__main__":
    main()

# Docker Facts Architecture

## Overview

The Docker Facts Action is a GitHub tool designed to simplify Docker image building workflows. By automatically extracting and generating critical build metadata, this action streamlines the process of creating Docker images. It works by processing both version input data and context information from the file system, including Docker Compose configurations, to generate a comprehensive metadata package for the downstream docker-build step.

## Core Functionality

The action accomplishes several key tasks:

- **Docker Context Resolution:**  
  It discovers the locations of Dockerfiles and build contexts. This includes scanning for Docker Compose files to extract additional build configurations, such as service-specific context, Dockerfile paths, and build targets.
- **Intelligent Tag Generation:**  
  Based on provided version inputs—which can adhere to standard semantic versioning, include pre-release or date-based formats, or even branch/commit identifiers—the action produces consistent Docker image tags. These tags are generated to work with multiple container registries, ensuring consistency across deployment targets.
- **GitHub Context Integration:**  
  The action evaluates the GitHub environment (for example, branch names and pull request status) to influence decisions like whether to push images after a successful build.

- **Composite Metadata Generation:**  
  Finally, the action combines the discovered Docker context (from both direct inputs and Docker Compose files) with the version-based tag information. This integrated metadata—including resolved absolute paths, build targets, and cascading registry tags—is then passed on to the docker-build step.

## Combined Logic Walkthrough

1. **Processing Input and Discovering Context:**  
   When the action is triggered, it first reads the inputs from the GitHub workflow. It determines the image name, version string, and any provided paths. If a Docker Compose file is present within the specified directory, the action parses this file to extract service build configurations such as context directories, Dockerfile locations, and optional build targets. This means that users can rely on a single source of truth by managing their build configuration in a compose file. If the compose file is absent, the action falls back to the direct inputs provided for the Dockerfile and its context.

2. **Resolving File Paths:**  
   Once the build context is identified, the action resolves these paths relative to a base directory (typically the repository root). This step guarantees that even if the Dockerfile or context is specified with a relative path, the action calculates the proper absolute locations to be used later in the build process.

3. **Tag Generation without Reimplementing SemVer:**  
   The action receives a version input that might already conform to a standard (such as semantic versioning) or could be another meaningful identifier (date-based, branch name, or commit SHA). It then uses this version to generate the primary tag and cascading variants. For instance, a fully qualified semantic version might result in multiple simplified tags (for major, minor, and patch levels) that can be used flexibly in deployment scenarios. While the detailed semantics of versioning are externally provided, the action integrates this information by ensuring that all resulting tags meet registry naming standards and are correctly cascaded across the configured registries.

4. **Incorporating GitHub Context:**  
   The action analyzes the current GitHub context—identifying whether it is running on the default branch, a pull request, or under another reference. This information is used both to influence the tag variants (if needed) and to determine if the image should ultimately be pushed to the configured registries.

5. **Final Composite Output:**  
   The key outcome of the process is a composite metadata object that bundles together:

   - The **Dockerfile path** and resolved **build context**, including any adjustments made after parsing a Docker Compose file.
   - The **build target** and any additional build arguments, whether specified directly or derived from the compose file.
   - A complete set of **Docker image tags** generated from the version input, and appropriately cascaded for multiple registries.
   - GitHub context data that helps downstream steps decide on image pushing or other actions.

   By assembling these pieces, the action creates a robust and error-resilient metadata package. This package allows the subsequent docker-build action to operate seamlessly, knowing that every required detail—from file paths to tagging conventions—is correctly set up.

## Design Considerations and Goals

- **Separation of Concerns:**  
  Rather than replicating full semantic versioning logic, the action integrates externally provided version data with file system context. This separation ensures that each component focuses on its core task.
- **Flexibility:**  
  The approach supports various version formats and build configurations. Whether using a traditional Dockerfile, leveraging a docker-compose file, or handling alternative version formats, the action adapts and provides consistent output.
- **Error Resilience and Logging:**  
  Throughout the process, defensive programming techniques are employed. The action validates inputs, resolves paths carefully, and logs any issues or potential misconfigurations. This focus on resilience minimizes the chance of build failures due to unexpected inputs or missing files.
- **Multi-registry and CI/CD Integration:**  
  With an eye toward modern workflows, the action prepares all necessary metadata for use in CI/CD pipelines. By automatically handling cascading tags and ensuring absolute path resolution, it empowers continuous integration steps to build and push Docker images with confidence.

## Conclusion

The Docker Facts Action simplifies the Docker build process by automating the assembly of essential metadata. It effectively combines Docker context resolution, intelligent tag generation, and GitHub environment awareness to produce a single, comprehensive output for the docker-build action. This consolidation not only reduces manual errors but also streamlines the entire build workflow, ensuring consistent and reliable image creation across multiple deployment targets.

---

You can now save the above content as a markdown file for easy reference or download.

---

### Relevant Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Docker Tagging Guidelines](https://docs.docker.com/engine/reference/commandline/tag/)
- [Semantic Versioning Specification](https://semver.org)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

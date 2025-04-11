const core = require("@actions/core");

/**
 * Validate and normalize Docker image tags
 * @param {string[]} tags - Array of Docker image tags
 * @returns {string[]} Array of validated Docker image tags
 */
function validateTags(tags) {
  return tags.map((tag) => {
    // Check for malformed tags (with multiple colons)
    const parts = tag.split(":");
    if (parts.length > 2) {
      core.warning(`Found malformed tag: ${tag}, fixing format`);
      return `${parts[0]}:${parts[1]}`;
    }
    return tag;
  });
}

module.exports = validateTags;

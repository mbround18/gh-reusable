"use strict";
const core = require("@actions/core");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const core__namespace = /* @__PURE__ */ _interopNamespaceDefault(core);
async function run() {
  try {
    const expectedRepository = core__namespace.getInput("repository", { required: true });
    const actualRepository = process.env.GITHUB_REPOSITORY ?? "";
    if (!actualRepository) {
      core__namespace.setFailed(
        "GITHUB_REPOSITORY environment variable is not set. This action must run inside a GitHub Actions workflow."
      );
      return;
    }
    if (actualRepository !== expectedRepository) {
      core__namespace.setFailed(
        `Repository mismatch: expected "${expectedRepository}" but this workflow is running in "${actualRepository}". This action is restricted to specific repositories.`
      );
      return;
    }
    core__namespace.info(`Repository check passed: "${actualRepository}" matches the expected repository.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core__namespace.setFailed(message);
  }
}
void run();
//# sourceMappingURL=index.js.map

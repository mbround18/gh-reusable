const getInput = (n) =>
  (process.env[`INPUT_${n.toUpperCase().replace(/-/g, "_")}`] ?? "").trim();
const setFailed = (msg) => {
  console.error(`::error::${msg}`);
  process.exit(1);
};

const expected = getInput("repository");
const actual = process.env.GITHUB_REPOSITORY ?? "";

if (!actual) {
  setFailed(
    "GITHUB_REPOSITORY environment variable is not set. This action must run inside a GitHub Actions workflow.",
  );
} else if (actual !== expected) {
  setFailed(
    `Repository mismatch: expected "${expected}" but this workflow is running in "${actual}". This action is restricted to specific repositories.`,
  );
} else {
  console.log(
    `Repository check passed: "${actual}" matches the expected repository.`,
  );
}

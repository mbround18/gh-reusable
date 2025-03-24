const core = require("@actions/core");
const fs = require("fs");

async function run() {
  try {
    let queryInput = core.getInput("query", { required: true });
    const argsInput = core.getInput("args");
    const token = core.getInput("token", { required: true });
    const url = core.getInput("url") || "https://api.github.com/graphql";

    // If the provided query is a path to a file, read its content.
    if (fs.existsSync(queryInput)) {
      queryInput = fs.readFileSync(queryInput, "utf8");
    }

    // Parse the args input into an object of variables.
    const variables = {};
    if (argsInput) {
      // Split by comma or newline and filter out any empty strings.
      const pairs = argsInput
        .split(/[\n,]+/)
        .map((pair) => pair.trim())
        .filter((pair) => pair);
      pairs.forEach((pair) => {
        const [key, value] = pair.split("=").map((s) => s.trim());
        if (key && value !== undefined) {
          variables[key] = value;
        }
      });
    }

    const payload = {
      query: queryInput,
      variables: variables,
    };

    // Use the built-in fetch API (available in Node 18+)
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    // Set the JSON response as the action output.
    core.setOutput("result", JSON.stringify(data));
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();

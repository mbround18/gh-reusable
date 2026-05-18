import { existsSync, readFileSync, appendFileSync } from "node:fs";

const getInput = (n) =>
  (process.env[`INPUT_${n.toUpperCase().replace(/-/g, "_")}`] ?? "").trim();
const setOutput = (n, v) =>
  appendFileSync(process.env.GITHUB_OUTPUT, `${n}=${v}\n`);
const setFailed = (msg) => {
  console.error(`::error::${msg}`);
  process.exit(1);
};
const info = (msg) => console.log(msg);

async function run() {
  try {
    let query = getInput("query");
    if (!query) throw new Error('Input "query" is required.');
    const argsInput = getInput("args");
    const token = getInput("token");
    if (!token) throw new Error('Input "token" is required.');
    const url = getInput("url") || "https://api.github.com/graphql";

    if (existsSync(query)) {
      query = readFileSync(query, "utf8");
      info("Query loaded from file.");
    }

    const variables = {};
    if (argsInput) {
      for (const pair of argsInput
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)) {
        const eqIdx = pair.indexOf("=");
        if (eqIdx > 0) {
          const key = pair.slice(0, eqIdx).trim();
          const val = pair.slice(eqIdx + 1).trim();
          variables[key] = val;
        }
      }
    }

    info(`URL: ${url}`);
    info(`Variables: ${JSON.stringify(variables)}`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    const data = await response.json();
    info(`Response: ${JSON.stringify(data, null, 2)}`);

    setOutput("result", JSON.stringify(data));
  } catch (err) {
    setFailed(err instanceof Error ? err.message : String(err));
  }
}

run();

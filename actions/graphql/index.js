const core = require("@actions/core");
const fs = require("fs");
const { parse } = require("graphql");

function getNamedType(typeNode) {
  if (typeNode.kind === "NamedType") {
    return typeNode.name.value;
  } else if (typeNode.kind === "NonNullType" || typeNode.kind === "ListType") {
    return getNamedType(typeNode.type);
  }
  return null;
}

function coerceVariables(query, variables) {
  try {
    const ast = parse(query);
    let varDefs = [];
    for (const definition of ast.definitions) {
      if (
        definition.kind === "OperationDefinition" &&
        definition.variableDefinitions
      ) {
        varDefs = definition.variableDefinitions;
        break;
      }
    }

    const newVars = { ...variables };
    for (const varDef of varDefs) {
      const varName = varDef.variable.name.value;
      const typeName = getNamedType(varDef.type);
      if (newVars[varName] !== undefined) {
        switch (typeName) {
          case "Int":
            newVars[varName] = parseInt(newVars[varName], 10);
            break;
          case "Float":
            newVars[varName] = parseFloat(newVars[varName]);
            break;
          case "Boolean":
            newVars[varName] = newVars[varName].toLowerCase() === "true";
            break;
        }
      }
    }

    return newVars;
  } catch (err) {
    core.error(
      `❌ Failed to parse query for variable coercion: ${err.message}`,
    );
    return variables;
  }
}

async function run() {
  try {
    core.startGroup("📥 Inputs");
    let queryInput = core.getInput("query", { required: true });
    const argsInput = core.getInput("args");
    const token = core.getInput("token", { required: true });
    const url = core.getInput("url") || "https://api.github.com/graphql";
    core.info(`Query: ${queryInput}`);
    core.info(`Args: ${argsInput || "(none)"}`);
    core.info(`URL: ${url}`);
    core.endGroup();

    if (fs.existsSync(queryInput)) {
      core.startGroup("📄 Reading Query File");
      queryInput = fs.readFileSync(queryInput, "utf8");
      core.info("Query loaded from file.");
      core.endGroup();
    }

    core.startGroup("🧩 Parsing Variables");
    const variables = {};
    if (argsInput) {
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

    const coercedVariables = coerceVariables(queryInput, variables);
    core.info(
      `Coerced Variables: ${JSON.stringify(coercedVariables, null, 2)}`,
    );
    core.endGroup();

    core.startGroup("📦 GraphQL Payload");
    const payload = {
      query: queryInput,
      variables: coercedVariables,
    };
    core.info(JSON.stringify(payload, null, 2));
    core.endGroup();

    core.startGroup("🚀 Sending GraphQL Request");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    core.info("GraphQL Response:");
    core.info(JSON.stringify(data, null, 2));
    core.endGroup();

    core.setOutput("result", JSON.stringify(data));
  } catch (error) {
    core.setFailed(`💥 ${error.message}`);
  }
}

run();

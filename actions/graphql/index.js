const core = require("@actions/core");
const fs = require("fs");
const { parse } = require("graphql");

// Helper to unwrap the named type from any NonNullType or ListType wrappers
function getNamedType(typeNode) {
  if (typeNode.kind === "NamedType") {
    return typeNode.name.value;
  } else if (typeNode.kind === "NonNullType" || typeNode.kind === "ListType") {
    return getNamedType(typeNode.type);
  }
  return null;
}

// Coerce variables based on the variable definitions in the query AST
function coerceVariables(query, variables) {
  try {
    const ast = parse(query);
    let varDefs = [];
    for (const definition of ast.definitions) {
      if (definition.kind === "OperationDefinition" && definition.variableDefinitions) {
        varDefs = definition.variableDefinitions;
        break;
      }
    }
    const newVars = { ...variables };
    for (const varDef of varDefs) {
      const varName = varDef.variable.name.value;
      const typeName = getNamedType(varDef.type);
      if (newVars[varName] !== undefined) {
        if (typeName === "Int") {
          newVars[varName] = parseInt(newVars[varName], 10);
        } else if (typeName === "Float") {
          newVars[varName] = parseFloat(newVars[varName]);
        } else if (typeName === "Boolean") {
          newVars[varName] = newVars[varName].toLowerCase() === "true";
        }
        // For String or other types, no casting is done
      }
    }
    return newVars;
  } catch (err) {
    core.error("Failed to parse query for variable coercion: " + err.message);
    return variables;
  }
}

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

    // Coerce variables using the query's variable definitions
    const coercedVariables = coerceVariables(queryInput, variables);

    const payload = {
      query: queryInput,
      variables: coercedVariables,
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

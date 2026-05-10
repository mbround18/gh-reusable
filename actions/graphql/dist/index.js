"use strict";
const core = require("@actions/core");
const node_fs = require("node:fs");
const graphql = require("graphql");
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
function getNamedType(typeNode) {
  if (typeNode.kind === "NamedType") {
    return typeNode.name.value;
  }
  if (typeNode.kind === "NonNullType" || typeNode.kind === "ListType") {
    return getNamedType(typeNode.type);
  }
  return null;
}
function coerceVariables(query, variables) {
  try {
    const ast = graphql.parse(query);
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
      if (newVars[varName] !== void 0 && typeof newVars[varName] === "string") {
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
    const message = err instanceof Error ? err.message : String(err);
    core__namespace.error(`❌ Failed to parse query for variable coercion: ${message}`);
    return variables;
  }
}
async function run() {
  try {
    core__namespace.startGroup("📥 Inputs");
    let queryInput = core__namespace.getInput("query", { required: true });
    const argsInput = core__namespace.getInput("args");
    const token = core__namespace.getInput("token", { required: true });
    const url = core__namespace.getInput("url") || "https://api.github.com/graphql";
    core__namespace.info(`Query: ${queryInput}`);
    core__namespace.info(`Args: ${argsInput || "(none)"}`);
    core__namespace.info(`URL: ${url}`);
    core__namespace.endGroup();
    if (node_fs.existsSync(queryInput)) {
      core__namespace.startGroup("📄 Reading Query File");
      queryInput = node_fs.readFileSync(queryInput, "utf8");
      core__namespace.info("Query loaded from file.");
      core__namespace.endGroup();
    }
    core__namespace.startGroup("🧩 Parsing Variables");
    const variables = {};
    if (argsInput) {
      const pairs = argsInput.split(/[\n,]+/).map((pair) => pair.trim()).filter((pair) => pair);
      pairs.forEach((pair) => {
        const [key, value] = pair.split("=").map((s) => s.trim());
        if (key && value !== void 0) {
          variables[key] = value;
        }
      });
    }
    const coercedVariables = coerceVariables(queryInput, variables);
    core__namespace.info(`Coerced Variables: ${JSON.stringify(coercedVariables, null, 2)}`);
    core__namespace.endGroup();
    core__namespace.startGroup("📦 GraphQL Payload");
    const payload = {
      query: queryInput,
      variables: coercedVariables
    };
    core__namespace.info(JSON.stringify(payload, null, 2));
    core__namespace.endGroup();
    core__namespace.startGroup("🚀 Sending GraphQL Request");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    core__namespace.info("GraphQL Response:");
    core__namespace.info(JSON.stringify(data, null, 2));
    core__namespace.endGroup();
    core__namespace.setOutput("result", JSON.stringify(data));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core__namespace.setFailed(`💥 ${message}`);
  }
}
void run();
//# sourceMappingURL=index.js.map

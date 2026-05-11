import * as core from '@actions/core';
import { existsSync, readFileSync } from 'node:fs';
import { parse, type TypeNode, type VariableDefinitionNode } from 'graphql';

function getNamedType(typeNode: TypeNode): string | null {
  if (typeNode.kind === 'NamedType') {
    return typeNode.name.value;
  }

  if (typeNode.kind === 'NonNullType' || typeNode.kind === 'ListType') {
    return getNamedType(typeNode.type);
  }

  return null;
}

function coerceVariables(
  query: string,
  variables: Record<string, string>
): Record<string, string | number | boolean> {
  try {
    const ast = parse(query);
    let varDefs: ReadonlyArray<VariableDefinitionNode> = [];

    for (const definition of ast.definitions) {
      if (
        definition.kind === 'OperationDefinition' &&
        definition.variableDefinitions
      ) {
        varDefs = definition.variableDefinitions;
        break;
      }
    }

    const newVars: Record<string, string | number | boolean> = { ...variables };

    for (const varDef of varDefs) {
      const varName = varDef.variable.name.value;
      const typeName = getNamedType(varDef.type);

      if (newVars[varName] !== undefined && typeof newVars[varName] === 'string') {
        switch (typeName) {
          case 'Int':
            newVars[varName] = parseInt(newVars[varName], 10);
            break;
          case 'Float':
            newVars[varName] = parseFloat(newVars[varName]);
            break;
          case 'Boolean':
            newVars[varName] = newVars[varName].toLowerCase() === 'true';
            break;
        }
      }
    }

    return newVars;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    core.error(`❌ Failed to parse query for variable coercion: ${message}`);
    return variables;
  }
}

async function run() {
  try {
    core.startGroup('📥 Inputs');
    let queryInput = core.getInput('query', { required: true });
    const argsInput = core.getInput('args');
    const token = core.getInput('token', { required: true });
    const url = core.getInput('url') || 'https://api.github.com/graphql';
    core.info(`Query: ${queryInput}`);
    core.info(`Args: ${argsInput || '(none)'}`);
    core.info(`URL: ${url}`);
    core.endGroup();

    if (existsSync(queryInput)) {
      core.startGroup('📄 Reading Query File');
      queryInput = readFileSync(queryInput, 'utf8');
      core.info('Query loaded from file.');
      core.endGroup();
    }

    core.startGroup('🧩 Parsing Variables');
    const variables: Record<string, string> = {};

    if (argsInput) {
      const pairs = argsInput
        .split(/[\n,]+/)
        .map((pair) => pair.trim())
        .filter((pair) => pair);

      pairs.forEach((pair) => {
        const [key, value] = pair.split('=').map((s) => s.trim());
        if (key && value !== undefined) {
          variables[key] = value;
        }
      });
    }

    const coercedVariables = coerceVariables(queryInput, variables);
    core.info(`Coerced Variables: ${JSON.stringify(coercedVariables, null, 2)}`);
    core.endGroup();

    core.startGroup('📦 GraphQL Payload');
    const payload = {
      query: queryInput,
      variables: coercedVariables
    };
    core.info(JSON.stringify(payload, null, 2));
    core.endGroup();

    core.startGroup('🚀 Sending GraphQL Request');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    core.info('GraphQL Response:');
    core.info(JSON.stringify(data, null, 2));
    core.endGroup();

    core.setOutput('result', JSON.stringify(data));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(`💥 ${message}`);
  }
}

void run();

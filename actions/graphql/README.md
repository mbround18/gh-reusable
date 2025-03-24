# GraphQL Action

The GraphQL Action executes a GraphQL query or mutation using provided inputs. It supports either an inline query or a file path to a query, accepts arguments as comma‑ or newline‑separated key=value pairs, uses a provided token for authentication, and optionally accepts a custom endpoint URL (defaulting to the GitHub GraphQL API).

## Usage

To use this action in your workflow, add the following steps to your GitHub Actions workflow file:

```yaml
jobs:
  graphql-query:
    runs-on: ubuntu-latest
    steps:
      - name: Execute GraphQL Query
        uses: mbround18/gh-reusable/actions/graphql@docker-workflow-flex
        with:
          query: |
            query($owner: String!, $repo: String!) {
              repository(owner: $owner, name: $repo) {
                description
              }
            }
          args: |
            owner=your-org, repo=your-repo
          token: ${{ secrets.GITHUB_TOKEN }}
          # url is optional; defaults to 'https://api.github.com/graphql'

      - name: Show GraphQL Result
        run: echo "GraphQL response: ${{ steps.graphql-query.outputs.result }}"
```

## Inputs

| Name    | Description                                                                                    | Required | Default                          |
| ------- | ---------------------------------------------------------------------------------------------- | -------- | -------------------------------- |
| `query` | Inline GraphQL query/mutation or a path to a file containing the query.                        | Yes      | N/A                              |
| `args`  | Comma or newline separated key=value pairs for query variables (e.g., `key=value, key=value`). | No       | `""`                             |
| `token` | GitHub token for authenticating the API call.                                                  | Yes      | N/A                              |
| `url`   | GraphQL endpoint URL; defaults to GitHub GraphQL API (`https://api.github.com/graphql`).       | No       | `https://api.github.com/graphql` |

## Outputs

| Name     | Description                                  |
| -------- | -------------------------------------------- |
| `result` | The JSON response from the GraphQL API call. |

## Example

```yaml
jobs:
  graphql-query:
    runs-on: ubuntu-latest
    steps:
      - name: Execute GraphQL Query
        id: graphql
        uses: mbround18/gh-reusable/actions/graphql@docker-workflow-flex
        with:
          query: |
            query($owner: String!, $repo: String!) {
              repository(owner: $owner, name: $repo) {
                description
              }
            }
          args: |
            owner=your-org, repo=your-repo
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Show GraphQL Result
        run: echo "GraphQL response: ${{ steps.graphql.outputs.result }}"
```

This action simplifies integrating GraphQL queries into your workflows without needing to write custom code. Just provide your query, variables, and token, and the action handles the rest.

---

## Contributing

**Relevant Links:**

- [GitHub GraphQL API Documentation](https://docs.github.com/en/graphql)
- [Creating a JavaScript Action](https://docs.github.com/en/actions/creating-actions/creating-a-javascript-action)
- [GitHub Actions Toolkit (@actions/core)](https://github.com/actions/toolkit/tree/main/packages/core)

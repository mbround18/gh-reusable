FROM node:24-bookworm-slim

ENV CI=true
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.15.1 --activate

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @gh-reusable/dagger-pipelines run build

ENTRYPOINT ["node", "packages/dagger-pipelines/dist/cli.js"]
CMD ["ci"]

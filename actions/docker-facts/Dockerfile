FROM node:24-alpine

WORKDIR /action

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY dist ./dist

ENTRYPOINT ["node", "/action/dist/index.js"]

FROM node:lts-slim

WORKDIR /app

# Copy only package files first for better layer caching
COPY package*.json ./
RUN npm ci --only=production

# Copy remaining source code
COPY index.js ./
COPY src ./src
COPY queries ./queries

# Set entrypoint
ENTRYPOINT ["node", "/app/index.js"]

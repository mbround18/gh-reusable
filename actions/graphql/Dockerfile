# Use Node 18 (with built-in fetch support) as the base image
FROM node:22-alpine

# Set the working directory
WORKDIR /action

# Copy package.json (and package-lock.json if available)
COPY package.json package-lock.json* ./

# Install production dependencies
RUN npm install --production

# Copy the rest of the action code
COPY . .

# Define the entrypoint to run your action script
ENTRYPOINT ["node", "/action/index.js"]

FROM node:23-slim

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

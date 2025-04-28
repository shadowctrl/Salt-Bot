FROM node:23-slim

WORKDIR /app

# Copy package files
COPY package.json ./

# Install TypeScript and Yarn globally
RUN yarn global add typescript

# Install only production dependencies
RUN yarn install --frozen-lockfile --production=true

# Copy source code
COPY . .

# Build TypeScript code (we need to temporarily install dev dependencies for building)
RUN yarn install --frozen-lockfile && \
    yarn build && \
    yarn install --frozen-lockfile --production=true

# Create logs directory
RUN mkdir -p logs

# Set environment variables
ENV NODE_ENV=production

# Start the bot
CMD ["node", "build/index.js"]
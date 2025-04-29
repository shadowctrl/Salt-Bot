FROM node:23-slim

WORKDIR /app

# Copy package files
COPY package.json ./

# Install TypeScript and Yarn globally
RUN yarn global add typescript

# Copy source code
COPY . .

# Install dependencies
RUN yarn install --frozen-lockfile && \
    yarn build

# Create logs directory
RUN mkdir -p logs

# Start the bot
CMD ["node", "build/index.js"]
FROM node:20-alpine

WORKDIR /app

# Copy package files (and lock file if it exists)
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Start dev server (build happens on first load)
CMD ["npm", "run", "dev"]

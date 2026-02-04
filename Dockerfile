FROM mcr.microsoft.com/playwright:v1.40.0-focal AS runtime

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application files
COPY . .

# Make scripts executable
RUN chmod +x /app/cli.js /app/runner.sh /app/init.sh /app/server.js 2>/dev/null || true

# Create directories for screenshots and logs
RUN mkdir -p /tmp/screenshots /tmp/logs && chmod 755 /tmp/screenshots /tmp/logs

# Expose API port
EXPOSE 3001

# Default entrypoint
ENTRYPOINT ["/app/init.sh"]

# Default command (can be overridden)
CMD ["node", "server.js"]
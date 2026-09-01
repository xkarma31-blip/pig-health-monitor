FROM node:22-alpine

WORKDIR /app

# Build toolchain for native npm deps (node-gyp / esbuild postinstalls)
RUN apk add --no-cache git python3 make g++

# Install dependencies up-front into the image layer.
# The compose-mounted named volume for /app/node_modules will shadow this on
# first run only if empty; the entrypoint reinstalls there to keep hot-reload
# source mounts working without clobbering native binaries.
COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 8082

# Ensure deps exist (handles named-volume shadowing on first boot), then start
# the Expo web dev server bound to all interfaces for container access.
CMD ["sh", "-c", "if [ -z \"$(ls -A node_modules 2>/dev/null)\" ]; then npm ci || npm install; fi; npx expo start --web --host lan --port 8082"]

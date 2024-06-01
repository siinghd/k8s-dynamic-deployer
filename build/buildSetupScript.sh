#!/bin/bash

# Exit on first error
set -e

# Required environment variables
: "${GITHUB_URL?Need to set GITHUB_URL}"
: "${ENV_FILE?Need to set ENV_FILE}"
: "${INSTALL_CMD?Need to set INSTALL_CMD}"
: "${BUILD_CMD?Need to set BUILD_CMD}"
: "${RUN_CMD?Need to set RUN_CMD}"
: "${PROJECT_PATH?Need to set PROJECT_PATH}"
: "${AVAILABLE_PORT?Need to set AVAILABLE_PORT}"

# Clone the repository
git clone "${GITHUB_URL}" /app/repo
cd /app/repo

# Navigate to project path if specified
if [ -n "${PROJECT_PATH}" ]; then
  cd "${PROJECT_PATH}"
fi

# Set up environment variables
echo -e "${ENV_FILE}" > .env

# Install dependencies
${INSTALL_CMD}

# Build the project if necessary
if [ -n "${BUILD_CMD}" ]; then
  ${BUILD_CMD}
elif jq -e '.scripts.build' package.json >/dev/null; then
  pnpm run build
fi

# Start the project
if [ -d dist ] && [ -f dist/index.html ]; then
  pm2 serve dist --port="${AVAILABLE_PORT}" --spa --no-daemon
elif [ -d out ] && [ -f out/index.html ]; then
  pm2 serve out --port="${AVAILABLE_PORT}" --spa --no-daemon
elif [ -d build ] && [ -f build/index.html ]; then
  pm2 serve build --port="${AVAILABLE_PORT}" --spa --no-daemon
else
  PORT="${AVAILABLE_PORT}" pm2 start "${RUN_CMD}" --no-daemon
fi

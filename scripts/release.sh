#!/bin/bash

# Release script for semantic versioning
# Usage: ./scripts/release.sh [patch|minor|major]

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

RELEASE_TYPE=${1:-patch}

# Validate release type
if [[ ! "$RELEASE_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo -e "${RED}Invalid release type. Use: patch, minor, or major${NC}"
    exit 1
fi

echo -e "${YELLOW}Starting $RELEASE_TYPE release...${NC}"

# Check if we're on main branch
if [ "$(git branch --show-current)" != "main" ]; then
    echo -e "${RED}Must be on main branch${NC}"
    exit 1
fi

# Check if working directory is clean
if ! git diff-index --quiet HEAD --; then
    echo -e "${RED}Working directory not clean. Commit changes first.${NC}"
    exit 1
fi

# Pull latest and test
git pull origin main
npm test

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${YELLOW}Current version: v$CURRENT_VERSION${NC}"

# Bump version and build
npm version $RELEASE_TYPE --no-git-tag-version
NEW_VERSION=$(node -p "require('./package.json').version")
npm run build

# Commit and tag
git add package.json package-lock.json
git commit -m "chore: release v$NEW_VERSION"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

# Push
git push origin main
git push origin "v$NEW_VERSION"

echo -e "${GREEN}Release v$NEW_VERSION completed!${NC}"
echo -e "${YELLOW}CI will publish to npm automatically${NC}"
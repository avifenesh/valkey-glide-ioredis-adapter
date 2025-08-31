#!/bin/bash

# Release script for semantic versioning
# Usage: ./scripts/release.sh [patch|minor|major]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default to patch if no argument provided
RELEASE_TYPE=${1:-patch}

# Validate release type
if [[ ! "$RELEASE_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo -e "${RED}❌ Invalid release type. Use: patch, minor, or major${NC}"
    exit 1
fi

echo -e "${BLUE}🚀 Starting $RELEASE_TYPE release...${NC}"

# Check if we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo -e "${RED}❌ Must be on main branch. Current: $CURRENT_BRANCH${NC}"
    exit 1
fi

# Check if working directory is clean
if ! git diff-index --quiet HEAD --; then
    echo -e "${RED}❌ Working directory is not clean. Commit or stash changes first.${NC}"
    exit 1
fi

# Pull latest changes
echo -e "${YELLOW}📥 Pulling latest changes...${NC}"
git pull origin main

# Run tests to make sure everything passes
echo -e "${YELLOW}🧪 Running tests...${NC}"
npm test

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${BLUE}📦 Current version: v$CURRENT_VERSION${NC}"

# Bump version
echo -e "${YELLOW}⬆️  Bumping $RELEASE_TYPE version...${NC}"
npm version $RELEASE_TYPE --no-git-tag-version

# Get new version
NEW_VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}✅ New version: v$NEW_VERSION${NC}"

# Build the project
echo -e "${YELLOW}🔨 Building project...${NC}"
npm run build

# Commit version bump
git add package.json package-lock.json
git commit -m "chore(release): bump version to v$NEW_VERSION"

# Create and push tag
echo -e "${YELLOW}🏷️  Creating tag v$NEW_VERSION...${NC}"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo -e "${YELLOW}📤 Pushing to origin...${NC}"
git push origin main
git push origin "v$NEW_VERSION"

echo -e "${GREEN}🎉 Release v$NEW_VERSION completed!${NC}"
echo -e "${BLUE}📡 CI will automatically publish to npm when the tag push is detected.${NC}"
echo -e "${BLUE}🔗 Monitor at: https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^.]*\).*/\1/')/actions${NC}"
#!/usr/bin/env bash
# setup-claude.sh — Configure Claude Desktop to use agent-graph-flow MCP server
#
# Usage:
#   ./setup-claude.sh [--project-dir /path/to/project]
#
# This script adds the agent-graph-flow MCP server entry to
# Claude Desktop's configuration file.

set -euo pipefail

PROJECT_DIR="${1:-$(pwd)}"
MCP_SERVER_DIR="$(cd "$(dirname "$0")" && pwd)"

# Determine OS-specific config paths
case "$(uname -s)" in
  Darwin)
    CONFIG_DIR="$HOME/Library/Application Support/Claude"
    ;;
  Linux)
    CONFIG_DIR="$HOME/.config/Claude"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    CONFIG_DIR="$APPDATA/Claude"
    ;;
  *)
    echo "Unsupported OS: $(uname -s)"
    exit 1
    ;;
esac

CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
SERVER_PATH="$MCP_SERVER_DIR/dist/index.js"

echo "agent-graph-flow MCP Setup for Claude Desktop"
echo "============================================="
echo ""
echo "Project dir:  $PROJECT_DIR"
echo "Server path:  $SERVER_PATH"
echo "Config file:  $CONFIG_FILE"
echo ""

# Build the server if not already built
if [ ! -f "$SERVER_PATH" ]; then
  echo "Building MCP server..."
  cd "$MCP_SERVER_DIR/.."
  npm install --silent 2>/dev/null || true
  npx tsc 2>&1 || {
    echo "  Build failed. Trying tsx fallback..."
    SERVER_PATH="$MCP_SERVER_DIR/node_modules/.bin/tsx $MCP_SERVER_DIR/src/index.ts"
  }
  echo "  Build complete."
fi

# Create config directory if needed
mkdir -p "$CONFIG_DIR"

# Build the MCP server entry
MCP_ENTRY=$(cat <<EOF
{
  "command": "node",
  "args": [
    "$SERVER_PATH",
    "--project-dir",
    "$PROJECT_DIR"
  ]
}
EOF
)

# Update or create the config
if [ -f "$CONFIG_FILE" ]; then
  echo "Updating existing config..."

  # Use node to merge JSON (more reliable than jq in all environments)
  node -e "
    const fs = require('fs');
    const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf-8'));
    config.mcpServers = config.mcpServers || {};
    config.mcpServers['agent-graph-flow'] = $MCP_ENTRY;
    fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2) + '\n');
  "
else
  echo "Creating new config..."
  node -e "
    const fs = require('fs');
    const config = {
      mcpServers: {
        'agent-graph-flow': $MCP_ENTRY
      }
    };
    fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2) + '\n');
  "
fi

echo ""
echo "Done! Restart Claude Desktop to pick up the new MCP server."
echo ""
echo "Available tools in Claude:"
echo "  add_node      — Create a node in the execution graph"
echo "  update_status — Update node status"
echo "  start_task    — Start next backlog task"
echo "  finish_task   — Complete a task with DoD checks"
echo "  analyze       — Graph analysis (stats, status, blockers, structure)"
echo "  context       — Load graph context"
echo "  list_nodes    — Query nodes by type/status"
echo "  get_node      — Get node details"
echo "  update_node   — Update node fields"
echo "  snapshot      — Full graph snapshot"

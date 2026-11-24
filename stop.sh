#!/usr/bin/env bash
# ======================================================================
# stop.sh – Stop the “TheAgentStands” project servers
# - Kills the backend (ts-node-dev) and frontend (vite) processes
# - Removes log files that were created by start.sh
# ======================================================================

set -e

echo "Stopping TheAgentStands project servers..."

# Kill backend by process name
pkill -f "ts-node-dev --respawn src/index.ts" 2>/dev/null && echo "Backend stopped." || echo "Backend not running."

# Kill frontend by process name (vite)
pkill -f "vite" 2>/dev/null && echo "Frontend stopped." || echo "Frontend not running."

# Optional: remove log files created by start.sh
rm -f backend.log frontend.log
echo "Log files cleaned up."

echo "All servers stopped."
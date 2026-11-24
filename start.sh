#!/usr/bin/env bash
# ======================================================================
# start.sh – Start the full‑stack “TheAgentStands” project
# - Starts the Node/Express backend (port 4000) using ts-node-dev
# - Starts the Vite/React frontend (port 5173) using npm run dev
# - Prints the URLs so the user can open the app in a browser
# - Runs both processes in the background and waits for them
# ======================================================================

set -e

# colours for nicer output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Colour

echo -e "${GREEN}Starting TheAgentStands project...${NC}"

# ---- Backend -----------------------------------------------------------
cd "$(dirname "$0")/backend"
echo -e "${YELLOW}Starting backend server (port 4000)...${NC}"
npm run dev > ../backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# ---- Frontend ----------------------------------------------------------
cd "../frontend"
echo -e "${YELLOW}Starting frontend dev server (port 5173)...${NC}"
npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

echo ""
echo -e "${GREEN}=== Server URLs ===${NC}"
echo -e "  API:            ${YELLOW}http://localhost:4000${NC}"
echo -e "  UI (Vite):      ${YELLOW}http://localhost:5173${NC}"
echo -e "  Reels API:      ${YELLOW}http://localhost:4000/api/reels${NC}"
echo -e "  TTS models:     ${YELLOW}http://localhost:4000/api/tts/models${NC}"
echo ""
echo -e "${YELLOW}Logs:${NC}"
echo -e "  Backend:        ../backend.log"
echo -e "  Frontend:       ../frontend.log"
echo -e "${GREEN}Press Ctrl‑C to stop both servers.${NC}"

# --------------------------------------------------------------------
# Wait for either process to exit; then kill the other one.
# --------------------------------------------------------------------
trap 'kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 1' INT TERM

wait -p BACKEND_PID FRONTEND_PID 2>/dev/null
# If we get here one of the processes ended; kill the other.
kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
echo -e "${RED}One or both servers stopped.${NC}"
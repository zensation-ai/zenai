#!/bin/bash

# AI Brain - Unified Start Script
# Startet alle Dienste und die Desktop-App

set -e

# Farben
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       🧠 AI Brain - Starting...        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Funktion zum Beenden aller Hintergrundprozesse
cleanup() {
    echo ""
    echo -e "${YELLOW}Stopping services...${NC}"
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    echo -e "${GREEN}All services stopped.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# 1. Docker prüfen
echo -e "${YELLOW}[1/6]${NC} Checking Docker..."
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker Desktop.${NC}"
    echo "   Opening Docker Desktop..."
    open -a Docker
    echo "   Waiting for Docker to start (max 60s)..."
    for i in {1..60}; do
        if docker info > /dev/null 2>&1; then
            break
        fi
        sleep 1
    done
    if ! docker info > /dev/null 2>&1; then
        echo -e "${RED}❌ Docker failed to start. Please start it manually.${NC}"
        exit 1
    fi
fi
echo -e "${GREEN}✅ Docker is running${NC}"

# 2. PostgreSQL prüfen/starten
echo -e "${YELLOW}[2/6]${NC} Checking PostgreSQL..."
if ! docker ps | grep -q "ai-brain-postgres"; then
    echo "   Starting PostgreSQL container..."
    docker-compose up -d postgres
    sleep 3
fi
echo -e "${GREEN}✅ PostgreSQL is running${NC}"

# 3. Ollama prüfen/starten
echo -e "${YELLOW}[3/6]${NC} Checking Ollama..."
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "   Starting Ollama..."
    open -a Ollama 2>/dev/null || ollama serve &
    sleep 3
fi

# Modelle prüfen
if ! ollama list 2>/dev/null | grep -q "mistral"; then
    echo "   Pulling Mistral model (this may take a while)..."
    ollama pull mistral:latest
fi
if ! ollama list 2>/dev/null | grep -q "nomic-embed-text"; then
    echo "   Pulling embedding model..."
    ollama pull nomic-embed-text
fi
echo -e "${GREEN}✅ Ollama is running with required models${NC}"

# 4. Backend starten
echo -e "${YELLOW}[4/6]${NC} Starting Backend..."
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend already running${NC}"
else
    cd backend
    npm run dev > /tmp/ai-brain-backend.log 2>&1 &
    BACKEND_PID=$!
    cd ..

    # Warten auf Backend
    echo "   Waiting for backend to start..."
    for i in {1..30}; do
        if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
            break
        fi
        sleep 1
    done

    if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Backend started (PID: $BACKEND_PID)${NC}"
    else
        echo -e "${RED}❌ Backend failed to start. Check /tmp/ai-brain-backend.log${NC}"
        exit 1
    fi
fi

# 5. Frontend starten
echo -e "${YELLOW}[5/6]${NC} Starting Frontend..."
if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Frontend already running${NC}"
else
    cd frontend
    npm run dev > /tmp/ai-brain-frontend.log 2>&1 &
    FRONTEND_PID=$!
    cd ..

    # Warten auf Frontend
    echo "   Waiting for frontend to start..."
    for i in {1..15}; do
        if curl -s http://localhost:5173 > /dev/null 2>&1; then
            break
        fi
        sleep 1
    done

    if curl -s http://localhost:5173 > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Frontend started (PID: $FRONTEND_PID)${NC}"
    else
        echo -e "${RED}❌ Frontend failed to start. Check /tmp/ai-brain-frontend.log${NC}"
        exit 1
    fi
fi

# 6. Desktop App starten
echo -e "${YELLOW}[6/6]${NC} Starting Desktop App..."
cd desktop
npm start &
APP_PID=$!
cd ..

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     🧠 AI Brain is ready!              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BLUE}Backend:${NC}  http://localhost:3000"
echo -e "  ${BLUE}Frontend:${NC} http://localhost:5173"
echo ""
echo -e "  Press ${YELLOW}Ctrl+C${NC} to stop all services"
echo ""

# Warte auf alle Prozesse
wait

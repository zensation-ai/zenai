#!/bin/bash

echo "🧠 Personal AI System - Startup Script"
echo "======================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Docker is running
echo ""
echo "1. Checking Docker..."
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker Desktop first.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Docker is running${NC}"

# Check if Ollama is running
echo ""
echo "2. Checking Ollama..."
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Ollama is not running. Starting Ollama...${NC}"
    ollama serve &
    sleep 3
fi

# Check if mistral model is available
if ! ollama list | grep -q "mistral:q8_0"; then
    echo -e "${YELLOW}⚠️  Mistral model not found. Pulling mistral:q8_0...${NC}"
    ollama pull mistral:q8_0
fi

# Check if nomic-embed-text is available (for embeddings)
if ! ollama list | grep -q "nomic-embed-text"; then
    echo -e "${YELLOW}⚠️  Embedding model not found. Pulling nomic-embed-text...${NC}"
    ollama pull nomic-embed-text
fi

echo -e "${GREEN}✅ Ollama is ready${NC}"

# Start PostgreSQL with Docker
echo ""
echo "3. Starting PostgreSQL..."
cd "$(dirname "$0")"
docker-compose up -d postgres
echo -e "${GREEN}✅ PostgreSQL is running${NC}"

# Wait for PostgreSQL to be ready
echo ""
echo "4. Waiting for PostgreSQL to be ready..."
sleep 5

# Install backend dependencies if needed
echo ""
echo "5. Installing backend dependencies..."
cd backend
if [ ! -d "node_modules" ]; then
    npm install
fi

# Initialize database
echo ""
echo "6. Initializing database..."
npm run db:init

# Start backend
echo ""
echo "7. Starting backend server..."
npm run dev &

# Install frontend dependencies if needed
echo ""
echo "8. Installing frontend dependencies..."
cd ../frontend
if [ ! -d "node_modules" ]; then
    npm install
fi

# Start frontend
echo ""
echo "9. Starting frontend..."
npm run dev &

echo ""
echo "======================================="
echo -e "${GREEN}🚀 Personal AI System is ready!${NC}"
echo ""
echo "📡 Backend:  http://localhost:3000"
echo "🌐 Frontend: http://localhost:5173"
echo "🗄️  Database: localhost:5432"
echo "🤖 Ollama:   http://localhost:11434"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for processes
wait

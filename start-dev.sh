#!/bin/bash
# Start both backend and frontend for development

echo "Starting Personal AI Brain Development Environment..."

# Kill any existing processes on ports 3000 and 5173
lsof -ti :3000 | xargs kill -9 2>/dev/null
lsof -ti :5173 | xargs kill -9 2>/dev/null

# Start backend in background
echo "Starting backend on port 3000..."
cd "$(dirname "$0")/backend"
npm run dev &
BACKEND_PID=$!

# Wait for backend to be ready
echo "Waiting for backend..."
for i in {1..30}; do
  if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "Backend ready!"
    break
  fi
  sleep 1
done

# Start frontend
echo "Starting frontend on port 5173..."
cd "$(dirname "$0")/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "=========================================="
echo "Development servers running:"
echo "  Backend:  http://localhost:3000"
echo "  Frontend: http://localhost:5173"
echo "  API Docs: http://localhost:3000/api-docs"
echo "=========================================="
echo ""
echo "Press Ctrl+C to stop all servers"

# Handle shutdown
trap "echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM

# Wait for processes
wait

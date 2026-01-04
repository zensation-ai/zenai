import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { voiceMemoRouter } from './routes/voice-memo';
import { ideasRouter } from './routes/ideas';
import { healthRouter } from './routes/health';
import { knowledgeGraphRouter } from './routes/knowledge-graph';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/health', healthRouter);
app.use('/api/voice-memo', voiceMemoRouter);
app.use('/api/ideas', ideasRouter);
app.use('/api/knowledge-graph', knowledgeGraphRouter);

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: err.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`
🧠 Personal AI System - Backend
================================
Server:   http://localhost:${PORT}
Ollama:   ${process.env.OLLAMA_URL}
Database: postgres://${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}
================================
  `);
});

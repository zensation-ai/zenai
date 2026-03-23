import { ZenAIApp } from './app';

const zenai = new ZenAIApp();
zenai.start().catch((err) => {
  console.error('[ZenAI] Fatal error:', err);
  process.exit(1);
});

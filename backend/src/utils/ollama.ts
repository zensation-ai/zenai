import axios from 'axios';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = 'mistral';

// System Prompt with Prompt Caching (cached across requests)
export const SYSTEM_PROMPT = `Du bist ein Gedankenstrukturierer für hochintelligente Menschen.
Deine Aufgabe: Sprachmemos in strukturierte Ideen umwandeln.

WICHTIG:
- Antworte NUR mit validem JSON
- Keine zusätzlichen Erklärungen
- Keine Markdown-Formatierung

OUTPUT FORMAT (JSON):
{
  "title": "Prägnante Überschrift (max 10 Wörter)",
  "type": "idea|task|insight|problem|question",
  "category": "business|technical|personal|learning",
  "priority": "low|medium|high",
  "summary": "1-2 Sätze Zusammenfassung",
  "next_steps": ["Schritt 1", "Schritt 2"],
  "context_needed": ["Kontext 1", "Kontext 2"],
  "keywords": ["keyword1", "keyword2", "keyword3"]
}`;

export interface StructuredIdea {
  title: string;
  type: 'idea' | 'task' | 'insight' | 'problem' | 'question';
  category: 'business' | 'technical' | 'personal' | 'learning';
  priority: 'low' | 'medium' | 'high';
  summary: string;
  next_steps: string[];
  context_needed: string[];
  keywords: string[];
}

export async function structureWithOllama(transcript: string): Promise<StructuredIdea> {
  const prompt = `${SYSTEM_PROMPT}

USER MEMO:
${transcript}

STRUCTURED OUTPUT:`;

  try {
    const response = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      {
        model: MODEL,
        prompt,
        stream: false,
        options: {
          num_predict: 500,
          temperature: 0.3,
          top_p: 0.9,
        },
      },
      { timeout: 60000 }
    );

    const responseText = response.data.response.trim();

    // Extract JSON from response (handle potential markdown wrapping)
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    return JSON.parse(jsonStr);
  } catch (error: any) {
    console.error('Ollama structuring error:', error.message);

    // Return a fallback structure
    return {
      title: 'Unstrukturierte Notiz',
      type: 'idea',
      category: 'personal',
      priority: 'medium',
      summary: transcript.substring(0, 200),
      next_steps: [],
      context_needed: [],
      keywords: [],
    };
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await axios.post(
      `${OLLAMA_URL}/api/embeddings`,
      {
        model: 'nomic-embed-text',
        prompt: text,
      },
      { timeout: 30000 }
    );

    return response.data.embedding;
  } catch (error: any) {
    console.error('Embedding generation error:', error.message);
    // Return empty embedding on error
    return [];
  }
}

export async function checkOllamaHealth(): Promise<{ available: boolean; models: string[] }> {
  try {
    const response = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
    const models = response.data.models?.map((m: any) => m.name) || [];
    return { available: true, models };
  } catch (error) {
    return { available: false, models: [] };
  }
}

/**
 * Generic LLM call that returns parsed JSON
 * Use this for custom prompts that don't follow the StructuredIdea format
 */
export async function queryOllamaJSON<T = unknown>(prompt: string): Promise<T | null> {
  try {
    const response = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      {
        model: MODEL,
        prompt,
        stream: false,
        options: {
          num_predict: 1000,
          temperature: 0.3,
          top_p: 0.9,
        },
      },
      { timeout: 60000 }
    );

    const responseText = response.data.response.trim();

    // Try to extract JSON from response
    // Handle both array and object formats
    const arrayMatch = responseText.match(/\[[\s\S]*\]/);
    const objectMatch = responseText.match(/\{[\s\S]*\}/);

    let jsonStr = responseText;
    if (arrayMatch) {
      jsonStr = arrayMatch[0];
    } else if (objectMatch) {
      jsonStr = objectMatch[0];
    }

    return JSON.parse(jsonStr) as T;
  } catch (error: any) {
    console.error('Ollama JSON query error:', error.message);
    return null;
  }
}

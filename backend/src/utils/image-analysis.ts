import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { logger } from './logger';

/**
 * SECURITY: Execute command with spawn (no shell interpolation)
 * Prevents command injection attacks
 */
function spawnAsync(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });

    child.on('error', reject);
  });
}

// Image analysis using Ollama's vision models
export interface ImageAnalysisResult {
  description: string;
  extractedText: string | null;
  tags: string[];
  objects: string[];
  context: string;
}

/**
 * Analyze image using Ollama's LLaVA or similar vision model
 */
export async function analyzeImage(imagePath: string, context: string = 'general'): Promise<ImageAnalysisResult> {
  try {
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';

    // Read image and convert to base64
    const imageData = await fs.readFile(imagePath);
    const base64Image = imageData.toString('base64');

    // Determine the prompt based on context
    const prompt = getAnalysisPrompt(context);

    // Call Ollama with vision model (llava or similar)
    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llava:7b', // or 'bakllava', 'llava:13b' depending on what's available
        prompt: prompt,
        images: [base64Image],
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 500
        }
      }),
    });

    if (!response.ok) {
      logger.warn('Ollama vision model not available, using fallback');
      return getFallbackAnalysis(context);
    }

    const data = await response.json() as { response?: string };
    const analysisText = data.response || '';

    // Parse the response
    return parseAnalysisResponse(analysisText, context);

  } catch (error) {
    logger.error('Image analysis error', error instanceof Error ? error : undefined);
    return getFallbackAnalysis(context);
  }
}

/**
 * Extract text from image using OCR (Tesseract)
 * SECURITY: Uses spawn instead of exec to prevent command injection
 */
export async function extractTextFromImage(imagePath: string): Promise<string | null> {
  try {
    // SECURITY: Validate imagePath to prevent path traversal
    const normalizedPath = path.normalize(imagePath);
    if (normalizedPath.includes('..') || !path.isAbsolute(normalizedPath)) {
      logger.warn('Invalid image path detected', { path: imagePath });
      return null;
    }

    // Try to use Tesseract OCR if available (spawn prevents command injection)
    const { stdout } = await spawnAsync('tesseract', [normalizedPath, 'stdout', '-l', 'deu+eng']);
    const text = stdout.trim();
    return text.length > 5 ? text : null;
  } catch {
    // Tesseract not available, try alternative methods
    try {
      // Try using macOS Vision framework via osascript
      // SECURITY: Use spawn with properly escaped arguments
      const script = `use framework "Vision"
use scripting additions
-- Vision OCR placeholder
return ""`;
      const { stdout } = await spawnAsync('osascript', ['-e', script]);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }
}

/**
 * Analyze document image (business card, invoice, etc.)
 */
export async function analyzeDocument(imagePath: string): Promise<{
  type: string;
  extractedFields: Record<string, string>;
  summary: string;
}> {
  const text = await extractTextFromImage(imagePath);
  const analysis = await analyzeImage(imagePath, 'document');

  // Try to identify document type and extract structured data
  let type = 'unknown';
  const extractedFields: Record<string, string> = {};

  if (text) {
    // Business card detection
    if (text.match(/(@|\.com|\.de|Tel|Phone|Mobile)/i)) {
      type = 'business_card';
      const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
      const phoneMatch = text.match(/[\d\s+()-]{10,}/);
      const nameMatch = text.split('\n')[0]?.trim();

      if (emailMatch) {extractedFields.email = emailMatch[0];}
      if (phoneMatch) {extractedFields.phone = phoneMatch[0].trim();}
      if (nameMatch && nameMatch.length < 50) {extractedFields.name = nameMatch;}
    }
    // Receipt/Invoice detection
    else if (text.match(/(€|EUR|Summe|Total|Betrag|Invoice)/i)) {
      type = 'receipt';
      const amountMatch = text.match(/(\d+[,.]?\d*)\s*€/);
      const dateMatch = text.match(/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/);

      if (amountMatch) {extractedFields.amount = amountMatch[1] + '€';}
      if (dateMatch) {extractedFields.date = dateMatch[0];}
    }
    // Note/Handwriting
    else if (text.length > 20) {
      type = 'note';
      extractedFields.text = text.substring(0, 500);
    }
  }

  return {
    type,
    extractedFields,
    summary: analysis.description
  };
}

/**
 * Analyze whiteboard/sketch
 */
export async function analyzeWhiteboard(imagePath: string): Promise<{
  elements: string[];
  structure: string;
  summary: string;
}> {
  const analysis = await analyzeImage(imagePath, 'whiteboard');

  return {
    elements: analysis.objects,
    structure: analysis.context,
    summary: analysis.description
  };
}

// Helper functions

function getAnalysisPrompt(context: string): string {
  const prompts: Record<string, string> = {
    general: `Analyze this image and describe:
1. What is shown in the image (main subject)
2. Any visible text or writing
3. Key objects and elements
4. Relevant context or setting
Be concise and factual. Respond in German if there is German text visible.`,

    document: `This is a document image. Please:
1. Identify the document type (business card, invoice, note, etc.)
2. Extract all visible text accurately
3. Note any structured data (names, dates, amounts)
4. Summarize the document's purpose`,

    whiteboard: `This appears to be a whiteboard or sketch. Please:
1. Describe the diagram or drawing structure
2. Identify any text, labels, or annotations
3. Explain the relationships between elements
4. Summarize the main concept being illustrated`,

    creative: `Analyze this image from a creative perspective:
1. Describe the visual composition
2. Note colors, shapes, and artistic elements
3. Identify any artistic style or inspiration
4. Suggest creative applications or interpretations`,

    work: `Analyze this work-related image:
1. What business context does this represent
2. Any relevant data or information visible
3. Key takeaways for professional use
4. Action items or follow-ups suggested`
  };

  return prompts[context] || prompts.general;
}

function parseAnalysisResponse(text: string, context: string): ImageAnalysisResult {
  // Extract tags from the analysis
  const tagMatches = text.match(/\b(Dokument|Foto|Screenshot|Diagramm|Text|Person|Produkt|Gebäude|Natur|Kunst|Business|Meeting|Präsentation)\b/gi);
  const tags = [...new Set(tagMatches || [])].map(t => t.toLowerCase());

  // Extract potential objects
  const objects: string[] = [];
  const objectPatterns = [
    /(?:zeigt|enthält|sichtbar|zu sehen)\s+(.+?)(?:\.|,|$)/gi,
    /(?:shows|contains|visible|displays)\s+(.+?)(?:\.|,|$)/gi
  ];

  for (const pattern of objectPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      objects.push(match[1].trim().substring(0, 50));
    }
  }

  // Check for extracted text in the response
  let extractedText: string | null = null;
  const textMatches = text.match(/(?:Text|Schrift|liest|reads):\s*["']?(.+?)["']?(?:\.|$)/i);
  if (textMatches) {
    extractedText = textMatches[1].trim();
  }

  return {
    description: text.substring(0, 500),
    extractedText,
    tags: tags.length > 0 ? tags : ['image'],
    objects: objects.slice(0, 10),
    context
  };
}

function getFallbackAnalysis(context: string): ImageAnalysisResult {
  return {
    description: 'Bildanalyse nicht verfügbar. Bitte füge eine manuelle Beschreibung hinzu.',
    extractedText: null,
    tags: ['image', context],
    objects: [],
    context
  };
}

export default {
  analyzeImage,
  extractTextFromImage,
  analyzeDocument,
  analyzeWhiteboard
};

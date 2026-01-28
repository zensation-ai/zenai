import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils/logger';
import { transcribeWithOpenAI, isOpenAIAvailable } from './openai';

const WHISPER_MODEL = process.env.WHISPER_MODEL || 'base';

interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
}

/**
 * Transcribe audio file using OpenAI Whisper
 * Supports: wav, mp3, m4a, webm, ogg, flac
 *
 * Strategy:
 * 1. Try local Whisper CLI (for local development)
 * 2. Fall back to OpenAI Whisper API (for Railway/production)
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  originalFilename: string = 'audio.wav'
): Promise<TranscriptionResult> {
  // Check if local Whisper CLI is available
  const localWhisperAvailable = await checkWhisperAvailable();

  if (localWhisperAvailable) {
    logger.info('Using local Whisper CLI for transcription', { operation: 'transcribeAudio' });
    return transcribeWithLocalWhisper(audioBuffer, originalFilename);
  }

  // Fall back to OpenAI Whisper API
  if (isOpenAIAvailable()) {
    logger.info('Using OpenAI Whisper API for transcription (local Whisper not available)', {
      operation: 'transcribeAudio',
    });
    return transcribeWithOpenAI(audioBuffer, originalFilename);
  }

  // Neither local Whisper nor OpenAI available
  throw new Error('No transcription service available. Install local Whisper CLI or configure OPENAI_API_KEY.');
}

/**
 * Transcribe using local Whisper CLI
 */
async function transcribeWithLocalWhisper(
  audioBuffer: Buffer,
  originalFilename: string
): Promise<TranscriptionResult> {
  const startTime = Date.now();

  // Create temp directory if not exists
  const tempDir = path.join(os.tmpdir(), 'whisper-temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Get file extension
  const ext = path.extname(originalFilename) || '.wav';
  const tempInputPath = path.join(tempDir, `input-${Date.now()}${ext}`);
  const tempOutputPath = path.join(tempDir, `output-${Date.now()}`);

  try {
    // Write audio buffer to temp file
    fs.writeFileSync(tempInputPath, audioBuffer);

    // Run whisper CLI
    const transcription = await runWhisperCLI(tempInputPath, tempOutputPath);

    const duration = Date.now() - startTime;
    logger.info('Local Whisper transcription completed', { duration, operation: 'transcribeWithLocalWhisper' });

    return {
      text: transcription.text,
      language: transcription.language || 'de',
      duration,
    };
  } finally {
    // Cleanup temp files
    try {
      if (fs.existsSync(tempInputPath)) {fs.unlinkSync(tempInputPath);}
      if (fs.existsSync(`${tempOutputPath}.txt`)) {fs.unlinkSync(`${tempOutputPath}.txt`);}
      if (fs.existsSync(`${tempOutputPath}.json`)) {fs.unlinkSync(`${tempOutputPath}.json`);}
    } catch (_e) {
      // Ignore cleanup errors
    }
  }
}

function runWhisperCLI(
  inputPath: string,
  outputPath: string
): Promise<{ text: string; language: string }> {
  return new Promise((resolve, reject) => {
    const outputDir = path.dirname(outputPath);
    const args = [
      inputPath,
      '--model', WHISPER_MODEL,
      '--language', 'de', // Force German - keine Auto-Erkennung
      '--output_format', 'json',
      '--output_dir', outputDir,
      '--task', 'transcribe',
      '--fp16', 'False', // Stabiler auf CPU
    ];

    logger.debug('Running Whisper CLI', { args: args.join(' ') });

    // Ensure ffmpeg and SSL certificates are available
    const homeDir = process.env.HOME || '';
    const customPath = `${homeDir}/bin:${process.env.PATH}`;

    const whisperProcess = spawn('whisper', args, {
      env: {
        ...process.env,
        PATH: customPath,
      },
    });

    let stderr = '';

    whisperProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      // Log progress
      const progress = data.toString();
      if (progress.includes('%')) {
        process.stdout.write(`\rWhisper: ${progress.trim()}`);
      }
    });

    whisperProcess.on('close', (code) => {
      if (code !== 0) {
        logger.error('Whisper process failed', new Error(`Whisper exited with code ${code}`), { stderr });
        reject(new Error(`Whisper exited with code ${code}`));
        return;
      }

      // Whisper outputs files in the output_dir with the input filename (minus extension)
      // So input-12345.wav becomes input-12345.json in the output_dir
      const inputBasename = path.basename(inputPath, path.extname(inputPath));

      // Try multiple possible output paths
      const possibleJsonPaths = [
        path.join(outputDir, `${inputBasename}.json`),  // Standard: output_dir/input-12345.json
        inputPath.replace(/\.[^.]+$/, '.json'),          // Fallback: same dir as input
      ];

      const possibleTxtPaths = [
        path.join(outputDir, `${inputBasename}.txt`),
        inputPath.replace(/\.[^.]+$/, '.txt'),
      ];

      try {
        // Try to find and read JSON output
        for (const jsonPath of possibleJsonPaths) {
          if (fs.existsSync(jsonPath)) {
            const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
            const result = JSON.parse(jsonContent);

            // Cleanup the json file
            try { fs.unlinkSync(jsonPath); } catch { /* ignore cleanup errors */ }

            resolve({
              text: result.text?.trim() || '',
              language: result.language || 'de',
            });
            return;
          }
        }

        // Fallback: try txt files
        for (const txtPath of possibleTxtPaths) {
          if (fs.existsSync(txtPath)) {
            const text = fs.readFileSync(txtPath, 'utf-8').trim();
            try { fs.unlinkSync(txtPath); } catch { /* ignore cleanup errors */ }
            resolve({ text, language: 'de' });
            return;
          }
        }

        reject(new Error(`No output file found from Whisper. Checked: ${possibleJsonPaths.join(', ')}`));
      } catch (error) {
        reject(error);
      }
    });

    whisperProcess.on('error', (error) => {
      reject(new Error(`Failed to start Whisper: ${error.message}`));
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      whisperProcess.kill();
      reject(new Error('Whisper transcription timeout (5 minutes)'));
    }, 5 * 60 * 1000);
  });
}

/**
 * Check if Whisper is available
 */
export async function checkWhisperAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const check = spawn('whisper', ['--help']);
    check.on('close', (code) => resolve(code === 0));
    check.on('error', () => resolve(false));
  });
}

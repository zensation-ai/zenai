import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const WHISPER_MODEL = process.env.WHISPER_MODEL || 'base';

interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
}

/**
 * Transcribe audio file using OpenAI Whisper CLI
 * Supports: wav, mp3, m4a, webm, ogg, flac
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  originalFilename: string = 'audio.wav'
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
    console.log(`Transcription completed in ${duration}ms`);

    return {
      text: transcription.text,
      language: transcription.language || 'de',
      duration,
    };
  } finally {
    // Cleanup temp files
    try {
      if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
      if (fs.existsSync(`${tempOutputPath}.txt`)) fs.unlinkSync(`${tempOutputPath}.txt`);
      if (fs.existsSync(`${tempOutputPath}.json`)) fs.unlinkSync(`${tempOutputPath}.json`);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

function runWhisperCLI(
  inputPath: string,
  outputPath: string
): Promise<{ text: string; language: string }> {
  return new Promise((resolve, reject) => {
    const args = [
      inputPath,
      '--model', WHISPER_MODEL,
      '--language', 'de', // Default to German
      '--output_format', 'json',
      '--output_dir', path.dirname(outputPath),
      '--task', 'transcribe',
    ];

    console.log(`Running: whisper ${args.join(' ')}`);

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
        console.error('Whisper stderr:', stderr);
        reject(new Error(`Whisper exited with code ${code}`));
        return;
      }

      // Read the JSON output
      const jsonOutputPath = inputPath.replace(/\.[^.]+$/, '.json');

      try {
        if (fs.existsSync(jsonOutputPath)) {
          const jsonContent = fs.readFileSync(jsonOutputPath, 'utf-8');
          const result = JSON.parse(jsonContent);

          // Cleanup the json file
          fs.unlinkSync(jsonOutputPath);

          resolve({
            text: result.text?.trim() || '',
            language: result.language || 'de',
          });
        } else {
          // Fallback: read txt file
          const txtOutputPath = inputPath.replace(/\.[^.]+$/, '.txt');
          if (fs.existsSync(txtOutputPath)) {
            const text = fs.readFileSync(txtOutputPath, 'utf-8').trim();
            fs.unlinkSync(txtOutputPath);
            resolve({ text, language: 'de' });
          } else {
            reject(new Error('No output file found from Whisper'));
          }
        }
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

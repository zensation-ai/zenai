/**
 * Unit Tests for Whisper Service
 *
 * Tests audio transcription functionality.
 * Uses mocks for child_process and fs operations.
 *
 * Note: transcribeAudio calls spawn twice:
 * 1. checkWhisperAvailable() - spawns "whisper --help"
 * 2. runWhisperCLI() - spawns the actual transcription
 *
 * Tests use mockReturnValueOnce to handle both spawn calls.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import { EventEmitter } from 'events';

// Mock modules before importing
jest.mock('child_process');
jest.mock('fs');

import { transcribeAudio, checkWhisperAvailable } from '../../../services/whisper';

const mockedSpawn = spawn as jest.MockedFunction<typeof spawn>;
const mockedFs = fs as jest.Mocked<typeof fs>;

// Helper to create a controllable mock process
function createMockProcess() {
  const emitter = new EventEmitter();
  const mockProcess = emitter as any;
  mockProcess.stderr = new EventEmitter();
  mockProcess.stdout = new EventEmitter();
  mockProcess.kill = jest.fn();
  return mockProcess;
}

// Helper to setup a mock process that closes successfully
function createSuccessProcess(exitCode: number = 0) {
  const mockProcess = createMockProcess();
  // Emit close on next tick after event listeners are attached
  setImmediate(() => mockProcess.emit('close', exitCode));
  return mockProcess;
}

// Helper to setup a mock process that emits an error
function createErrorProcess(error: Error) {
  const mockProcess = createMockProcess();
  setImmediate(() => mockProcess.emit('error', error));
  return mockProcess;
}

describe('Whisper Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock for existsSync
    mockedFs.existsSync.mockReturnValue(false);
    mockedFs.mkdirSync.mockReturnValue(undefined);
    mockedFs.writeFileSync.mockReturnValue(undefined);
    mockedFs.unlinkSync.mockReturnValue(undefined);
  });

  // ===========================================
  // checkWhisperAvailable Tests
  // ===========================================

  describe('checkWhisperAvailable', () => {
    it('should return true when whisper is available', async () => {
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);

      const result = await checkWhisperAvailable();

      expect(result).toBe(true);
      expect(mockedSpawn).toHaveBeenCalledWith('whisper', ['--help']);
    });

    it('should return false when whisper exits with error', async () => {
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(1) as any);

      const result = await checkWhisperAvailable();

      expect(result).toBe(false);
    });

    it('should return false when spawn fails', async () => {
      mockedSpawn.mockReturnValueOnce(createErrorProcess(new Error('Command not found')) as any);

      const result = await checkWhisperAvailable();

      expect(result).toBe(false);
    });
  });

  // ===========================================
  // transcribeAudio Tests
  // Note: Each test needs to mock TWO spawn calls:
  // 1. For checkWhisperAvailable (returns code 0 to indicate whisper is installed)
  // 2. For runWhisperCLI (the actual transcription)
  // ===========================================

  describe('transcribeAudio', () => {
    beforeEach(() => {
      // Mock temp directory exists
      mockedFs.existsSync.mockImplementation((p: any) => {
        if (typeof p === 'string' && p.includes('whisper-temp')) {return true;}
        return false;
      });
    });

    it('should create temp directory if not exists', async () => {
      // First spawn: checkWhisperAvailable
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);
      // Second spawn: runWhisperCLI
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);

      let tempDirChecked = false;
      mockedFs.existsSync.mockImplementation((p: any) => {
        const path = String(p);
        // First check: whisper-temp directory (return false to trigger mkdir)
        if (path.endsWith('whisper-temp') && !tempDirChecked) {
          tempDirChecked = true;
          return false;
        }
        // JSON output file check
        if (path.includes('.json')) {return true;}
        return true;
      });
      mockedFs.readFileSync.mockReturnValue(JSON.stringify({ text: 'Test', language: 'de' }));

      await transcribeAudio(Buffer.from('audio'), 'test.wav');

      expect(mockedFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('whisper-temp'),
        expect.any(Object)
      );
    });

    it('should write audio buffer to temp file', async () => {
      const audioBuffer = Buffer.from('test audio data');

      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);

      mockedFs.existsSync.mockImplementation((p: any) => {
        if (typeof p === 'string' && p.includes('.json')) {return true;}
        return true;
      });
      mockedFs.readFileSync.mockReturnValue(JSON.stringify({ text: 'Test', language: 'de' }));

      await transcribeAudio(audioBuffer, 'test.wav');

      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('input-'),
        audioBuffer
      );
    });

    it('should return transcription result from JSON output', async () => {
      const mockResult = { text: 'Hello world', language: 'en' };

      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);

      mockedFs.existsSync.mockImplementation((p: any) => {
        if (typeof p === 'string' && p.includes('.json')) {return true;}
        return true;
      });
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockResult));

      const result = await transcribeAudio(Buffer.from('audio'), 'test.wav');

      expect(result.text).toBe('Hello world');
      expect(result.language).toBe('en');
      expect(typeof result.duration).toBe('number');
    });

    it('should fallback to txt output if JSON not found', async () => {
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);

      mockedFs.existsSync.mockImplementation((p: any) => {
        if (typeof p === 'string' && p.includes('.json')) {return false;}
        if (typeof p === 'string' && p.includes('.txt')) {return true;}
        return true;
      });
      mockedFs.readFileSync.mockReturnValue('Fallback text');

      const result = await transcribeAudio(Buffer.from('audio'), 'test.wav');

      expect(result.text).toBe('Fallback text');
      expect(result.language).toBe('de');
    });

    it('should reject on non-zero exit code', async () => {
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(1) as any);

      await expect(transcribeAudio(Buffer.from('audio'), 'test.wav'))
        .rejects.toThrow('Whisper exited with code 1');
    });

    it('should reject on spawn error', async () => {
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);
      mockedSpawn.mockReturnValueOnce(createErrorProcess(new Error('Failed to start')) as any);

      await expect(transcribeAudio(Buffer.from('audio'), 'test.wav'))
        .rejects.toThrow('Failed to start Whisper');
    });

    it('should reject when no output file found', async () => {
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);

      mockedFs.existsSync.mockImplementation((p: any) => {
        if (typeof p === 'string' && (p.includes('.json') || p.includes('.txt'))) {return false;}
        return true;
      });

      await expect(transcribeAudio(Buffer.from('audio'), 'test.wav'))
        .rejects.toThrow('No output file found');
    });

    it('should use correct file extension from originalFilename', async () => {
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);

      mockedFs.existsSync.mockImplementation((p: any) => {
        if (typeof p === 'string' && p.includes('.json')) {return true;}
        return true;
      });
      mockedFs.readFileSync.mockReturnValue(JSON.stringify({ text: 'Test' }));

      await transcribeAudio(Buffer.from('audio'), 'recording.m4a');

      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.m4a'),
        expect.any(Buffer)
      );
    });

    it('should use .wav as default extension', async () => {
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);

      mockedFs.existsSync.mockImplementation((p: any) => {
        if (typeof p === 'string' && p.includes('.json')) {return true;}
        return true;
      });
      mockedFs.readFileSync.mockReturnValue(JSON.stringify({ text: 'Test' }));

      await transcribeAudio(Buffer.from('audio'));

      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.wav'),
        expect.any(Buffer)
      );
    });

    it('should call whisper with correct arguments', async () => {
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);

      mockedFs.existsSync.mockImplementation((p: any) => {
        if (typeof p === 'string' && p.includes('.json')) {return true;}
        return true;
      });
      mockedFs.readFileSync.mockReturnValue(JSON.stringify({ text: 'Test' }));

      await transcribeAudio(Buffer.from('audio'), 'test.wav');

      // Second call should be for runWhisperCLI
      expect(mockedSpawn).toHaveBeenCalledTimes(2);
      expect(mockedSpawn).toHaveBeenLastCalledWith(
        'whisper',
        expect.arrayContaining([
          expect.stringContaining('input-'),
          '--model', expect.any(String),
          '--language', 'de',
          '--output_format', 'json',
        ]),
        expect.any(Object)
      );
    });

    it('should cleanup temp files after success', async () => {
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);

      mockedFs.existsSync.mockImplementation((p: any) => {
        if (typeof p === 'string' && p.includes('.json')) {return true;}
        return true;
      });
      mockedFs.readFileSync.mockReturnValue(JSON.stringify({ text: 'Test' }));

      await transcribeAudio(Buffer.from('audio'), 'test.wav');

      // Should attempt to cleanup input file
      expect(mockedFs.unlinkSync).toHaveBeenCalled();
    });

    it('should cleanup temp files after error', async () => {
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(1) as any);

      try {
        await transcribeAudio(Buffer.from('audio'), 'test.wav');
      } catch {
        // Expected to throw
      }

      // Should still attempt cleanup
      expect(mockedFs.unlinkSync).toHaveBeenCalled();
    });

    it('should trim whitespace from text output', async () => {
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);

      mockedFs.existsSync.mockImplementation((p: any) => {
        if (typeof p === 'string' && p.includes('.json')) {return true;}
        return true;
      });
      mockedFs.readFileSync.mockReturnValue(JSON.stringify({ text: '  Hello world  ', language: 'de' }));

      const result = await transcribeAudio(Buffer.from('audio'), 'test.wav');

      expect(result.text).toBe('Hello world');
    });

    it('should default language to de if not in response', async () => {
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);

      mockedFs.existsSync.mockImplementation((p: any) => {
        if (typeof p === 'string' && p.includes('.json')) {return true;}
        return true;
      });
      mockedFs.readFileSync.mockReturnValue(JSON.stringify({ text: 'Test' }));

      const result = await transcribeAudio(Buffer.from('audio'), 'test.wav');

      expect(result.language).toBe('de');
    });
  });

  // ===========================================
  // Edge Cases
  // ===========================================

  describe('Edge Cases', () => {
    it('should handle empty audio buffer', async () => {
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);

      mockedFs.existsSync.mockImplementation((p: any) => {
        if (typeof p === 'string' && p.includes('.json')) {return true;}
        return true;
      });
      mockedFs.readFileSync.mockReturnValue(JSON.stringify({ text: '' }));

      const result = await transcribeAudio(Buffer.from(''), 'empty.wav');

      expect(result.text).toBe('');
    });

    it('should handle special characters in filename', async () => {
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);

      mockedFs.existsSync.mockImplementation((p: any) => {
        if (typeof p === 'string' && p.includes('.json')) {return true;}
        return true;
      });
      mockedFs.readFileSync.mockReturnValue(JSON.stringify({ text: 'Test' }));

      const result = await transcribeAudio(
        Buffer.from('audio'),
        'my recording (1).m4a'
      );

      expect(result.text).toBe('Test');
    });

    it('should ignore cleanup errors', async () => {
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);
      mockedSpawn.mockReturnValueOnce(createSuccessProcess(0) as any);

      mockedFs.existsSync.mockImplementation((p: any) => {
        if (typeof p === 'string' && p.includes('.json')) {return true;}
        return true;
      });
      mockedFs.readFileSync.mockReturnValue(JSON.stringify({ text: 'Test' }));
      mockedFs.unlinkSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      // Should not throw despite cleanup error
      const result = await transcribeAudio(Buffer.from('audio'), 'test.wav');
      expect(result.text).toBe('Test');
    });
  });
});

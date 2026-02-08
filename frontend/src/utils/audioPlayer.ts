/**
 * Streaming Audio Player
 *
 * Manages playback of streaming audio chunks from TTS using the Web Audio API.
 * Queues chunks and plays them sequentially for smooth audio output.
 *
 * Phase 33 Sprint 4 - Feature 9
 */

export class StreamingAudioPlayer {
  private audioContext: AudioContext | null = null;
  private audioQueue: ArrayBuffer[] = [];
  private isPlaying = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private onPlaybackEnd?: () => void;

  constructor(onPlaybackEnd?: () => void) {
    this.onPlaybackEnd = onPlaybackEnd;
  }

  /**
   * Queue an audio chunk for playback.
   * Chunks are played in order as they arrive.
   */
  async queueChunk(audioData: ArrayBuffer): Promise<void> {
    this.audioQueue.push(audioData);

    if (!this.isPlaying) {
      await this.playNext();
    }
  }

  /**
   * Stop all playback and clear the queue.
   */
  stop(): void {
    this.audioQueue = [];
    this.isPlaying = false;

    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        // Already stopped
      }
      this.currentSource = null;
    }
  }

  /**
   * Check if audio is currently playing.
   */
  get playing(): boolean {
    return this.isPlaying;
  }

  /**
   * Close the audio context and release resources.
   */
  async close(): Promise<void> {
    this.stop();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
    }
    this.audioContext = null;
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  private async playNext(): Promise<void> {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      this.onPlaybackEnd?.();
      return;
    }

    this.isPlaying = true;
    const audioData = this.audioQueue.shift()!;

    try {
      const ctx = this.getAudioContext();

      // Resume context if suspended (browser autoplay policy)
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const audioBuffer = await ctx.decodeAudioData(audioData.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      this.currentSource = source;

      source.onended = () => {
        this.currentSource = null;
        void this.playNext();
      };

      source.start(0);
    } catch (error) {
      console.error('Audio playback error:', error);
      this.currentSource = null;
      // Try next chunk even if this one failed
      void this.playNext();
    }
  }
}

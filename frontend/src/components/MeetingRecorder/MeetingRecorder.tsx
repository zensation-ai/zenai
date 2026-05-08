/**
 * MeetingRecorder — live meeting transcription with AI summary.
 *
 * - Start / Stop buttons with Mic / Square icons (lucide-react)
 * - Calls POST /api/:context/meetings/start  to open a session
 * - Calls POST /api/:context/meetings/:id/stop to close and get summary
 * - Renders TranscriptView during recording (manual entry via addEntry prop or demo mode)
 * - Renders structured summary after Stop
 */

import { useState } from 'react';
import axios from 'axios';
import { Mic, Square, Loader2 } from 'lucide-react';
import type { AIContext } from '../ContextSwitcher';
import { TranscriptView } from './TranscriptView';
import type { TranscriptEntry } from './TranscriptView';

interface MeetingSummary {
  summary: string;
  actionItems: string[];
  decisions: string[];
  keyPoints: string[];
}

interface MeetingRecorderProps {
  context?: AIContext;
  calendarEventId?: string;
}

type RecordingState = 'idle' | 'recording' | 'stopping' | 'done';

export function MeetingRecorder({ context = 'finance', calendarEventId }: MeetingRecorderProps) {
  const [state, setState] = useState<RecordingState>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [summary, setSummary] = useState<MeetingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    setError(null);
    setSummary(null);
    setTranscript([]);
    setSessionId(null);
    setState('recording');

    try {
      const res = await axios.post<{ sessionId: string }>(
        `/api/${context}/meetings/start`,
        { calendarEventId }
      );
      setSessionId(res.data.sessionId);
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.error ?? err.message)
        : String(err);
      setError(`Failed to start session: ${msg}`);
      setState('idle');
    }
  };

  const handleStop = async () => {
    if (!sessionId) return;

    setState('stopping');

    try {
      const res = await axios.post<{
        sessionId: string;
        status: string;
        summary: MeetingSummary;
        transcriptLength: number;
      }>(`/api/${context}/meetings/${sessionId}/stop`);

      setSummary(res.data.summary);
      setState('done');
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.error ?? err.message)
        : String(err);
      setError(`Failed to stop session: ${msg}`);
      setState('recording');
    }
  };

  /** Demo helper: add a sample entry to the local transcript (for UI preview). */
  const addDemoEntry = () => {
    setTranscript(prev => [
      ...prev,
      {
        speaker: prev.length % 2 === 0 ? 'Alice' : 'Bob',
        text: `Sample statement #${prev.length + 1}.`,
        timestamp: new Date(),
      },
    ]);
  };

  const isRecording = state === 'recording';
  const isStopping = state === 'stopping';

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 p-5 space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Mic className="w-5 h-5 text-indigo-400" />
          Meeting Recorder
        </h2>

        <div className="flex gap-2">
          {/* Start button */}
          {state === 'idle' || state === 'done' ? (
            <button
              onClick={handleStart}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
            >
              <Mic className="w-4 h-4" />
              {state === 'done' ? 'New Recording' : 'Start Recording'}
            </button>
          ) : null}

          {/* Stop button */}
          {isRecording ? (
            <>
              <button
                onClick={addDemoEntry}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition-colors"
                title="Add demo entry"
              >
                + Entry
              </button>
              <button
                onClick={handleStop}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
            </>
          ) : null}

          {/* Stopping spinner */}
          {isStopping ? (
            <button
              disabled
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-700 text-gray-400 text-sm font-medium cursor-not-allowed"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              Summarizing…
            </button>
          ) : null}
        </div>
      </div>

      {/* Recording indicator */}
      {isRecording && (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          Recording in progress
          {sessionId && (
            <span className="text-gray-500 text-xs ml-2">Session: {sessionId.slice(0, 8)}…</span>
          )}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="rounded-lg bg-red-900/40 border border-red-700 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Transcript */}
      {(isRecording || isStopping || state === 'done') && (
        <TranscriptView entries={transcript} />
      )}

      {/* Summary */}
      {summary && state === 'done' && (
        <div className="space-y-3 pt-2">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
            AI Summary
          </h3>

          <p className="text-gray-200 text-sm leading-relaxed">{summary.summary}</p>

          {summary.actionItems.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-indigo-400 uppercase mb-1">
                Action Items
              </h4>
              <ul className="list-disc list-inside space-y-1">
                {summary.actionItems.map((item, i) => (
                  <li key={i} className="text-sm text-gray-300">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.decisions.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-emerald-400 uppercase mb-1">
                Decisions
              </h4>
              <ul className="list-disc list-inside space-y-1">
                {summary.decisions.map((d, i) => (
                  <li key={i} className="text-sm text-gray-300">
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.keyPoints.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-amber-400 uppercase mb-1">
                Key Points
              </h4>
              <ul className="list-disc list-inside space-y-1">
                {summary.keyPoints.map((kp, i) => (
                  <li key={i} className="text-sm text-gray-300">
                    {kp}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * MeetingProtocol - Phase 37 + Audio
 *
 * Live meeting protocol: voice recording with audio upload,
 * transcript, AI-structured notes, audio playback.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { logError } from '../../utils/errors';
import type { AIContext } from '../ContextSwitcher';
import { Button } from '@/components/ui/button';

interface MeetingNote {
  id: string;
  meeting_id: string;
  structured_summary?: string;
  raw_transcript?: string;
  topics_discussed?: string[];
  // Legacy field mapping
  summary?: string;
  decisions?: string[];
  action_items?: Array<{ task: string; assignee?: string; deadline?: string }>;
  follow_ups?: string[];
  sentiment?: string;
  key_points?: string[];
  audio_storage_path?: string;
  audio_duration_seconds?: number;
  audio_size_bytes?: number;
  audio_mime_type?: string;
  created_at: string;
}

interface MeetingProtocolProps {
  meetingId: string;
  meetingTitle: string;
  context: AIContext;
  eventId?: string;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MeetingProtocol({ meetingId, meetingTitle, context, eventId }: MeetingProtocolProps) {
  const [notes, setNotes] = useState<MeetingNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [uploadSize, setUploadSize] = useState<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioBlobRef = useRef<Blob | null>(null);

  // Fetch existing notes
  useEffect(() => {
    const fetchNotes = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`/api/${context}/meetings/${meetingId}/notes`);
        if (res.data.success) {
          const n = res.data.notes;
          setNotes(Array.isArray(n) ? n : n ? [n] : []);
        }
      } catch {
        // No notes yet
      } finally {
        setLoading(false);
      }
    };
    fetchNotes();
  }, [meetingId, context]);

  // Fetch audio playback URL if notes have audio
  useEffect(() => {
    const noteWithAudio = notes.find(n => n.audio_storage_path);
    if (noteWithAudio && !audioUrl) {
      axios.get(`/api/${context}/meetings/${meetingId}/audio-url`)
        .then(res => {
          if (res.data.success && res.data.url) {
            setAudioUrl(res.data.url);
          }
        })
        .catch(err => logError('MeetingProtocol:fetchAudioUrl', err));
    }
  }, [notes, meetingId, context, audioUrl]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        const blob = new Blob(chunks, { type: 'audio/webm' });
        audioBlobRef.current = blob;

        // Transcribe via voice-memo endpoint with transcribeOnly
        const formData = new FormData();
        formData.append('audio', blob, 'meeting-recording.webm');

        try {
          const res = await axios.post(`/api/${context}/voice-memo`, formData, {
            params: { transcribeOnly: 'true' },
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          if (res.data.transcript) {
            setTranscript(prev => prev ? `${prev}\n\n${res.data.transcript}` : res.data.transcript);
          }
        } catch (err) {
          logError('MeetingProtocol:transcribe', err);
          setError('Transkription fehlgeschlagen. Bitte manuell eingeben.');
        }
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingSeconds(0);

      // Start recording timer
      timerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } catch (err) {
      logError('MeetingProtocol:startRecording', err);
      setError('Mikrofon-Zugriff fehlgeschlagen. Bitte Berechtigung erteilen.');
    }
  }, [context]);

  const stopRecording = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  }, [mediaRecorder]);

  const processNotes = useCallback(async () => {
    if (!transcript.trim()) return;
    setProcessing(true);
    setError(null);

    try {
      let res;
      if (eventId) {
        // Process via calendar meeting-link endpoint
        const formData = new FormData();
        formData.append('transcript', transcript.trim());
        if (audioBlobRef.current) {
          formData.append('audio', audioBlobRef.current, 'meeting-recording.webm');
        }
        res = await axios.post(
          `/api/${context}/calendar/events/${eventId}/meeting/notes`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        );
      } else {
        // Process directly via meetings endpoint with audio
        const formData = new FormData();
        formData.append('transcript', transcript.trim());
        formData.append('context', context);
        if (audioBlobRef.current) {
          formData.append('audio', audioBlobRef.current, 'meeting-recording.webm');
        }
        res = await axios.post(
          `/api/${context}/meetings/${meetingId}/notes`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        );
      }

      if (res.data.success && res.data.notes) {
        setNotes(prev => [...prev, res.data.notes]);
        setTranscript('');
        // Track upload size
        if (audioBlobRef.current) {
          setUploadSize(audioBlobRef.current.size);
        }
        audioBlobRef.current = null;
      }
    } catch (err) {
      logError('MeetingProtocol:processNotes', err);
      setError(err instanceof Error ? err.message : 'Verarbeitung fehlgeschlagen');
    } finally {
      setProcessing(false);
    }
  }, [transcript, meetingId, eventId, context]);

  const getSentimentEmoji = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive': return '\uD83D\uDE0A';
      case 'negative': return '\uD83D\uDE1F';
      case 'neutral': return '\uD83D\uDE10';
      default: return '';
    }
  };

  /** Get the summary text, preferring structured_summary over legacy summary */
  const getNoteSummary = (note: MeetingNote): string | undefined => {
    return note.structured_summary || note.summary;
  };

  if (loading) {
    return <div className="flex items-center justify-center p-12 text-text-secondary text-[0.9rem]">Lade Protokoll...</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="m-0 text-lg font-semibold text-text">
        {'\uD83C\uDF99\uFE0F'} Protokoll: {meetingTitle}
      </h3>

      {/* Recording controls */}
      <div className="flex items-center gap-3">
        {!isRecording ? (
          <Button
            variant="outline"
            onClick={startRecording}
          >
            {'\uD83C\uDF99\uFE0F'} Aufnahme starten
          </Button>
        ) : (
          <Button
            variant="outline"
            className="bg-red-500/10 border-red-500 text-red-500 hover:bg-red-500/[0.18] animate-pulse"
            onClick={stopRecording}
          >
            {'\u23F9\uFE0F'} Aufnahme stoppen
          </Button>
        )}

        {isRecording && (
          <>
            <span className="text-[0.8rem] text-red-500 font-medium animate-pulse">
              Aufnahme l&auml;uft...
            </span>
            <span className="font-mono text-lg text-red-600 font-semibold">
              {formatDuration(recordingSeconds)}
            </span>
          </>
        )}
      </div>

      {/* Transcript input */}
      <div className="flex flex-col gap-2">
        <label htmlFor="meeting-transcript" className="text-[0.8rem] font-medium text-text-secondary uppercase tracking-wide">Transkript / Notizen</label>
        <textarea
          id="meeting-transcript"
          value={transcript}
          onChange={e => setTranscript(e.target.value)}
          placeholder="Sprach-Transkript erscheint hier automatisch, oder manuell Notizen eingeben..."
          rows={6}
          className="px-3 py-3 border border-glass-border rounded-md bg-surface text-text text-[0.9rem] font-[inherit] resize-y min-h-[120px] transition-colors focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/35"
        />
        <Button
          className="self-end"
          onClick={processNotes}
          disabled={!transcript.trim() || processing}
        >
          {processing ? 'Verarbeite...' : 'Protokoll verarbeiten'}
        </Button>
      </div>

      {uploadSize !== null && (
        <div className="text-[0.8rem] text-blue-500 mt-1">
          Audio hochgeladen: {formatBytes(uploadSize)}
        </div>
      )}

      {error && (
        <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-500 text-[0.85rem]">{error}</div>
      )}

      {/* Audio playback */}
      {audioUrl && (
        <div className="my-4 p-3 bg-surface border border-glass-border rounded-lg">
          <h4 className="m-0 mb-2 text-[0.8rem] font-semibold text-text-secondary uppercase tracking-wide">Audioaufnahme</h4>
          <audio controls preload="metadata" src={audioUrl} className="w-full">
            Dein Browser unterst&uuml;tzt kein Audio-Playback.
          </audio>
          {notes.find(n => n.audio_duration_seconds || n.audio_size_bytes) && (() => {
            const audioNote = notes.find(n => n.audio_duration_seconds || n.audio_size_bytes);
            return (
              <div className="text-[0.8rem] text-text-muted mt-1 flex gap-3 flex-wrap">
                {audioNote?.audio_duration_seconds && (
                  <span>Dauer: {formatDuration(audioNote.audio_duration_seconds)}</span>
                )}
                {audioNote?.audio_size_bytes && (
                  <span>Gr&ouml;&szlig;e: {formatBytes(audioNote.audio_size_bytes)}</span>
                )}
                {audioNote?.audio_mime_type && (
                  <span>Format: {audioNote.audio_mime_type}</span>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Structured notes display */}
      {notes.length > 0 && (
        <div className="flex flex-col gap-3">
          {notes.map((note, idx) => (
            <div key={note.id || idx} className="bg-glass-bg border border-glass-border rounded-lg p-4 relative">
              {note.sentiment && (
                <span className="absolute top-3 right-4 text-xl" title={`Stimmung: ${note.sentiment}`}>
                  {getSentimentEmoji(note.sentiment)}
                </span>
              )}

              {getNoteSummary(note) && (
                <div className="mb-4 last:mb-0">
                  <h4 className="m-0 mb-1.5 text-[0.8rem] font-semibold text-text-secondary uppercase tracking-wide">Zusammenfassung</h4>
                  <p className="m-0 text-[0.9rem] text-text leading-relaxed">{getNoteSummary(note)}</p>
                </div>
              )}

              {note.raw_transcript && (
                <div className="mb-4 last:mb-0">
                  <h4 className="m-0 mb-1.5 text-[0.8rem] font-semibold text-text-secondary uppercase tracking-wide">Rohtranskript</h4>
                  <p className="m-0 text-[0.9rem] text-text leading-relaxed">{note.raw_transcript}</p>
                </div>
              )}

              {note.topics_discussed && note.topics_discussed.length > 0 && (
                <div className="mb-4 last:mb-0">
                  <h4 className="m-0 mb-1.5 text-[0.8rem] font-semibold text-text-secondary uppercase tracking-wide">Besprochene Themen</h4>
                  <ul className="m-0 pl-5 text-[0.9rem] text-text leading-relaxed">
                    {note.topics_discussed.map((topic, i) => (
                      <li key={i}>{topic}</li>
                    ))}
                  </ul>
                </div>
              )}

              {note.key_points && note.key_points.length > 0 && (
                <div className="mb-4 last:mb-0">
                  <h4 className="m-0 mb-1.5 text-[0.8rem] font-semibold text-text-secondary uppercase tracking-wide">Kernpunkte</h4>
                  <ul className="m-0 pl-5 text-[0.9rem] text-text leading-relaxed">
                    {note.key_points.map((point, i) => (
                      <li key={i}>{point}</li>
                    ))}
                  </ul>
                </div>
              )}

              {note.decisions && note.decisions.length > 0 && (
                <div className="mb-4 last:mb-0">
                  <h4 className="m-0 mb-1.5 text-[0.8rem] font-semibold text-text-secondary uppercase tracking-wide">Entscheidungen</h4>
                  <ul className="m-0 pl-5 text-[0.9rem] text-text leading-relaxed">
                    {note.decisions.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}

              {note.action_items && note.action_items.length > 0 && (
                <div className="mb-4 last:mb-0">
                  <h4 className="m-0 mb-1.5 text-[0.8rem] font-semibold text-text-secondary uppercase tracking-wide">Action Items</h4>
                  <ul className="list-none !p-0 flex flex-col gap-1.5">
                    {note.action_items.map((item, i) => (
                      <li key={i} className="flex flex-wrap items-baseline gap-2 px-2 py-1.5 bg-bg-secondary rounded-sm text-[0.85rem]">
                        <span className="font-medium text-text">{item.task}</span>
                        {item.assignee && (
                          <span className="text-primary text-[0.8rem]">
                            &rarr; {item.assignee}
                          </span>
                        )}
                        {item.deadline && (
                          <span className="text-text-secondary text-[0.8rem]">
                            bis {new Date(item.deadline).toLocaleDateString('de-DE')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {note.follow_ups && note.follow_ups.length > 0 && (
                <div className="mb-4 last:mb-0">
                  <h4 className="m-0 mb-1.5 text-[0.8rem] font-semibold text-text-secondary uppercase tracking-wide">Follow-ups</h4>
                  <ul className="m-0 pl-5 text-[0.9rem] text-text leading-relaxed">
                    {note.follow_ups.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}

              <span className="block text-xs text-text-secondary text-right mt-2">
                {note.created_at ? new Date(note.created_at).toLocaleString('de-DE') : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {notes.length === 0 && !transcript && (
        <div className="text-center p-8 text-text-secondary text-[0.9rem]">
          <p className="m-0 mb-1">Noch kein Protokoll vorhanden.</p>
          <p className="m-0">Starte eine Aufnahme oder gib manuell Notizen ein.</p>
        </div>
      )}
    </div>
  );
}

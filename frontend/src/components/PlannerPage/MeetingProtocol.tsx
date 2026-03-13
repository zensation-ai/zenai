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
import './MeetingProtocol.css';

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
        const res = await axios.get(`/api/meetings/${meetingId}/notes`, { params: { context } });
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
          `/api/meetings/${meetingId}/notes`,
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
    return <div className="meeting-protocol__loading">Lade Protokoll...</div>;
  }

  return (
    <div className="meeting-protocol">
      <h3 className="meeting-protocol__title">
        {'\uD83C\uDF99\uFE0F'} Protokoll: {meetingTitle}
      </h3>

      {/* Recording controls */}
      <div className="meeting-protocol__controls">
        {!isRecording ? (
          <button
            className="meeting-protocol__record-btn"
            onClick={startRecording}
          >
            {'\uD83C\uDF99\uFE0F'} Aufnahme starten
          </button>
        ) : (
          <button
            className="meeting-protocol__record-btn meeting-protocol__record-btn--active"
            onClick={stopRecording}
          >
            {'\u23F9\uFE0F'} Aufnahme stoppen
          </button>
        )}

        {isRecording && (
          <>
            <span className="meeting-protocol__recording-indicator">
              Aufnahme l&auml;uft...
            </span>
            <span className="meeting-protocol__recording-timer">
              {formatDuration(recordingSeconds)}
            </span>
          </>
        )}
      </div>

      {/* Transcript input */}
      <div className="meeting-protocol__transcript">
        <label htmlFor="meeting-transcript">Transkript / Notizen</label>
        <textarea
          id="meeting-transcript"
          value={transcript}
          onChange={e => setTranscript(e.target.value)}
          placeholder="Sprach-Transkript erscheint hier automatisch, oder manuell Notizen eingeben..."
          rows={6}
        />
        <button
          className="meeting-protocol__process-btn"
          onClick={processNotes}
          disabled={!transcript.trim() || processing}
        >
          {processing ? 'Verarbeite...' : 'Protokoll verarbeiten'}
        </button>
      </div>

      {uploadSize !== null && (
        <div className="meeting-protocol__upload-info">
          Audio hochgeladen: {formatBytes(uploadSize)}
        </div>
      )}

      {error && (
        <div className="meeting-protocol__error">{error}</div>
      )}

      {/* Audio playback */}
      {audioUrl && (
        <div className="meeting-protocol__audio-player">
          <h4>Audioaufnahme</h4>
          <audio controls preload="metadata" src={audioUrl}>
            Dein Browser unterst&uuml;tzt kein Audio-Playback.
          </audio>
          {notes.find(n => n.audio_duration_seconds || n.audio_size_bytes) && (() => {
            const audioNote = notes.find(n => n.audio_duration_seconds || n.audio_size_bytes);
            return (
              <div className="meeting-protocol__audio-meta">
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
        <div className="meeting-protocol__notes">
          {notes.map((note, idx) => (
            <div key={note.id || idx} className="meeting-protocol__note">
              {note.sentiment && (
                <span className="meeting-protocol__sentiment" title={`Stimmung: ${note.sentiment}`}>
                  {getSentimentEmoji(note.sentiment)}
                </span>
              )}

              {getNoteSummary(note) && (
                <div className="meeting-protocol__section">
                  <h4>Zusammenfassung</h4>
                  <p>{getNoteSummary(note)}</p>
                </div>
              )}

              {note.raw_transcript && (
                <div className="meeting-protocol__section">
                  <h4>Rohtranskript</h4>
                  <p>{note.raw_transcript}</p>
                </div>
              )}

              {note.topics_discussed && note.topics_discussed.length > 0 && (
                <div className="meeting-protocol__section">
                  <h4>Besprochene Themen</h4>
                  <ul>
                    {note.topics_discussed.map((topic, i) => (
                      <li key={i}>{topic}</li>
                    ))}
                  </ul>
                </div>
              )}

              {note.key_points && note.key_points.length > 0 && (
                <div className="meeting-protocol__section">
                  <h4>Kernpunkte</h4>
                  <ul>
                    {note.key_points.map((point, i) => (
                      <li key={i}>{point}</li>
                    ))}
                  </ul>
                </div>
              )}

              {note.decisions && note.decisions.length > 0 && (
                <div className="meeting-protocol__section">
                  <h4>Entscheidungen</h4>
                  <ul>
                    {note.decisions.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}

              {note.action_items && note.action_items.length > 0 && (
                <div className="meeting-protocol__section">
                  <h4>Action Items</h4>
                  <ul className="meeting-protocol__actions">
                    {note.action_items.map((item, i) => (
                      <li key={i} className="meeting-protocol__action-item">
                        <span className="meeting-protocol__action-task">{item.task}</span>
                        {item.assignee && (
                          <span className="meeting-protocol__action-assignee">
                            &rarr; {item.assignee}
                          </span>
                        )}
                        {item.deadline && (
                          <span className="meeting-protocol__action-deadline">
                            bis {new Date(item.deadline).toLocaleDateString('de-DE')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {note.follow_ups && note.follow_ups.length > 0 && (
                <div className="meeting-protocol__section">
                  <h4>Follow-ups</h4>
                  <ul>
                    {note.follow_ups.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}

              <span className="meeting-protocol__timestamp">
                {note.created_at ? new Date(note.created_at).toLocaleString('de-DE') : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {notes.length === 0 && !transcript && (
        <div className="meeting-protocol__empty">
          <p>Noch kein Protokoll vorhanden.</p>
          <p>Starte eine Aufnahme oder gib manuell Notizen ein.</p>
        </div>
      )}
    </div>
  );
}

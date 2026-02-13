/**
 * MeetingProtocol - Phase 37
 *
 * Live meeting protocol: voice recording, transcript, AI-structured notes.
 * Reuses VoiceInput component for audio capture.
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './MeetingProtocol.css';

interface MeetingNote {
  id: string;
  meeting_id: string;
  summary?: string;
  decisions?: string[];
  action_items?: Array<{ task: string; assignee?: string; deadline?: string }>;
  follow_ups?: string[];
  sentiment?: string;
  key_points?: string[];
  created_at: string;
}

interface MeetingProtocolProps {
  meetingId: string;
  meetingTitle: string;
  context: string;
  eventId?: string; // If opened from calendar event
}

export function MeetingProtocol({ meetingId, meetingTitle, context, eventId }: MeetingProtocolProps) {
  const [notes, setNotes] = useState<MeetingNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);

  // Fetch existing notes
  useEffect(() => {
    const fetchNotes = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`/api/meetings/${meetingId}/notes`);
        if (res.data.success) {
          setNotes(Array.isArray(res.data.data) ? res.data.data : res.data.data ? [res.data.data] : []);
        }
      } catch {
        // No notes yet - that's fine
      } finally {
        setLoading(false);
      }
    };
    fetchNotes();
  }, [meetingId]);

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
        const blob = new Blob(chunks, { type: 'audio/webm' });

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
          setError('Transkription fehlgeschlagen. Bitte manuell eingeben.');
        }
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
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
        res = await axios.post(`/api/${context}/calendar/events/${eventId}/meeting/notes`, {
          transcript: transcript.trim(),
        });
      } else {
        // Process directly via meetings endpoint
        res = await axios.post(`/api/meetings/${meetingId}/notes`, {
          transcript: transcript.trim(),
        });
      }

      if (res.data.success && res.data.data) {
        setNotes(prev => [...prev, res.data.data]);
        setTranscript('');
      }
    } catch (err) {
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
          <span className="meeting-protocol__recording-indicator">
            Aufnahme laeuft...
          </span>
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

      {error && (
        <div className="meeting-protocol__error">{error}</div>
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

              {note.summary && (
                <div className="meeting-protocol__section">
                  <h4>Zusammenfassung</h4>
                  <p>{note.summary}</p>
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
                {new Date(note.created_at).toLocaleString('de-DE')}
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

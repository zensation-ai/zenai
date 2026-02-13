import { useState, useEffect } from 'react';
import axios from 'axios';
import { Meeting } from './MeetingCard';
import type { IdeaPriority } from '../types/idea';
import './MeetingDetail.css';
import '../neurodesign.css';

interface MeetingNotes {
  id: string;
  meeting_id: string;
  raw_transcript: string;
  structured_summary: string;
  key_decisions: string[];
  action_items: ActionItem[];
  topics_discussed: string[];
  follow_ups: FollowUp[];
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  created_at: string;
}

interface ActionItem {
  task: string;
  assignee?: string;
  due_date?: string;
  priority: IdeaPriority;
  completed: boolean;
}

interface FollowUp {
  topic: string;
  responsible?: string;
  deadline?: string;
}

interface MeetingDetailProps {
  meeting: Meeting;
  notes: MeetingNotes | null;
  onClose: () => void;
  onNotesAdded: (notes: MeetingNotes) => void;
}

const sentimentIcons: Record<string, string> = {
  positive: '😊',
  neutral: '😐',
  negative: '😟',
  mixed: '🤔',
};

const priorityColors: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#64748b',
};

export function MeetingDetail({ meeting, notes, onClose, onNotesAdded }: MeetingDetailProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);

  // ESC key handler for closing modal
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isRecording && !processing) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [onClose, isRecording, processing]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        chunks.push(e.data);
        setAudioChunks([...chunks]);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setError(null);
    } catch (err) {
      setError('Mikrofon-Zugriff fehlgeschlagen');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
    }
  };

  const processNotes = async () => {
    if (!transcript.trim() && audioChunks.length === 0) {
      setError('Bitte Text eingeben oder Audio aufnehmen');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      let response;

      if (audioChunks.length > 0) {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob, 'meeting-notes.webm');

        response = await axios.post(`/api/meetings/${meeting.id}/notes`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        response = await axios.post(`/api/meetings/${meeting.id}/notes`, {
          transcript: transcript,
        });
      }

      onNotesAdded(response.data.notes);
      setTranscript('');
      setAudioChunks([]);
    } catch (err: unknown) {
      const message = axios.isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Verarbeitung fehlgeschlagen'
        : 'Verarbeitung fehlgeschlagen';
      setError(message);
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '–';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '–';
    return date.toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="meeting-detail-overlay neuro-focus-mode active" onClick={onClose}>
      <div className="meeting-detail-modal liquid-glass neuro-human-fade-in" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="close-button neuro-press-effect" onClick={onClose} aria-label="Schließen">×</button>

        <div className="detail-header">
          <h2>{meeting.title}</h2>
          <span className="detail-date">{formatDate(meeting.date)}</span>
        </div>

        {/* Meeting Info */}
        <div className="meeting-meta-section">
          {meeting.participants.length > 0 && (
            <div className="meta-item">
              <strong>Teilnehmer:</strong> {meeting.participants.join(', ')}
            </div>
          )}
          {meeting.location && (
            <div className="meta-item">
              <strong>Ort:</strong> {meeting.location}
            </div>
          )}
          {meeting.duration_minutes && (
            <div className="meta-item">
              <strong>Dauer:</strong> {meeting.duration_minutes} Minuten
            </div>
          )}
        </div>

        {/* Notes Section */}
        {notes ? (
          <div className="notes-content neuro-flow-list">
            <div className="notes-header">
              <h3>Meeting Notizen</h3>
              <span className="sentiment">
                {sentimentIcons[notes.sentiment]} {notes.sentiment}
              </span>
            </div>

            <div className="notes-section neuro-stagger-item">
              <h4>Zusammenfassung</h4>
              <p className="neuro-motivational">{notes.structured_summary}</p>
            </div>

            {notes.topics_discussed.length > 0 && (
              <div className="notes-section neuro-stagger-item">
                <h4>Besprochene Themen</h4>
                <ul className="topics-list">
                  {notes.topics_discussed.map((topic, i) => (
                    <li key={i} className="neuro-stagger-item">{topic}</li>
                  ))}
                </ul>
              </div>
            )}

            {notes.key_decisions.length > 0 && (
              <div className="notes-section neuro-stagger-item">
                <h4>Entscheidungen</h4>
                <ul className="decisions-list">
                  {notes.key_decisions.map((decision, i) => (
                    <li key={i} className="neuro-stagger-item">
                      <span className="decision-icon neuro-reward-badge">✓</span>
                      {decision}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {notes.action_items.length > 0 && (
              <div className="notes-section">
                <h4>Aktionspunkte</h4>
                <div className="action-items-list">
                  {notes.action_items.map((item, i) => (
                    <div key={i} className="action-item">
                      <div className="action-item-header">
                        <span
                          className="priority-dot"
                          style={{ backgroundColor: priorityColors[item.priority] }}
                        />
                        <span className="action-task">{item.task}</span>
                      </div>
                      {item.assignee && (
                        <span className="action-assignee">👤 {item.assignee}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {notes.follow_ups.length > 0 && (
              <div className="notes-section">
                <h4>Follow-ups</h4>
                <ul className="follow-ups-list">
                  {notes.follow_ups.map((fu, i) => (
                    <li key={i}>
                      <strong>{fu.topic}</strong>
                      {fu.responsible && ` - ${fu.responsible}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {notes.raw_transcript && (
              <div className="notes-section transcript-section">
                <h4>Original-Transkript</h4>
                <blockquote>{notes.raw_transcript}</blockquote>
              </div>
            )}
          </div>
        ) : (
          <div className="add-notes-section">
            <h3>Notizen hinzufügen</h3>

            {error && <div className="error-message">{error}</div>}

            <div className="notes-input-container">
              <textarea
                className="notes-textarea"
                placeholder="Meeting-Notizen oder Transkript hier eingeben..."
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                disabled={processing || isRecording}
                rows={6}
              />

              <div className="notes-actions">
                <button
                  type="button"
                  className={`record-button neuro-press-effect ${isRecording ? 'recording neuro-heartbeat' : ''}`}
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={processing}
                >
                  {isRecording ? '⏹️ Stop' : '🎤 Aufnehmen'}
                </button>

                {audioChunks.length > 0 && (
                  <span className="audio-indicator">🔊 Audio aufgenommen</span>
                )}

                <button
                  type="button"
                  className="process-button neuro-button"
                  onClick={processNotes}
                  disabled={processing || (!transcript.trim() && audioChunks.length === 0)}
                >
                  {processing ? (
                    <span className="loading-spinner" />
                  ) : (
                    '✨ Verarbeiten'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

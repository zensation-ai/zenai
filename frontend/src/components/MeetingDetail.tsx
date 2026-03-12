import { useState, useEffect } from 'react';
import axios from 'axios';
import type { Meeting } from './MeetingCard';
import { formatDateLong, formatDuration } from '../utils/dateUtils';
import { getErrorMessage } from '../utils/errors';
import type { MeetingNotes } from '../types/meeting';
import './MeetingDetail.css';
import '../neurodesign.css';

interface MeetingDetailProps {
  meeting: Meeting;
  notes: MeetingNotes | null;
  onClose: () => void;
  onNotesAdded: (notes: MeetingNotes) => void;
}

const SENTIMENT_ICONS: Record<string, string> = {
  positive: '😊',
  neutral: '😐',
  negative: '😟',
  mixed: '🤔',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#64748b',
};

export function MeetingDetail({ meeting, notes, onClose, onNotesAdded }: MeetingDetailProps): JSX.Element {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);

  const canClose = !isRecording && !processing;
  const hasInput = transcript.trim().length > 0 || audioChunks.length > 0;

  useEffect(() => {
    function handleEscKey(event: KeyboardEvent): void {
      if (event.key === 'Escape' && canClose) {
        onClose();
      }
    }
    document.addEventListener('keydown', handleEscKey);
    return () => document.removeEventListener('keydown', handleEscKey);
  }, [onClose, canClose]);

  const startRecording = async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        chunks.push(event.data);
        setAudioChunks([...chunks]);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setError(null);
    } catch {
      setError('Mikrofon-Zugriff fehlgeschlagen');
    }
  };

  const stopRecording = (): void => {
    if (!mediaRecorder) return;
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    setIsRecording(false);
  };

  const processNotes = async (): Promise<void> => {
    if (!hasInput) {
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
          transcript,
        });
      }

      onNotesAdded(response.data.notes);
      setTranscript('');
      setAudioChunks([]);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Verarbeitung fehlgeschlagen'));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="meeting-detail-overlay neuro-focus-mode active" onClick={onClose} role="presentation">
      <div className="meeting-detail-modal liquid-glass neuro-human-fade-in" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Meeting-Details">
        <button type="button" className="close-button neuro-press-effect" onClick={onClose} aria-label="Schließen">×</button>

        <div className="detail-header">
          <h2>{meeting.title}</h2>
          <span className="detail-date">{formatDateLong(meeting.date)}</span>
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
              <strong>Dauer:</strong> {formatDuration(meeting.duration_minutes) ?? `${meeting.duration_minutes} Minuten`}
            </div>
          )}
        </div>

        {/* Notes Section */}
        {notes ? (
          <div className="notes-content neuro-flow-list">
            <div className="notes-header">
              <h3>Meeting Notizen</h3>
              <span className="sentiment">
                {SENTIMENT_ICONS[notes.sentiment]} {notes.sentiment}
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
                  {notes.topics_discussed.map((topic, index) => (
                    <li key={index} className="neuro-stagger-item">{topic}</li>
                  ))}
                </ul>
              </div>
            )}

            {notes.key_decisions.length > 0 && (
              <div className="notes-section neuro-stagger-item">
                <h4>Entscheidungen</h4>
                <ul className="decisions-list">
                  {notes.key_decisions.map((decision, index) => (
                    <li key={index} className="neuro-stagger-item">
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
                  {notes.action_items.map((item, index) => (
                    <div key={index} className="action-item">
                      <div className="action-item-header">
                        <span
                          className="priority-dot"
                          style={{ backgroundColor: PRIORITY_COLORS[item.priority] }}
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
                  {notes.follow_ups.map((followUp, index) => (
                    <li key={index}>
                      <strong>{followUp.topic}</strong>
                      {followUp.responsible && ` - ${followUp.responsible}`}
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
                  disabled={processing || !hasInput}
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

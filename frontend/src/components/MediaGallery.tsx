import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import { getContextLabel } from './ContextSwitcher';
import { getApiBaseUrl } from '../utils/apiConfig';
import './MediaGallery.css';
import '../neurodesign.css';
import { logError } from '../utils/errors';

interface MediaItem {
  id: string;
  type: 'image' | 'video';
  filename: string;
  url: string;
  thumbnail_url?: string;
  analysis?: string;
  tags: string[];
  idea_id?: string;
  created_at: string;
}

interface MediaGalleryProps {
  onBack: () => void;
  context: string;
}

export function MediaGallery({ onBack, context }: MediaGalleryProps) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const API_URL = getApiBaseUrl();

  useEffect(() => {
    loadMedia();
  }, [context]);

  const loadMedia = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/all-media?context=${context}`);
      // Backend returns { id, media_type, filename, caption, ... } - map to MediaItem
      const items: MediaItem[] = (res.data.media || []).map((m: Record<string, unknown>) => ({
        id: m.id as string,
        type: (m.media_type === 'photo' ? 'image' : m.media_type === 'video' ? 'video' : 'image') as 'image' | 'video',
        filename: m.filename as string,
        url: `${API_URL}/api/media-file/${m.id}`,
        thumbnail_url: m.thumbnail_path ? `${API_URL}/api/media/${m.id}/thumbnail` : undefined,
        analysis: (m.caption || m.ai_analysis) as string | undefined,
        tags: [],
        idea_id: m.idea_id as string | undefined,
        created_at: m.created_at as string,
      }));
      setMedia(items);
    } catch (err) {
      logError('MediaGallery:loadMedia', err);
      showToast('Hmm, deine Medien konnten nicht geladen werden. Prüf deine Verbindung und versuch es noch mal.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const formData = new FormData();
    formData.append('media', file);

    try {
      setUploading(true);
      const res = await axios.post(`/api/${context}/media`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      // Backend returns { mediaId, mediaType, filename, ... } - construct MediaItem
      const uploaded: MediaItem = {
        id: res.data.mediaId,
        type: res.data.mediaType === 'photo' ? 'image' : 'video',
        filename: res.data.filename || file.name,
        url: `${API_URL}/api/media-file/${res.data.mediaId}`,
        tags: [],
        created_at: new Date().toISOString(),
      };
      setMedia(prev => [uploaded, ...prev]);
      showToast('Datei hochgeladen!', 'success');
    } catch (err) {
      showToast('Der Upload hat leider nicht geklappt. Ist die Datei vielleicht zu groß?', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (mediaId: string) => {
    if (!confirm('Medium wirklich löschen?')) return;
    try {
      await axios.delete(`/api/media/${mediaId}`);
      setMedia(prev => prev.filter(m => m.id !== mediaId));
      if (selectedMedia?.id === mediaId) {
        setSelectedMedia(null);
      }
      showToast('Medium gelöscht', 'success');
    } catch {
      showToast('Löschen fehlgeschlagen', 'error');
    }
  };

  const handleAnalyze = async (mediaId: string) => {
    try {
      setAnalyzing(mediaId);
      const res = await axios.post(`/api/${context}/media/analyze-existing`, { mediaId });
      // Backend returns analysis as object { description, tags, ... } - extract description string
      const analysisResult = res.data.analysis;
      const analysisText = !analysisResult
        ? null
        : typeof analysisResult === 'string'
          ? analysisResult
          : (analysisResult.description || JSON.stringify(analysisResult));
      const analysisTags = res.data.tags || analysisResult?.tags || [];
      setMedia(prev => prev.map(m =>
        m.id === mediaId ? { ...m, analysis: analysisText, tags: analysisTags || m.tags } : m
      ));
      if (selectedMedia?.id === mediaId) {
        setSelectedMedia(prev => prev ? { ...prev, analysis: analysisText, tags: analysisTags || prev.tags } : null);
      }
      showToast('Analyse abgeschlossen!', 'success');
    } catch (err) {
      showToast('Die KI-Analyse hat diesmal nicht geklappt. Versuch es gleich noch mal.', 'error');
    } finally {
      setAnalyzing(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('de-DE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const filteredMedia = filter === 'all'
    ? media
    : media.filter(m => m.type === filter);

  if (loading) {
    return (
      <div className="media-gallery">
        <div className="loading-state">
          <div className="loading-spinner large" />
          <p>Lade Medien...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="media-gallery">
      <div className="media-header">
        <button type="button" className="back-button neuro-hover-lift" onClick={onBack}>
          ← Zurück
        </button>
        <h1>🖼️ Medien</h1>
        <span className={`context-indicator ${context}`}>
          {getContextLabel(context)}
        </span>
        <div className="upload-section">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUpload}
            accept="image/*,video/*"
            className="visually-hidden"
            title="Datei hochladen"
            aria-label="Datei hochladen"
          />
          <button
            type="button"
            className="upload-btn neuro-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label="Medien hochladen"
          >
            {uploading ? '...' : '📤 Hochladen'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="media-filters" role="group" aria-label="Medienfilter">
        <button
          type="button"
          className={`filter-btn neuro-press-effect ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
          aria-label="Alle Medien anzeigen"
          aria-pressed={filter === 'all'}
        >
          Alle ({media.length})
        </button>
        <button
          type="button"
          className={`filter-btn neuro-press-effect ${filter === 'image' ? 'active' : ''}`}
          onClick={() => setFilter('image')}
          aria-label="Nur Bilder anzeigen"
          aria-pressed={filter === 'image'}
        >
          🖼️ Bilder ({media.filter(m => m.type === 'image').length})
        </button>
        <button
          type="button"
          className={`filter-btn neuro-press-effect ${filter === 'video' ? 'active' : ''}`}
          onClick={() => setFilter('video')}
          aria-label="Nur Videos anzeigen"
          aria-pressed={filter === 'video'}
        >
          🎬 Videos ({media.filter(m => m.type === 'video').length})
        </button>
      </div>

      {/* Gallery Grid */}
      {filteredMedia.length === 0 ? (
        <div className="empty-state neuro-empty-state">
          <span className="empty-icon neuro-breathing">🖼️</span>
          <h3 className="neuro-empty-title">Keine Medien</h3>
          <p className="neuro-empty-description">Lade Fotos oder Videos hoch, um sie hier zu sehen.</p>
          <button
            type="button"
            className="action-btn neuro-button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Erste Medien-Datei hochladen"
          >
            📤 Erste Datei hochladen
          </button>
        </div>
      ) : (
        <div className="media-grid neuro-flow-list">
          {filteredMedia.map(item => (
            <div
              key={item.id}
              className="media-card neuro-hover-lift neuro-stagger-item"
              onClick={() => setSelectedMedia(item)}
            >
              <div className="media-preview">
                {item.type === 'image' ? (
                  <img src={item.thumbnail_url || item.url} alt={item.filename} />
                ) : (
                  <div className="video-preview">
                    {item.thumbnail_url ? (
                      <img src={item.thumbnail_url} alt={item.filename} />
                    ) : (
                      <span className="video-icon">🎬</span>
                    )}
                    <span className="play-icon">▶</span>
                  </div>
                )}
              </div>
              <div className="media-info">
                <span className="media-date">{formatDate(item.created_at)}</span>
                {item.analysis && <span className="analyzed-badge neuro-reward-badge">✓ Analysiert</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedMedia && (
        <div className="modal-overlay neuro-focus-mode active" onClick={() => setSelectedMedia(null)} role="presentation">
          <div className="media-modal liquid-glass neuro-human-fade-in" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Medien-Detail">
            <button type="button" className="close-btn neuro-press-effect" onClick={() => setSelectedMedia(null)} aria-label="Modal schließen">✕</button>

            <div className="modal-media">
              {selectedMedia.type === 'image' ? (
                <img src={selectedMedia.url} alt={selectedMedia.filename} />
              ) : (
                <video src={selectedMedia.url} controls />
              )}
            </div>

            <div className="modal-info">
              <div className="modal-meta">
                <span>{selectedMedia.type === 'image' ? '🖼️ Bild' : '🎬 Video'}</span>
                <span>{formatDate(selectedMedia.created_at)}</span>
              </div>

              {selectedMedia.tags && selectedMedia.tags.length > 0 && (
                <div className="media-tags">
                  {selectedMedia.tags.map((tag, i) => (
                    <span key={i} className="tag neuro-reward-badge">{tag}</span>
                  ))}
                </div>
              )}

              {selectedMedia.analysis ? (
                <div className="analysis-section neuro-human-fade-in">
                  <h4>🤖 KI-Analyse</h4>
                  <p className="neuro-motivational">{selectedMedia.analysis}</p>
                </div>
              ) : (
                <button
                  type="button"
                  className="analyze-btn neuro-button"
                  onClick={() => handleAnalyze(selectedMedia.id)}
                  disabled={analyzing === selectedMedia.id}
                >
                  {analyzing === selectedMedia.id ? 'Analysiere...' : '🤖 Mit KI analysieren'}
                </button>
              )}

              <button
                type="button"
                className="delete-media-btn"
                onClick={() => handleDelete(selectedMedia.id)}
                aria-label="Medium löschen"
              >
                🗑️ Löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

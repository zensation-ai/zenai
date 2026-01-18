import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import './MediaGallery.css';

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

  useEffect(() => {
    loadMedia();
  }, [context]);

  const loadMedia = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/all-media');
      setMedia(res.data.media || []);
    } catch (err) {
      console.error('Failed to load media:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploading(true);
      const res = await axios.post(`/api/${context}/media`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMedia(prev => [res.data.media, ...prev]);
      showToast('Datei hochgeladen!', 'success');
    } catch (err) {
      showToast('Upload fehlgeschlagen', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAnalyze = async (mediaId: string) => {
    try {
      setAnalyzing(mediaId);
      const res = await axios.post(`/api/${context}/media/analyze`, { mediaId });
      setMedia(prev => prev.map(m =>
        m.id === mediaId ? { ...m, analysis: res.data.analysis, tags: res.data.tags || m.tags } : m
      ));
      if (selectedMedia?.id === mediaId) {
        setSelectedMedia(prev => prev ? { ...prev, analysis: res.data.analysis, tags: res.data.tags || prev.tags } : null);
      }
      showToast('Analyse abgeschlossen!', 'success');
    } catch (err) {
      showToast('Analyse fehlgeschlagen', 'error');
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
        <button className="back-button" onClick={onBack}>
          ← Zurück
        </button>
        <h1>🖼️ Medien</h1>
        <span className={`context-indicator ${context}`}>
          {context === 'personal' ? '🏠 Privat' : '💼 Arbeit'}
        </span>
        <div className="upload-section">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUpload}
            accept="image/*,video/*"
            style={{ display: 'none' }}
          />
          <button
            className="upload-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? '...' : '📤 Hochladen'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="media-filters">
        <button
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          Alle ({media.length})
        </button>
        <button
          className={`filter-btn ${filter === 'image' ? 'active' : ''}`}
          onClick={() => setFilter('image')}
        >
          🖼️ Bilder ({media.filter(m => m.type === 'image').length})
        </button>
        <button
          className={`filter-btn ${filter === 'video' ? 'active' : ''}`}
          onClick={() => setFilter('video')}
        >
          🎬 Videos ({media.filter(m => m.type === 'video').length})
        </button>
      </div>

      {/* Gallery Grid */}
      {filteredMedia.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🖼️</span>
          <h3>Keine Medien</h3>
          <p>Lade Fotos oder Videos hoch, um sie hier zu sehen.</p>
          <button
            className="action-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            📤 Erste Datei hochladen
          </button>
        </div>
      ) : (
        <div className="media-grid">
          {filteredMedia.map(item => (
            <div
              key={item.id}
              className="media-card"
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
                {item.analysis && <span className="analyzed-badge">✓ Analysiert</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedMedia && (
        <div className="modal-overlay" onClick={() => setSelectedMedia(null)}>
          <div className="media-modal" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setSelectedMedia(null)}>✕</button>

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
                    <span key={i} className="tag">{tag}</span>
                  ))}
                </div>
              )}

              {selectedMedia.analysis ? (
                <div className="analysis-section">
                  <h4>🤖 KI-Analyse</h4>
                  <p>{selectedMedia.analysis}</p>
                </div>
              ) : (
                <button
                  className="analyze-btn"
                  onClick={() => handleAnalyze(selectedMedia.id)}
                  disabled={analyzing === selectedMedia.id}
                >
                  {analyzing === selectedMedia.id ? 'Analysiere...' : '🤖 Mit KI analysieren'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

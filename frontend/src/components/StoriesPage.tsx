import { useState, useEffect } from 'react';
import axios from 'axios';
import './StoriesPage.css';
import '../neurodesign.css';

interface StoryItem {
  id: string;
  type: 'idea' | 'media' | 'meeting';
  title: string;
  summary: string;
  thumbnail?: string;
  created_at: string;
}

interface Story {
  id: string;
  title: string;
  date: string;
  items: StoryItem[];
  cover_image?: string;
}

interface StoriesPageProps {
  onBack: () => void;
  context: string;
}

export function StoriesPage({ onBack, context }: StoriesPageProps) {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);

  useEffect(() => {
    loadStories();
  }, [context]);

  const loadStories = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/${context}/stories`);
      setStories(res.data.stories || []);
    } catch (err) {
      console.error('Failed to load stories:', err);
      setStories([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Heute';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Gestern';
    } else {
      return date.toLocaleDateString('de-DE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'idea': return '💡';
      case 'media': return '🖼️';
      case 'meeting': return '📅';
      default: return '📌';
    }
  };

  const handleNextItem = () => {
    if (selectedStory && currentItemIndex < selectedStory.items.length - 1) {
      setCurrentItemIndex(prev => prev + 1);
    } else {
      // Go to next story
      const currentIndex = stories.findIndex(s => s.id === selectedStory?.id);
      if (currentIndex < stories.length - 1) {
        setSelectedStory(stories[currentIndex + 1]);
        setCurrentItemIndex(0);
      } else {
        setSelectedStory(null);
      }
    }
  };

  const handlePrevItem = () => {
    if (currentItemIndex > 0) {
      setCurrentItemIndex(prev => prev - 1);
    } else {
      // Go to previous story
      const currentIndex = stories.findIndex(s => s.id === selectedStory?.id);
      if (currentIndex > 0) {
        const prevStory = stories[currentIndex - 1];
        setSelectedStory(prevStory);
        setCurrentItemIndex(prevStory.items.length - 1);
      }
    }
  };

  if (loading) {
    return (
      <div className="stories-page neuro-page-enter">
        <div className="neuro-loading-contextual">
          <div className="neuro-loading-spinner" />
          <p className="neuro-loading-message">Lade Stories...</p>
          <p className="neuro-loading-submessage">Deine Aktivitäten werden zusammengestellt</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stories-page neuro-page-enter">
      <div className="stories-header">
        <button className="back-button" onClick={onBack}>
          ← Zurück
        </button>
        <h1>📖 Stories</h1>
        <span className={`context-indicator ${context}`}>
          {context === 'personal' ? '🏠 Privat' : '💼 Arbeit'}
        </span>
      </div>

      <p className="stories-intro">
        Deine Aktivitäten automatisch gruppiert nach Tagen und Themen.
      </p>

      {stories.length === 0 ? (
        <div className="neuro-empty-state">
          <span className="neuro-empty-icon">📖</span>
          <h3 className="neuro-empty-title">Noch keine Stories</h3>
          <p className="neuro-empty-description">Erstelle Ideen, lade Medien hoch oder plane Meetings, um Stories zu generieren.</p>
          <p className="neuro-empty-encouragement">Jede Aktivität wird Teil deiner Geschichte.</p>
        </div>
      ) : (
        <div className="stories-grid neuro-flow-list">
          {stories.map(story => (
            <div
              key={story.id}
              className="story-card"
              onClick={() => {
                setSelectedStory(story);
                setCurrentItemIndex(0);
              }}
            >
              <div className="story-cover">
                {story.cover_image ? (
                  <img src={story.cover_image} alt={story.title} />
                ) : (
                  <div className="story-cover-placeholder">
                    <span>{story.items.length}</span>
                    <span className="items-label">Einträge</span>
                  </div>
                )}
                <div className="story-overlay">
                  <span className="story-date">{formatDate(story.date)}</span>
                </div>
              </div>
              <div className="story-info">
                <h3>{story.title}</h3>
                <div className="story-items-preview">
                  {story.items.slice(0, 3).map((item, i) => (
                    <span key={i} className="item-type">{getTypeIcon(item.type)}</span>
                  ))}
                  {story.items.length > 3 && (
                    <span className="more-items">+{story.items.length - 3}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Story Viewer Modal */}
      {selectedStory && (
        <div className="story-viewer" onClick={() => setSelectedStory(null)}>
          <div className="story-viewer-content" onClick={e => e.stopPropagation()}>
            {/* Progress Bar */}
            <div className="story-progress">
              {selectedStory.items.map((_, i) => (
                <div
                  key={i}
                  className={`progress-segment ${i < currentItemIndex ? 'completed' : ''} ${i === currentItemIndex ? 'active' : ''}`}
                />
              ))}
            </div>

            {/* Header */}
            <div className="story-viewer-header">
              <span className="story-viewer-date">{formatDate(selectedStory.date)}</span>
              <button className="close-btn" onClick={() => setSelectedStory(null)}>✕</button>
            </div>

            {/* Current Item */}
            {selectedStory.items[currentItemIndex] && (
              <div className="story-item">
                <div className="story-item-type">
                  {getTypeIcon(selectedStory.items[currentItemIndex].type)}
                </div>
                <h2>{selectedStory.items[currentItemIndex].title}</h2>
                <p>{selectedStory.items[currentItemIndex].summary}</p>
                {selectedStory.items[currentItemIndex].thumbnail && (
                  <img
                    src={selectedStory.items[currentItemIndex].thumbnail}
                    alt=""
                    className="story-item-thumbnail"
                  />
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="story-navigation">
              <button
                className="nav-btn prev"
                onClick={handlePrevItem}
                disabled={currentItemIndex === 0 && stories.findIndex(s => s.id === selectedStory.id) === 0}
              >
                ←
              </button>
              <span className="nav-counter">
                {currentItemIndex + 1} / {selectedStory.items.length}
              </span>
              <button
                className="nav-btn next"
                onClick={handleNextItem}
              >
                →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

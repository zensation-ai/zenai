import { useState } from 'react';
import axios from 'axios';
import './ResearchTeaser.css';

interface ResearchTeaserProps {
  research: {
    id: string;
    teaser_title: string | null;
    teaser_text: string | null;
    status: string;
  };
  context: string;
  onDismiss?: () => void;
}

export function ResearchTeaser({ research, context, onDismiss }: ResearchTeaserProps) {
  const [expanded, setExpanded] = useState(false);
  const [fullResearch, setFullResearch] = useState<{
    research_query: string;
    research_results: Array<{ title: string; snippet: string; link: string }>;
    summary: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleExpand = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }

    if (!fullResearch) {
      setLoading(true);
      try {
        const response = await axios.get(`/api/${context}/research/${research.id}`);
        setFullResearch(response.data.research);

        // Mark as viewed
        await axios.put(`/api/${context}/research/${research.id}/viewed`);
      } catch (error) {
        console.error('Failed to load research:', error);
      } finally {
        setLoading(false);
      }
    }

    setExpanded(true);
  };

  const handleDismiss = async () => {
    try {
      await axios.put(`/api/${context}/research/${research.id}/dismiss`);
      onDismiss?.();
    } catch (error) {
      console.error('Failed to dismiss research:', error);
    }
  };

  if (!research.teaser_title && !research.teaser_text) {
    return null;
  }

  return (
    <div className={`research-teaser ${expanded ? 'expanded' : ''}`}>
      <div className="teaser-header" onClick={handleExpand}>
        <span className="teaser-icon">🔍</span>
        <div className="teaser-content">
          <span className="teaser-label">Recherche vorbereitet</span>
          {research.teaser_title && (
            <h4 className="teaser-title">{research.teaser_title}</h4>
          )}
          {!expanded && research.teaser_text && (
            <p className="teaser-text">{research.teaser_text}</p>
          )}
        </div>
        <div className="teaser-actions">
          <button
            type="button"
            className="expand-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleExpand();
            }}
            aria-label={expanded ? 'Einklappen' : 'Erweitern'}
          >
            {loading ? '...' : expanded ? '−' : '+'}
          </button>
          <button
            type="button"
            className="dismiss-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
            aria-label="Recherche ablehnen"
          >
            ×
          </button>
        </div>
      </div>

      {expanded && fullResearch && (
        <div className="teaser-details">
          <div className="research-query">
            <strong>Suchanfrage:</strong> {fullResearch.research_query}
          </div>

          {fullResearch.summary && (
            <div className="research-summary">
              <strong>Zusammenfassung:</strong>
              <p>{fullResearch.summary}</p>
            </div>
          )}

          {fullResearch.research_results && fullResearch.research_results.length > 0 && (
            <div className="research-results">
              <strong>Quellen:</strong>
              <ul>
                {fullResearch.research_results.slice(0, 5).map((result, i) => (
                  <li key={i}>
                    <a href={result.link} target="_blank" rel="noopener noreferrer">
                      {result.title}
                    </a>
                    {result.snippet && <p className="result-snippet">{result.snippet}</p>}
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

export default ResearchTeaser;

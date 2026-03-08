/**
 * LocationAutocomplete - Phase 41
 *
 * Smart location input with Google Maps Places autocomplete suggestions.
 * Falls back to a plain text input when Maps API is not available.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';
import './LocationAutocomplete.css';

interface PlaceSuggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect?: (place: { placeId: string; description: string; lat?: number; lng?: number }) => void;
  context: string;
  placeholder?: string;
  id?: string;
}

export function LocationAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  context,
  placeholder = 'z.B. Buero, Zoom, ...',
  id = 'event-location',
}: LocationAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch suggestions with debounce
  const fetchSuggestions = useCallback(async (input: string) => {
    if (input.length < 2) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const res = await axios.get(`/api/${context}/maps/autocomplete`, {
        params: { input },
      });
      if (res.data.success) {
        setSuggestions(res.data.data || []);
      }
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [context]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setSelectedIndex(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(newValue);
    }, 300);

    setShowSuggestions(true);
  }, [onChange, fetchSuggestions]);

  const handleSelect = useCallback(async (suggestion: PlaceSuggestion) => {
    onChange(suggestion.description);
    setShowSuggestions(false);
    setSuggestions([]);

    // Optionally geocode the selected place
    if (onPlaceSelect) {
      try {
        const res = await axios.post(`/api/${context}/maps/geocode`, {
          address: suggestion.description,
        });
        if (res.data.success && res.data.data) {
          onPlaceSelect({
            placeId: suggestion.placeId,
            description: suggestion.description,
            lat: res.data.data.lat,
            lng: res.data.data.lng,
          });
        } else {
          onPlaceSelect({ placeId: suggestion.placeId, description: suggestion.description });
        }
      } catch {
        onPlaceSelect({ placeId: suggestion.placeId, description: suggestion.description });
      }
    }
  }, [onChange, onPlaceSelect, context]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  }, [showSuggestions, suggestions, selectedIndex, handleSelect]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="location-autocomplete" ref={containerRef}>
      <div className="location-autocomplete__input-wrapper">
        <input
          id={id}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={showSuggestions}
          aria-autocomplete="list"
          aria-controls="location-suggestions"
        />
        {loading && <span className="location-autocomplete__spinner" />}
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <ul id="location-suggestions" className="location-autocomplete__list" role="listbox">
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.placeId}
              className={`location-autocomplete__item ${index === selectedIndex ? 'location-autocomplete__item--selected' : ''}`}
              role="option"
              aria-selected={index === selectedIndex}
              onClick={() => handleSelect(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="location-autocomplete__item-icon">{'\uD83D\uDCCD'}</span>
              <div className="location-autocomplete__item-text">
                <span className="location-autocomplete__item-main">{suggestion.mainText}</span>
                <span className="location-autocomplete__item-secondary">{suggestion.secondaryText}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

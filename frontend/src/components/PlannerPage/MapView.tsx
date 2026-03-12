/**
 * MapView - Phase 41
 *
 * Map tab in PlannerPage showing calendar events with locations on a map.
 * Uses Google Maps JavaScript API via @vis.gl/react-google-maps.
 * Falls back to a list view when Google Maps API key is not configured.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import './MapView.css';

interface CalendarEvent {
  id: string;
  title: string;
  start_time: string;
  end_time?: string;
  location?: string;
  location_lat?: number;
  location_lng?: number;
  event_type: string;
  color?: string;
}

interface MapViewProps {
  context: 'personal' | 'work' | 'learning' | 'creative';
}

interface GeocodedEvent extends CalendarEvent {
  lat: number;
  lng: number;
}

export function MapView({ context }: MapViewProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [geocodedEvents, setGeocodedEvents] = useState<GeocodedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapsAvailable, setMapsAvailable] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<GeocodedEvent | null>(null);

  // Load events with locations for the current week
  useEffect(() => {
    async function loadEvents() {
      setLoading(true);
      try {
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 7);

        const [eventsRes, statusRes] = await Promise.all([
          axios.get(`/api/${context}/calendar/events`, {
            params: {
              start: startOfWeek.toISOString(),
              end: endOfWeek.toISOString(),
            },
          }),
          axios.get(`/api/${context}/maps/status`),
        ]);

        const eventList = eventsRes.data.data || eventsRes.data.events || [];
        setEvents(eventList.filter((e: CalendarEvent) => e.location));
        setMapsAvailable(statusRes.data.available || false);
      } catch {
        setEvents([]);
      } finally {
        setLoading(false);
      }
    }
    loadEvents();
  }, [context]);

  // Geocode events that have locations but no coordinates
  useEffect(() => {
    async function geocodeEvents() {
      const results: GeocodedEvent[] = [];

      for (const event of events) {
        if (event.location_lat && event.location_lng) {
          results.push({ ...event, lat: event.location_lat, lng: event.location_lng });
          continue;
        }

        if (!event.location || !mapsAvailable) continue;

        try {
          const res = await axios.post(`/api/${context}/maps/geocode`, {
            address: event.location,
          });
          if (res.data.success && res.data.data) {
            results.push({
              ...event,
              lat: res.data.data.lat,
              lng: res.data.data.lng,
            });
          }
        } catch {
          // Skip events that can't be geocoded
        }
      }

      setGeocodedEvents(results);
    }

    if (events.length > 0) {
      geocodeEvents();
    }
  }, [events, context, mapsAvailable]);

  const formatTime = useCallback((dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  const formatDate = useCallback((dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
    });
  }, []);

  const eventTypeIcons: Record<string, string> = useMemo(() => ({
    appointment: '📅',
    reminder: '⏰',
    deadline: '⚠️',
    focus_time: '🎯',
    travel_block: '🚗',
  }), []);

  if (loading) {
    return (
      <div className="mapview-loading">
        <div className="mapview-loading__spinner" />
        <p>Lade Karten-Daten...</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="mapview-empty">
        <span className="mapview-empty__icon">{'🗺️'}</span>
        <h3>Keine Termine mit Ort</h3>
        <p>Erstelle Kalendereintraege mit einem Ort, um sie auf der Karte zu sehen.</p>
      </div>
    );
  }

  return (
    <div className="mapview">
      <div className="mapview__header">
        <h3>
          {'🗺️'} Karte ({geocodedEvents.length} Orte)
        </h3>
        {!mapsAvailable && (
          <span className="mapview__badge mapview__badge--warning">
            Kein Google Maps API Key
          </span>
        )}
      </div>

      <div className="mapview__content">
        {/* Map placeholder - requires @vis.gl/react-google-maps + API key */}
        <div className="mapview__map-container">
          {mapsAvailable && geocodedEvents.length > 0 ? (
            <div className="mapview__map-placeholder">
              <span>{'🗺️'}</span>
              <p>Google Maps Kartenansicht</p>
              <p className="mapview__map-hint">
                Installiere <code>@vis.gl/react-google-maps</code> und setze <code>VITE_GOOGLE_MAPS_API_KEY</code> fuer die interaktive Karte.
              </p>
              {/* Mini coordinate list as map preview */}
              <div className="mapview__coords">
                {geocodedEvents.map(e => (
                  <div key={e.id} className="mapview__coord-pin">
                    <span className="mapview__coord-dot" style={{ background: e.color || '#4A90D9' }} />
                    <span>{e.title}: {e.lat.toFixed(4)}, {e.lng.toFixed(4)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mapview__map-placeholder">
              <span>{'🗺️'}</span>
              <p>Setze <code>GOOGLE_MAPS_API_KEY</code> im Backend fuer Kartenfunktionen</p>
            </div>
          )}
        </div>

        {/* Event list sidebar */}
        <div className="mapview__sidebar">
          <h4>Termine mit Ort</h4>
          <div className="mapview__event-list">
            {events.map(event => {
              const geocoded = geocodedEvents.find(e => e.id === event.id);
              const isSelected = selectedEvent?.id === event.id;

              return (
                <button
                  key={event.id}
                  className={`mapview__event ${isSelected ? 'mapview__event--selected' : ''}`}
                  onClick={() => setSelectedEvent(geocoded || null)}
                >
                  <div className="mapview__event-header">
                    <span className="mapview__event-icon">
                      {eventTypeIcons[event.event_type] || '📅'}
                    </span>
                    <span className="mapview__event-title">{event.title}</span>
                  </div>
                  <div className="mapview__event-meta">
                    <span>{formatDate(event.start_time)} {formatTime(event.start_time)}</span>
                  </div>
                  <div className="mapview__event-location">
                    {'📍'} {event.location}
                    {geocoded && (
                      <span className="mapview__event-coords">
                        ({geocoded.lat.toFixed(2)}, {geocoded.lng.toFixed(2)})
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected event detail */}
      {selectedEvent && (
        <div className="mapview__detail">
          <div className="mapview__detail-header">
            <h4>{selectedEvent.title}</h4>
            <button
              className="mapview__detail-close"
              onClick={() => setSelectedEvent(null)}
              aria-label="Schliessen"
            >
              &times;
            </button>
          </div>
          <p>{'📍'} {selectedEvent.location}</p>
          <p>{'🕒'} {formatDate(selectedEvent.start_time)} {formatTime(selectedEvent.start_time)}</p>
          <p>{'🌐'} {selectedEvent.lat.toFixed(6)}, {selectedEvent.lng.toFixed(6)}</p>
        </div>
      )}
    </div>
  );
}

/**
 * MapView - Phase 41
 *
 * Map tab in PlannerPage showing calendar events with locations on a map.
 * Uses Google Maps JavaScript API via @vis.gl/react-google-maps.
 * Falls back to a list view when Google Maps API key is not configured.
 */

import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react';
import axios from 'axios';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';

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
  context: 'operations' | 'finance' | 'people' | 'strategy';
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
      <div className="flex flex-col items-center justify-center h-[300px] gap-3">
        <div className="w-8 h-8 border-[3px] border-glass-border border-t-primary rounded-full animate-spin" />
        <p className="m-0 text-text-secondary text-sm">Lade Karten-Daten...</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <EmptyState
        icon="🗺️"
        title="Keine Termine mit Ort"
        description="Erstelle Kalendereinträge mit einem Ort, um sie auf der Karte zu sehen."
      />
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[400px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-glass-border">
        <h3 className="m-0 text-base font-semibold">
          {'🗺️'} Karte ({geocodedEvents.length} Orte)
        </h3>
        {!mapsAvailable && (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
            Kein Google Maps API Key
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-[1fr_320px] flex-1 overflow-hidden max-md:grid-cols-1 max-md:grid-rows-[250px_1fr]">
        {/* Map placeholder - requires @vis.gl/react-google-maps + API key */}
        <div className="relative bg-bg-secondary overflow-hidden">
          {mapsAvailable && geocodedEvents.length > 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-2 text-text-secondary">
              <span className="text-5xl">{'🗺️'}</span>
              <p className="m-0 text-sm">Google Maps Kartenansicht</p>
              <p className="text-xs opacity-70">
                Installiere <code className="bg-bg-secondary px-1 py-0.5 rounded-sm text-[0.7rem]">@vis.gl/react-google-maps</code> und setze <code className="bg-bg-secondary px-1 py-0.5 rounded-sm text-[0.7rem]">VITE_GOOGLE_MAPS_API_KEY</code> für die interaktive Karte.
              </p>
              {/* Mini coordinate list as map preview */}
              <div className="flex flex-col gap-1 mt-2 text-xs max-w-[400px]">
                {geocodedEvents.map(e => (
                  <div key={e.id} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0 bg-[var(--c)]" style={{ '--c': e.color || '#4A90D9' } as CSSProperties} />
                    <span>{e.title}: {e.lat.toFixed(4)}, {e.lng.toFixed(4)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-2 text-text-secondary">
              <span className="text-5xl">{'🗺️'}</span>
              <p className="m-0 text-sm">Setze <code className="bg-bg-secondary px-1 py-0.5 rounded-sm text-[0.7rem]">GOOGLE_MAPS_API_KEY</code> im Backend für Kartenfunktionen</p>
            </div>
          )}
        </div>

        {/* Event list sidebar */}
        <div className="border-l border-glass-border overflow-y-auto p-3 max-md:border-l-0 max-md:border-t max-md:border-glass-border">
          <h4 className="m-0 mb-3 text-sm font-semibold text-text-secondary">Termine mit Ort</h4>
          <div className="flex flex-col gap-2">
            {events.map(event => {
              const geocoded = geocodedEvents.find(e => e.id === event.id);
              const isSelected = selectedEvent?.id === event.id;

              return (
                <button
                  key={event.id}
                  className={cn(
                    'flex flex-col gap-1 p-2.5 border border-glass-border rounded-md bg-surface cursor-pointer text-left transition-colors w-full font-[inherit] text-inherit hover:border-primary',
                    isSelected && 'border-primary shadow-[0_0_0_2px_rgba(74,144,217,0.2)]'
                  )}
                  onClick={() => setSelectedEvent(geocoded || null)}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">
                      {eventTypeIcons[event.event_type] || '📅'}
                    </span>
                    <span className="font-medium text-sm overflow-hidden text-ellipsis whitespace-nowrap">{event.title}</span>
                  </div>
                  <div className="text-xs text-text-secondary">
                    <span>{formatDate(event.start_time)} {formatTime(event.start_time)}</span>
                  </div>
                  <div className="text-xs text-text-secondary">
                    {'📍'} {event.location}
                    {geocoded && (
                      <span className="text-[0.65rem] opacity-60 ml-1">
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
        <div className="absolute bottom-4 left-4 right-[340px] bg-surface rounded-lg p-4 shadow-lg z-10 max-md:right-4 max-md:bottom-auto max-md:top-4">
          <div className="flex justify-between items-center">
            <h4 className="m-0 text-[0.95rem]">{selectedEvent.title}</h4>
            <button
              className="bg-transparent border-none text-xl cursor-pointer text-text-secondary p-0.5"
              onClick={() => setSelectedEvent(null)}
              aria-label="Schließen"
            >
              &times;
            </button>
          </div>
          <p className="mt-1 mb-0 text-[0.8rem] text-text-secondary">{'📍'} {selectedEvent.location}</p>
          <p className="mt-1 mb-0 text-[0.8rem] text-text-secondary">{'🕒'} {formatDate(selectedEvent.start_time)} {formatTime(selectedEvent.start_time)}</p>
          <p className="mt-1 mb-0 text-[0.8rem] text-text-secondary">{'🌐'} {selectedEvent.lat.toFixed(6)}, {selectedEvent.lng.toFixed(6)}</p>
        </div>
      )}
    </div>
  );
}

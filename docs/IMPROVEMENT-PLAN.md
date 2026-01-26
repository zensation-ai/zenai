# KI-AB Improvement Plan

**Erstellt:** 2026-01-26
**Status:** In Bearbeitung
**Priorität:** Kritisch → Hoch → Mittel → Niedrig

---

## Executive Summary

Nach umfassender Code-Analyse wurden **9 Hauptprobleme** identifiziert, die in 4 Prioritätsstufen eingeteilt sind. Die kritischen Probleme sind echte Bugs/Race Conditions, die sofort behoben werden müssen.

---

## 🔴 KRITISCH (Bugs / Race Conditions)

### 1. Globaler Tool Context (Race Condition)
**Datei:** `backend/src/services/tool-handlers.ts:34`

**Problem:**
```typescript
let currentContext: AIContext = 'personal';  // GLOBAL!
export function setToolContext(context: AIContext): void {
  currentContext = context;  // Race Condition bei parallelen Requests
}
```

**Impact:** Bei 2 parallelen Requests kann User A's Suche User B's Ideen finden.

**Lösung:** Request-scoped Context über Express `res.locals`

**Aufwand:** ~30 Minuten

---

### 2. Secrets Manager Init zu spät
**Datei:** `backend/src/main.ts`

**Problem:** Secrets werden NACH `app.listen()` validiert - Server läuft bereits ohne validierte Konfiguration.

**Lösung:** Secrets vor Server-Start initialisieren

**Aufwand:** ~15 Minuten

---

### 3. Frontend Streaming nicht implementiert
**Datei:** `frontend/src/components/GeneralChat.tsx`

**Problem:**
- Backend unterstützt SSE Streaming (`/messages/stream`)
- Frontend nutzt nur synchrones POST (`/messages`)
- Benutzer wartet 3-10 Sekunden auf komplette Antwort

**Lösung:** EventSource/fetch mit ReadableStream für Token-by-Token Display

**Aufwand:** ~2 Stunden

---

## 🟠 HOCH (Skalierbarkeit)

### 4. In-Memory Working Memory
**Datei:** `backend/src/services/memory/working-memory.ts`

**Problem:**
```typescript
private states: Map<string, WorkingMemoryState> = new Map();
// Daten verloren bei Restart, nicht geteilt zwischen Nodes
```

**Lösung:** Redis-backed Implementation mit TTL

**Aufwand:** ~2 Stunden (wenn Redis bereits vorhanden)

---

### 5. Memory Scheduler ohne Distributed Lock
**Datei:** `backend/src/services/memory/memory-scheduler.ts`

**Problem:** Bei 3 Nodes → alle 3 führen Consolidation aus → Datenverlust/Duplikate

**Lösung:** Redlock für Distributed Locking

**Aufwand:** ~1 Stunde

---

## 🟡 MITTEL (Code-Qualität)

### 6. App.tsx zu groß (1313 Zeilen)
**Datei:** `frontend/src/App.tsx`

**Problem:**
- 21+ useState Hooks
- Zu viele Verantwortlichkeiten
- Schwer wartbar

**Lösung:** Aufteilen in:
- `IdeaListContainer`
- `NavigationContainer`
- `InputContainer`

**Aufwand:** ~3 Stunden

---

### 7. TypeScript any-Casts
**Dateien:** Diverse Backend-Routes

**Problem:** ~50 implizite `any` Types in Callback-Funktionen

**Lösung:** Explizite Typisierung

**Aufwand:** ~1 Stunde

---

## 🟢 NIEDRIG (Nice-to-have)

### 8. Error Boundaries erweitern
**Datei:** `frontend/src/components/ErrorBoundary.tsx`

**Problem:** Nur 1 Error Boundary auf Seiten-Level

**Lösung:** Granulare Error Boundaries für kritische Komponenten

**Aufwand:** ~1 Stunde

---

### 9. CSS Modularisierung
**Datei:** `frontend/src/App.css` (2454 Zeilen)

**Problem:** Monolithische CSS-Datei

**Lösung:** CSS Modules oder komponenten-spezifische Dateien

**Aufwand:** ~4 Stunden

---

## Implementierungs-Reihenfolge

| # | Task | Priorität | Status |
|---|------|-----------|--------|
| 1 | Tool Context Fix | 🔴 KRITISCH | ⏳ |
| 2 | Secrets Manager Fix | 🔴 KRITISCH | ⏳ |
| 3 | Frontend Streaming | 🔴 KRITISCH | ⏳ |
| 4 | Working Memory Redis | 🟠 HOCH | ⏳ |
| 5 | Distributed Lock | 🟠 HOCH | ⏳ |
| 6 | App.tsx Refactor | 🟡 MITTEL | ⏳ |
| 7 | TypeScript Fixes | 🟡 MITTEL | ⏳ |
| 8 | Error Boundaries | 🟢 NIEDRIG | ⏳ |

---

## Geschätzter Gesamtaufwand

- **Kritisch:** ~3 Stunden
- **Hoch:** ~3 Stunden
- **Mittel:** ~4 Stunden
- **Niedrig:** ~5 Stunden

**Total:** ~15 Stunden für vollständige Überarbeitung

---

## Abgeschlossene Fixes (2026-01-26)

### ✅ KRITISCH #1: Tool Context Race Condition
**Status:** Behoben
**Dateien:**
- `backend/src/services/claude/tool-use.ts` - Neuer `ToolExecutionContext` Type
- `backend/src/services/tool-handlers.ts` - Alle Handler nutzen jetzt Request-scoped Context
- `backend/src/services/general-chat.ts` - Context wird korrekt durchgereicht

### ✅ KRITISCH #2: Secrets Manager Init
**Status:** Behoben
**Datei:** `backend/src/main.ts`
- Neue `startServer()` async Funktion
- Secrets werden vor `app.listen()` validiert

### ✅ KRITISCH #3: Frontend SSE Streaming
**Status:** Implementiert
**Dateien:**
- `frontend/src/components/GeneralChat.tsx` - Vollständiges SSE-Streaming für Text-Nachrichten
- `frontend/src/components/GeneralChat.css` - Streaming-Styles (Cursor, Thinking-Block)

---

## Bekannte Skalierungslimitierungen

### Working Memory (Multi-Instance)
**Problem:** Bei horizontaler Skalierung (mehrere Node-Instances) wird Working Memory nicht geteilt.

**Workaround:** Die bestehende `persist()` und `load()` Methoden nutzen bereits die Datenbank.

**Langfristige Lösung:** Redis-backed Implementation mit:
```typescript
// Beispiel für zukünftige Redis-Integration
const redisKey = `wm:${sessionId}`;
await cache.set(redisKey, state, 1800); // 30min TTL
```

### Memory Scheduler (Multi-Instance)
**Problem:** Scheduler läuft auf jeder Instance parallel.

**Lösung benötigt:** Redlock für Distributed Locking:
```typescript
const lock = await redlock.lock(['memory:consolidation'], 3600000);
try {
  await consolidateMemory();
} finally {
  await lock.unlock();
}
```

---

## Nächste Schritte

1. Tests für die neuen Streaming-Features
2. E2E-Tests für kritische Chat-Flows
3. Performance-Monitoring für Streaming-Latenz
4. Redis-Integration für Working Memory (wenn Skalierung benötigt)

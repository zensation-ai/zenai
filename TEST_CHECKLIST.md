# 🧪 Test Checklist - App Lauffähigkeit

## ✅ Backend (Railway) - FUNKTIONIERT
- [x] Online und erreichbar
- [x] GET /api/ideas - Liste abrufen
- [x] POST /api/ideas/search - Semantic Search
- [x] GET /api/ideas/recommendations - Empfehlungen
- [x] GET /api/ideas/:id/similar - Ähnliche Ideas
- [x] Supabase Connection
- [x] Redis Connection

## ✅ iOS App Konfiguration - FUNKTIONIERT
- [x] Production URL gesetzt
- [x] iPhone → Railway Backend
- [x] Mac Simulator → localhost
- [x] Search Endpoint implementiert
- [x] Auto Context Switching

## 🔄 Synchronisation - ZU TESTEN

### iPhone → Backend:
- [ ] Voice Memo aufnehmen und hochladen
- [ ] Idea wird im Backend gespeichert
- [ ] Idea erscheint in der Liste

### Backend → iPhone:
- [ ] Ideas vom Backend abrufen
- [ ] Liste aktualisiert sich
- [ ] Offline-Modus funktioniert

### Mac Simulator → Backend:
- [ ] localhost:3000 läuft
- [ ] Verbindung zum Backend
- [ ] Synchronisation mit Production

## 🎯 Was muss getestet werden?

### 1. Backend lokal starten (für Mac Simulator)
```bash
cd backend
npm run dev
```

### 2. iOS App auf iPhone testen
- App auf iPhone starten
- Voice Memo aufnehmen
- Prüfen ob Idea gespeichert wird
- Backend checken: `curl https://ki-ab-production.up.railway.app/api/ideas`

### 3. iOS App auf Mac Simulator testen
- Backend lokal starten
- Simulator öffnen
- Gleiche Tests wie auf iPhone

## ❓ Mögliche Probleme

### Connection-Reset-Fehler behoben?
- [x] Supabase Function erstellt
- [x] Alle Endpoints funktionieren
- [ ] App neu gestartet und getestet

### Offline-Modus?
- LocalStorageService ist implementiert
- OfflineQueueService ist implementiert
- Funktioniert es in der Praxis?

### Embedding-Generation?
- Ollama/OpenAI für Embeddings konfiguriert?
- Redis cached Embeddings?
- Semantic Search funktioniert nur mit Embeddings

## 🚀 Nächste Schritte

1. **App auf iPhone neu starten**
   - Connection-Reset-Fehler sollten weg sein

2. **Voice Memo testen**
   - Erste Idea erstellen
   - Backend-Synchronisation prüfen

3. **Semantic Search testen**
   - Sobald Ideas mit Embeddings vorhanden
   - Search-Feature in der App nutzen

4. **Mac-iPhone Sync prüfen**
   - Idea auf Mac erstellen
   - Auf iPhone prüfen ob sie erscheint
   - Und umgekehrt

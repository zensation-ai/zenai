# Personal AI Brain - iOS App Installation

## 🎯 Quick Start

Die App ist fertig und kann jetzt auf dein iPhone installiert werden!

## 📋 Voraussetzungen

- ✅ iPhone mit iOS 17.0 oder höher
- ✅ Mac und iPhone im gleichen WLAN
- ✅ USB-Kabel zum Verbinden von iPhone und Mac
- ✅ Xcode ist installiert
- ✅ Backend läuft auf dem Mac

## 🚀 Installation

### Option 1: Über Xcode (Empfohlen)

1. **iPhone anschließen**
   - Verbinde dein iPhone per USB-Kabel mit dem Mac
   - Entsperre das iPhone
   - Bei der Frage "Diesem Computer vertrauen?" → **Vertrauen** antippen

2. **Xcode öffnen**
   ```bash
   open ios/PersonalAIBrain.xcodeproj
   ```

3. **iPhone als Ziel wählen**
   - Oben in der Xcode-Toolbar neben dem Play-Button (▶️)
   - Wähle dein iPhone aus der Liste

4. **App installieren**
   - Klicke auf den **Play-Button** (▶️)
   - Xcode baut die App und installiert sie auf dem iPhone
   - Dauer: ca. 30 Sekunden

5. **Erstes Mal: Entwickler-Zertifikat vertrauen**
   - Gehe auf dem iPhone zu: **Einstellungen**
   - → **Allgemein**
   - → **VPN & Geräteverwaltung**
   - → Tippe auf **"Alexander Bering"**
   - → Tippe auf **"Alexander Bering vertrauen"**
   - → Bestätige mit **"Vertrauen"**

6. **App öffnen**
   - Die App heißt **"AI Brain"**
   - Öffne sie vom Home-Screen

### Option 2: Über Command Line

```bash
# iPhone per USB anschließen, dann:
cd /Users/alexanderbering/Projects/KI-AB
xcodebuild -project ios/PersonalAIBrain.xcodeproj \
  -scheme PersonalAIBrain \
  -destination 'generic/platform=iOS' \
  -allowProvisioningUpdates \
  build
```

## 🔧 Backend-Konfiguration

Das Backend ist bereits korrekt konfiguriert:

- **Backend-URL:** `http://192.168.212.104:3000`
- **IP-Adresse:** Automatisch erkannt
- **Netzwerk:** iPhone und Mac müssen im **gleichen WLAN** sein

### Backend starten (falls nicht läuft)

```bash
cd /Users/alexanderbering/Projects/KI-AB
./start-app.sh
```

## 📱 App-Features

### 🎤 Sprachaufnahme
- Tippe auf den Aufnahme-Button
- Sprich deine Idee
- Wird automatisch transkribiert und strukturiert
- Mit Whisper (Deutsch-optimiert)

### 💡 Ideen-Liste
- Alle deine Ideen auf einen Blick
- Filter nach Typ (Task, Idee, Problem, etc.)
- Swipe-Aktionen zum Löschen
- Offline-Modus verfügbar

### 🔍 Semantische Suche
- Suche nach Bedeutung, nicht nur Wörtern
- Findet ähnliche Ideen
- Powered by Ollama Embeddings

### 📊 Features
- **Offline-Modus:** App funktioniert auch ohne Verbindung
- **Sync:** Automatische Synchronisation wenn online
- **Schöne UI:** Midnight Dark Theme mit Orange Akzenten
- **Animationen:** Smooth AI Brain Indikator

## 🐛 Debugging

Die App hat umfangreiche Debug-Ausgaben. So siehst du sie:

### In Xcode Console
1. iPhone per USB verbunden haben
2. App in Xcode starten (▶️)
3. Unten in Xcode siehst du die Console
4. Suche nach Emojis: 📱, 🌐, ✅, ❌

### Debug-Ausgaben
```
📱 APIService: Using http://192.168.212.104:3000 (Real Device)
🌐 Fetching from: http://192.168.212.104:3000/api/ideas
📡 Response status: 200
✅ Successfully loaded 11 ideas
```

## ❗ Problemlösung

### "Keine Verbindung zum Internet"

**Checkliste:**
- [ ] Backend läuft: `curl http://localhost:3000/api/health`
- [ ] iPhone und Mac im gleichen WLAN
- [ ] IP-Adresse stimmt: `ipconfig getifaddr en0`
- [ ] Firewall blockiert nicht Port 3000
- [ ] In iOS-Einstellungen: **AI Brain** → **Lokales Netzwerk** → **Erlauben**

**Debug:**
```bash
# Backend-Health prüfen
curl http://192.168.212.104:3000/api/health

# IP-Adresse prüfen
ipconfig getifaddr en0

# Port prüfen
lsof -i :3000
```

### App läuft nur 7 Tage

Mit kostenlosem Apple Developer Account läuft die App 7 Tage. Danach:
- Neu in Xcode installieren (▶️)
- Oder: Für $99/Jahr Apple Developer Program beitreten

### "Entwickler nicht vertraut"

Gehe zu: **Einstellungen** → **Allgemein** → **VPN & Geräteverwaltung** → **Alexander Bering vertrauen**

## 📊 Technische Details

### App-Architektur
- **SwiftUI:** Moderne iOS UI
- **MVVM:** Clean Architecture
- **Async/Await:** Moderne Concurrency
- **Codable:** Type-safe JSON

### Services
- **APIService:** Alle Backend-Kommunikation
- **AudioRecorderService:** Mikrofon-Aufnahme
- **LocalStorageService:** Offline-Speicherung
- **OfflineQueueService:** Sync-Queue

### Models
- **Idea:** Kern-Datenmodell
- **Meeting:** Meeting-Notes
- **UserProfile:** User-Stats

## 🎨 App-Icon

Das App-Icon zeigt ein stilisiertes Gehirn:
- Orange Gehirn (#ff6b35) auf dunklem Hintergrund
- Neural-Netzwerk-Visualisierung
- Konsistent mit Web-App Design

## 🔒 Sicherheit

- **Lokales Netzwerk:** Keine Cloud, alles lokal
- **HTTPS:** Nicht nötig (lokales Netzwerk)
- **Permissions:**
  - Mikrofon (für Sprachaufnahme)
  - Lokales Netzwerk (für Backend-Verbindung)

## 📝 Logs ansehen

### System Logs
```bash
# Live-Logs vom iPhone
log stream --predicate 'process == "PersonalAIBrain"' --level info
```

### Xcode Console
- Window → Devices and Simulators
- Wähle dein iPhone
- "View Device Logs"

## 🚀 Updates

Bei Code-Änderungen:
```bash
# In Xcode: Einfach Play (▶️) drücken
# Oder via CLI:
cd /Users/alexanderbering/Projects/KI-AB
xcodebuild -project ios/PersonalAIBrain.xcodeproj \
  -scheme PersonalAIBrain \
  -destination 'generic/platform=iOS' \
  -allowProvisioningUpdates \
  build
```

## 📞 Support

Bei Problemen:
1. Prüfe Backend: `curl http://192.168.212.104:3000/api/health`
2. Prüfe Netzwerk: iPhone und Mac im gleichen WLAN
3. Prüfe Logs in Xcode Console
4. Neu installieren: Play-Button in Xcode

---

**Viel Spaß mit deiner Personal AI Brain App! 🧠**

# TestFlight Quick-Start Checkliste

> **Schnellanleitung für TestFlight Upload - ca. 1-2 Stunden**

---

## ✅ Vorbereitung (bereits erledigt!)

- ✅ Info.plist konfiguriert (Privacy Descriptions, ATS)
- ✅ Bundle ID: `de.personal.aibrain`
- ✅ Version: 1.0, Build: 1
- ✅ Backend produktionsbereit auf Railway
- ✅ OpenAI Integration aktiv

---

## 🎯 Deine TODO-Liste

### □ Schritt 1: Bundle ID registrieren (5 Min)

**URL:** https://developer.apple.com/account/resources/identifiers/list

1. Klick **"+"**
2. **App IDs** → **App**
3. Bundle ID: `de.personal.aibrain`
4. **Register**

---

### □ Schritt 2: App in App Store Connect erstellen (5 Min)

**URL:** https://appstoreconnect.apple.com/apps

1. **"+"** → **New App**
2. Name: **AI Brain**
3. Bundle ID: `de.personal.aibrain`
4. SKU: `de.personal.aibrain.v1`
5. **Create**

---

### □ Schritt 3: Xcode Archive erstellen (10 Min)

**Terminal:**
```bash
cd /Users/alexanderbering/Projects/KI-AB/ios
open PersonalAIBrain.xcodeproj
```

**In Xcode:**
1. Target → Signing → Dein Team auswählen
2. **Gerät anschließen** ODER "Any iOS Device" wählen
3. **Product → Archive** (⌘B → Archive)
4. Warte auf Organizer-Fenster

---

### □ Schritt 4: Upload zu App Store Connect (15 Min)

**Im Organizer:**
1. **Distribute App**
2. **App Store Connect** → **Upload**
3. **Automatically manage signing**
4. **Upload** (dauert 10-30 Min)
5. Warte auf Email von Apple

---

### □ Schritt 5: TestFlight aktivieren (10 Min)

**App Store Connect → TestFlight:**

1. Warte bis Build "Ready to Submit"
2. Build anklicken → **Test Information**
3. **Export Compliance:**
   - Uses encryption? **YES**
   - Exempt encryption? **YES**
4. **Save**

---

### □ Schritt 6: Tester hinzufügen (5 Min)

**TestFlight → Internal Testing:**

1. **"+"** → **Create Group**
2. Name: "Beta Testers"
3. Email-Adressen hinzufügen
4. **Enable Automatic Distribution**
5. Build zuweisen

**Fertig!** Tester bekommen Email mit TestFlight-Link.

---

## 🚨 Schnelle Hilfe bei Problemen

| Problem | Lösung |
|---------|--------|
| "No signing certificate" | Xcode → Preferences → Accounts → Download Manual Profiles |
| "Bundle ID already in use" | Anderer Bundle ID: `com.alexanderbering.PersonalAIBrain` |
| "Build failed" | Product → Clean Build Folder, dann neu archivieren |
| "Missing Compliance" | TestFlight → Build → Export Compliance ausfüllen |

---

## 📚 Ausführliche Dokumentation

Siehe [TESTFLIGHT_SETUP.md](TESTFLIGHT_SETUP.md) für:
- Detaillierte Schritt-für-Schritt Anleitung
- Screenshots & Konfigurationsdetails
- App Store Submission nach Beta-Testing
- Troubleshooting & Best Practices

---

**Zeitaufwand:** Ca. 50 Minuten Arbeit + 30 Min Wartezeit für Upload/Processing

**Support:** Bei Fragen siehe Apple Developer Documentation oder TESTFLIGHT_SETUP.md

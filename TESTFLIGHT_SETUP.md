# iOS TestFlight Setup Guide

> **Ziel:** PersonalAIBrain App via TestFlight für Beta-Testing bereitstellen
> **Erstellt:** 9. Januar 2026
> **Voraussetzung:** Apple Developer Account ($99/Jahr)

---

## ✅ Bereits vorbereitet

Die App ist **vollständig konfiguriert** für den App Store:

- ✅ **Bundle Identifier:** `de.personal.aibrain`
- ✅ **Version:** 1.0 (Build 1)
- ✅ **Privacy Descriptions:**
  - Mikrofon: "Die App benötigt Zugriff auf das Mikrofon, um Sprachmemos aufzunehmen und zu transkribieren."
  - Kamera: "Die App benötigt Zugriff auf die Kamera, um Fotos und Videos von Ideen aufzunehmen."
  - Fotomediathek: "Die App benötigt Zugriff auf deine Fotos, um Bilder zu deinen Ideen hinzuzufügen."
- ✅ **App Transport Security:** Nur HTTPS erlaubt, Railway-Domain whitelisted
- ✅ **App Name:** "AI Brain"
- ✅ **Backend:** Production-ready auf Railway (https://ki-ab-production.up.railway.app)

---

## 📋 TestFlight Setup (Schritt-für-Schritt)

### Phase 1: App Store Connect Vorbereitung

#### 1.1 Bundle ID registrieren (5 Min)

**Website:** https://developer.apple.com/account/resources/identifiers/list

1. Klick auf **"+"** (neuer Identifier)
2. Wähle **"App IDs"**
3. Wähle **"App"**
4. Konfiguration:
   - **Description:** PersonalAIBrain
   - **Bundle ID:** `de.personal.aibrain` (explizit, nicht Wildcard!)
   - **Capabilities:**
     - ☑️ Push Notifications (optional für später)
     - ☑️ App Groups (optional für Widget)
5. **Continue** → **Register**

#### 1.2 App in App Store Connect erstellen (5 Min)

**Website:** https://appstoreconnect.apple.com/apps

1. Klick auf **"+"** → **New App**
2. Konfiguration:
   - **Platforms:** iOS
   - **Name:** AI Brain (oder "PersonalAIBrain")
   - **Primary Language:** German (Germany)
   - **Bundle ID:** Wähle `de.personal.aibrain` aus Dropdown
   - **SKU:** `de.personal.aibrain.v1` (eindeutige ID)
   - **User Access:** Full Access
3. **Create**

#### 1.3 App Information ausfüllen

In App Store Connect → Deine App → App Information:

**Grunddaten:**
- **Name:** AI Brain
- **Subtitle:** Dein persönliches KI-Gedächtnis
- **Category:**
  - Primary: Productivity
  - Secondary: Utilities
- **Content Rights:** Keine externen Lizenzen

**Privacy Policy URL:** (Optional für TestFlight, aber empfohlen)
- Erstelle eine einfache Privacy Policy auf GitHub Pages oder deiner Website
- Beispiel: "Diese App speichert deine Ideen verschlüsselt auf einem Server. Wir geben keine Daten an Dritte weiter."

---

### Phase 2: Xcode Archive & Upload

#### 2.1 Signing & Capabilities in Xcode

1. **Öffne das Projekt:**
   ```bash
   cd /Users/alexanderbering/Projects/KI-AB/ios
   open PersonalAIBrain.xcodeproj
   ```

2. **Target → Signing & Capabilities:**
   - **Team:** Wähle deinen Apple Developer Account
   - **Signing:** Automatic
   - **Bundle Identifier:** `de.personal.aibrain` (sollte bereits gesetzt sein)
   - **Provisioning Profile:** Xcode Managed Profile

3. **Build Configuration prüfen:**
   - Menü: Product → Scheme → Edit Scheme
   - Run → Build Configuration → **Release** (für finale Builds)
   - Archive → Build Configuration → **Release**

#### 2.2 Version & Build Number

**Aktuell bereits gesetzt:**
- Version: 1.0
- Build: 1

**Für zukünftige Uploads:**
- Increment Build Number bei jedem Upload
- Increment Version bei Major Updates

In Xcode:
- Target → General → Identity
- **Version:** 1.0
- **Build:** 1 (bei jedem neuen Upload: 2, 3, 4...)

#### 2.3 Archive erstellen

1. **Verbinde ein echtes iOS-Gerät** ODER wähle **"Any iOS Device (arm64)"**
   - Simulator funktioniert NICHT für Archive!

2. **Menü → Product → Clean Build Folder** (⇧⌘K)

3. **Menü → Product → Archive** (⌘B, dann Archive)
   - Xcode kompiliert die App im Release-Modus
   - Dauert ca. 2-5 Minuten
   - Bei Erfolg öffnet sich das Organizer-Fenster

4. **Bei Fehlern:**
   - Prüfe Signing in Target Settings
   - Prüfe dass alle Swift-Dateien kompilieren
   - Prüfe Build Target: iOS 17.0

#### 2.4 Upload zu App Store Connect

**Im Organizer-Fenster (öffnet automatisch nach Archive):**

1. Wähle das neueste Archive
2. **Distribute App** Button
3. Wähle **"App Store Connect"**
4. Wähle **"Upload"** (nicht Export)
5. Konfiguration:
   - **Include bitcode:** NO (deprecated)
   - **Upload symbols:** YES (für Crash Reports)
   - **Manage Version and Build Number:** YES (Xcode macht automatisch Increment)
6. **Signing Options:**
   - Wähle **"Automatically manage signing"**
7. **Upload**
   - Dauert 5-15 Minuten je nach Internetverbindung
   - Status wird in Organizer angezeigt

8. **Bestätigungs-Email:**
   - Apple schickt Email wenn Build verarbeitet wurde
   - Dauert weitere 10-30 Minuten

---

### Phase 3: TestFlight Konfiguration

#### 3.1 Build in TestFlight aktivieren

**App Store Connect → TestFlight:**

1. Warte bis Build Status = "Ready to Submit" (nicht mehr "Processing")
2. Klick auf den Build (z.B. "1.0 (1)")
3. **Test Information ausfüllen:**
   - **What to Test:** "Erste Beta-Version. Teste Ideen-Erfassung, Sprachmemos, Personalization Chat."
   - **Tester Notes:** Optional, Hinweise für Tester
4. **Export Compliance:**
   - "Does your app use encryption?" → **YES**
   - "Does it use exempt encryption?" → **YES**
     (Standard HTTPS/TLS ist "exempt")
   - Keine weiteren Dokumente nötig
5. **Save**

#### 3.2 Interne Tester hinzufügen

**TestFlight → Internal Testing:**

1. Klick **"+"** neben "Internal Testing"
2. **Create Group:**
   - Name: "Team" oder "Beta Testers"
   - Tester hinzufügen (Email-Adressen)
3. **Enable Automatic Distribution** (empfohlen)
   - Neue Builds werden automatisch an Gruppe verteilt
4. **Add Build:** Wähle Build 1.0 (1)

**Tester erhalten:**
- Email mit TestFlight-Link
- Download TestFlight App aus App Store
- Installation der Beta-App

#### 3.3 Externe Tester (optional)

**Für mehr als 100 Tester oder öffentliche Beta:**

1. **App Store Connect → TestFlight → External Testing**
2. **"+"** → Create Group
3. **Beta App Review erforderlich:**
   - Beta App Description
   - Screenshots (1-3 Screenshots)
   - Beta App Review Notes
4. **Submit for Review**
   - Dauert 1-2 Tage
   - Dann können bis zu 10.000 externe Tester eingeladen werden

---

### Phase 4: Testing & Feedback

#### 4.1 TestFlight Feedback sammeln

**Tester können:**
- Screenshots mit Anmerkungen senden
- Crash Reports automatisch teilen
- Feedback-Formulare ausfüllen

**Du siehst in App Store Connect:**
- Anzahl Installationen
- Anzahl Sessions
- Crash Reports
- Feedback-Nachrichten

#### 4.2 Neue Builds hochladen

**Bei Updates/Bugfixes:**

1. **Code ändern**
2. **Build Number erhöhen:**
   - Xcode → Target → General → Build: `2, 3, 4...`
3. **Repeat Phase 2:** Archive → Upload
4. **TestFlight:** Neue Builds werden automatisch verteilt (wenn Auto-Distribution aktiv)

**Build Number Schema:**
- Version 1.0: Builds 1, 2, 3, 4...
- Version 1.1: Builds 5, 6, 7... (oder zurück auf 1)

---

## 🚀 Zusammenfassung der Schritte

| Phase | Aufgabe | Dauer | Wo |
|-------|---------|-------|-----|
| 1.1 | Bundle ID registrieren | 5 Min | developer.apple.com |
| 1.2 | App in App Store Connect erstellen | 5 Min | appstoreconnect.apple.com |
| 1.3 | App Information ausfüllen | 10 Min | App Store Connect |
| 2.1 | Xcode Signing konfigurieren | 5 Min | Xcode |
| 2.2 | Version/Build prüfen | 1 Min | Xcode |
| 2.3 | Archive erstellen | 3-5 Min | Xcode → Product → Archive |
| 2.4 | Upload zu App Store Connect | 10-30 Min | Xcode Organizer |
| 3.1 | Build aktivieren & Export Compliance | 5 Min | TestFlight |
| 3.2 | Interne Tester hinzufügen | 5 Min | TestFlight |
| 3.3 | (Optional) Externe Tester | 1-2 Tage | TestFlight |

**Gesamt:** Ca. 1-2 Stunden (ohne Review-Wartezeit)

---

## ⚠️ Häufige Probleme & Lösungen

### Problem: "No signing certificate found"

**Lösung:**
1. Xcode → Preferences → Accounts
2. Dein Apple ID Account auswählen
3. **Download Manual Profiles**
4. Oder: Xcode → Target → Signing → **Automatically manage signing**

### Problem: "Bundle identifier is already in use"

**Lösung:**
- Bundle ID in developer.apple.com bereits registriert?
- Verwende anderen Bundle ID: `com.alexanderbering.PersonalAIBrain`
- Update in Xcode: Target → General → Bundle Identifier

### Problem: "Build processing failed"

**Lösung:**
1. App Store Connect → TestFlight → Builds → Check Errors
2. Häufigste Fehler:
   - Fehlende Icons/Assets
   - Ungültige Info.plist
   - Fehlende Privacy Descriptions
3. Fix in Xcode → Neu archivieren

### Problem: "Missing Compliance"

**Lösung:**
- Export Compliance in TestFlight ausfüllen
- Für Standard-HTTPS: "Uses exempt encryption" = YES

---

## 📱 App Store Submission (nach TestFlight)

**Wenn Beta-Testing erfolgreich:**

1. **App Store Connect → App Store → Prepare for Submission**
2. **Screenshots erstellen:**
   - iPhone 6.7": 1290x2796 (mind. 3 Screenshots)
   - iPhone 6.5": 1242x2688
   - Nutze Xcode Simulator + ⌘S
3. **App Description:**
   - Titel, Untertitel, Beschreibung
   - Keywords
   - Support URL
   - Marketing URL (optional)
4. **Pricing & Availability:**
   - Kostenlos oder Preis
   - Verfügbare Länder
5. **Submit for Review:**
   - Review dauert 1-3 Tage
   - Bei Approval: App geht live im App Store

---

## 🔄 Kontinuierliche Updates

**Workflow für neue Features:**

1. **Entwicklung:** Code ändern
2. **Testing:** Lokal testen in Xcode
3. **Build Increment:** Build Number +1
4. **Archive & Upload:** Xcode → Archive → Distribute
5. **TestFlight:** Tester bekommen Update automatisch
6. **Feedback sammeln**
7. **Repeat** oder **Submit to App Store**

---

## 📞 Support & Ressourcen

- **App Store Connect:** https://appstoreconnect.apple.com
- **Developer Portal:** https://developer.apple.com/account
- **TestFlight Docs:** https://developer.apple.com/testflight/
- **Xcode Archives:** Xcode → Window → Organizer

---

**Erstellt:** 9. Januar 2026
**Status:** ✅ Info.plist konfiguriert, bereit für Archive
**Nächster Schritt:** Phase 1 - Bundle ID & App Store Connect Setup

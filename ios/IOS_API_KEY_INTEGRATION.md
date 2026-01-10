# iOS App - API Key Integration Guide

## 📱 Status

✅ **APIKeyManager.swift erstellt** - Sichere Keychain-basierte API-Key-Speicherung
❌ **APIService.swift** - Muss noch angepasst werden (Authorization Header fehlt)

---

## 🔧 Erforderliche Änderungen in APIService.swift

### Schritt 1: API Key Manager importieren

Füge am Anfang der Datei hinzu:

```swift
// In APIService.swift am Anfang:
// Kein Import nötig, APIKeyManager ist im selben Target
```

### Schritt 2: Helper-Methode für authentifizierte Requests

Füge diese Methode zur `APIService` Klasse hinzu:

```swift
@MainActor
class APIService: ObservableObject {
    // ... existing properties ...

    // MARK: - API Key Authentication

    /// Create an authenticated URLRequest with API key from Keychain
    /// - Parameters:
    ///   - url: The URL for the request
    ///   - method: HTTP method (GET, POST, PUT, DELETE, etc.)
    /// - Returns: Configured URLRequest with Authorization header
    /// - Throws: APIError.unauthorized if no API key is stored
    private func createAuthenticatedRequest(
        url: URL,
        method: String = "GET"
    ) throws -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Get API key from Keychain
        guard let apiKey = APIKeyManager.shared.getAPIKey() else {
            print("❌ No API key found in Keychain")
            throw APIError.unauthorized
        }

        // Add Authorization header
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        return request
    }

    // Optional: Helper for requests with body
    private func createAuthenticatedRequest(
        url: URL,
        method: String,
        body: Data
    ) throws -> URLRequest {
        var request = try createAuthenticatedRequest(url: url, method: method)
        request.httpBody = body
        return request
    }
}
```

### Schritt 3: APIError erweitern

Füge neuen Error-Case hinzu:

```swift
enum APIError: Error {
    case invalidURL
    case invalidResponse
    case serverError(statusCode: Int)
    case unauthorized  // ADD THIS
}
```

### Schritt 4: Alle API-Calls aktualisieren

#### Beispiel: fetchIdeas()

**Vorher:**
```swift
func fetchIdeas() async throws -> [Idea] {
    guard let url = URL(string: "\(baseURL)/api/ideas") else {
        throw APIError.invalidURL
    }

    let (data, response) = try await URLSession.shared.data(from: url)
    // ...
}
```

**Nachher:**
```swift
func fetchIdeas() async throws -> [Idea] {
    guard let url = URL(string: "\(baseURL)/api/ideas") else {
        throw APIError.invalidURL
    }

    // Use authenticated request
    let request = try createAuthenticatedRequest(url: url, method: "GET")
    let (data, response) = try await URLSession.shared.data(for: request)

    // ... rest bleibt gleich
}
```

#### Beispiel: createIdea() (POST with body)

**Nachher:**
```swift
func createIdea(text: String) async throws -> Idea {
    guard let url = URL(string: "\(baseURL)/api/voice-memo/text") else {
        throw APIError.invalidURL
    }

    let body = ["text": text]
    let bodyData = try JSONSerialization.data(withJSONObject: body)

    let request = try createAuthenticatedRequest(
        url: url,
        method: "POST",
        body: bodyData
    )

    let (data, response) = try await URLSession.shared.data(for: request)
    // ...
}
```

### Schritt 5: API Key Setup View (Neue View)

Erstelle eine neue SwiftUI View für API-Key-Eingabe:

```swift
// File: ios/PersonalAIBrain/Views/APIKeySetupView.swift

import SwiftUI

struct APIKeySetupView: View {
    @State private var apiKey = ""
    @State private var showSuccess = false
    @State private var showError = false
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationView {
            Form {
                Section {
                    Text("Um die App zu nutzen, benötigst du einen API-Key vom Backend.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Section("API Key") {
                    SecureField("ab_live_xxxxxxxxxxxxxxxx", text: $apiKey)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .font(.system(.body, design: .monospaced))
                }

                Section {
                    Button("Speichern") {
                        saveAPIKey()
                    }
                    .disabled(apiKey.isEmpty)
                }

                if showSuccess {
                    Section {
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                            Text("API Key gespeichert!")
                        }
                    }
                }

                if showError {
                    Section {
                        HStack {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(.red)
                            Text("Fehler beim Speichern")
                        }
                    }
                }

                Section {
                    Text("API Key Format: **ab_live_** gefolgt von 32 Zeichen")
                        .font(.caption)
                        .foregroundColor(.secondary)

                    Text("Den API Key erhältst du vom Backend Administrator.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .navigationTitle("API Key Setup")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") {
                        dismiss()
                    }
                }
            }
        }
    }

    private func saveAPIKey() {
        let success = APIKeyManager.shared.saveAPIKey(apiKey)
        if success {
            showSuccess = true
            showError = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                dismiss()
            }
        } else {
            showError = true
            showSuccess = false
        }
    }
}

#Preview {
    APIKeySetupView()
}
```

### Schritt 6: ContentView aktualisieren

Prüfe beim App-Start, ob API-Key vorhanden ist:

```swift
// In ContentView oder App-Initialisierung:

struct ContentView: View {
    @State private var showAPIKeySetup = false

    var body: some View {
        TabView {
            // ... existing tabs
        }
        .onAppear {
            checkAPIKey()
        }
        .sheet(isPresented: $showAPIKeySetup) {
            APIKeySetupView()
        }
    }

    private func checkAPIKey() {
        if !APIKeyManager.shared.hasAPIKey() {
            showAPIKeySetup = true
        }
    }
}
```

---

## 🔑 API Key Generierung (Backend)

### Option 1: Via Backend-API (empfohlen)

Wenn Backend läuft, nutze die API:

```bash
curl -X POST http://localhost:3000/api/keys \
  -H "Content-Type: application/json" \
  -d '{
    "name": "iOS App - Production",
    "scopes": ["read", "write", "admin"]
  }'
```

Antwort:
```json
{
  "success": true,
  "webhook": {
    "id": "...",
    "secret": "ab_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "name": "iOS App - Production",
    "scopes": ["read", "write", "admin"]
  }
}
```

**⚠️ WICHTIG:** Der Key wird nur EINMAL angezeigt! Speichere ihn sicher.

### Option 2: Direkt in Datenbank

Wenn API nicht erreichbar, direkt in DB:

```sql
-- 1. Generiere einen neuen Key
-- Format: ab_live_ + 48 zufällige Hex-Zeichen
-- Beispiel: ab_live_a1b2c3d4e5f6...

-- 2. Hash den Key mit bcrypt (bcrypt rounds = 12)
-- In Node.js:
-- const hash = await bcrypt.hash('ab_live_xxxxxxxx', 12);

-- 3. Insert in DB:
INSERT INTO api_keys (id, name, prefix, key_hash, scopes, is_active, created_at)
VALUES (
  gen_random_uuid(),
  'iOS App - Production',
  'ab_live_a1',  -- Erste 10 Zeichen des Keys
  '$2b$12$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',  -- Bcrypt Hash
  '["read", "write", "admin"]',
  true,
  NOW()
);
```

---

## 📱 Testing Workflow

### 1. Backend-API-Key erstellen

```bash
cd /Users/alexanderbering/Projects/KI-AB/backend
npm start

# In neuem Terminal:
curl -X POST http://localhost:3000/api/keys \
  -H "Content-Type: application/json" \
  -d '{"name": "iOS Test", "scopes": ["read", "write"]}'

# Kopiere den API Key aus der Antwort
```

### 2. iOS App starten

```bash
cd /Users/alexanderbering/Projects/KI-AB/ios
open PersonalAIBrain.xcodeproj

# Im Simulator:
# 1. App startet
# 2. API Key Setup Sheet erscheint
# 3. Key eingeben und speichern
# 4. App verwendet jetzt Auth für alle Requests
```

### 3. API-Calls testen

```swift
// Test ohne API Key:
APIKeyManager.shared.deleteAPIKey()
// Alle API-Calls sollten mit 401 Unauthorized fehlschlagen

// Test mit API Key:
APIKeyManager.shared.saveAPIKey("ab_live_xxx")
// Alle API-Calls sollten erfolgreich sein
```

---

## 🚨 Fehlerbehandlung

### 401 Unauthorized

**Mögliche Ursachen:**
1. Kein API Key im Keychain gespeichert
2. API Key ist abgelaufen
3. API Key wurde gelöscht/deaktiviert im Backend
4. API Key hat falsche Scopes

**Lösung:**
- Zeige API-Key-Setup-Sheet erneut
- Prüfe Backend-Logs für Authentifizierungsfehler
- Generiere neuen API Key

### 403 Forbidden

**Ursache:** API Key hat nicht die erforderlichen Scopes

**Lösung:**
- Prüfe Scopes des Keys: `SELECT scopes FROM api_keys WHERE prefix = 'ab_live_xx'`
- Update Scopes: `UPDATE api_keys SET scopes = '["read", "write", "admin"]' WHERE id = '...'`

---

## ✅ Checklist für vollständige Integration

- [ ] 1. `APIKeyManager.swift` zum Xcode-Projekt hinzufügen
- [ ] 2. `APIService.swift`: `createAuthenticatedRequest()` Helper hinzufügen
- [ ] 3. `APIService.swift`: Alle API-Calls auf authentifizierte Requests umstellen
- [ ] 4. `APIError`: `unauthorized` Case hinzufügen
- [ ] 5. `APIKeySetupView.swift` erstellen
- [ ] 6. `ContentView`: API-Key-Check beim Start hinzufügen
- [ ] 7. Backend: Production API-Key generieren
- [ ] 8. iOS App: API-Key in Keychain speichern
- [ ] 9. Testen: Alle API-Calls funktionieren
- [ ] 10. Error Handling: 401/403 Responses behandeln

---

## 📝 Dateien

### Neue Dateien:
1. **ios/PersonalAIBrain/Services/APIKeyManager.swift** ✅ Erstellt
2. **ios/PersonalAIBrain/Views/APIKeySetupView.swift** ❌ Muss erstellt werden

### Zu modifizierende Dateien:
1. **ios/PersonalAIBrain/Services/APIService.swift**
   - `createAuthenticatedRequest()` hinzufügen
   - Alle `URLSession.shared.data(from: url)` ersetzen mit `URLSession.shared.data(for: request)`

2. **ios/PersonalAIBrain/Views/ContentView.swift**
   - API-Key-Check beim Start
   - Sheet für APIKeySetupView

3. **ios/PersonalAIBrain/Models/APIError.swift** (falls separate Datei)
   - `unauthorized` Case hinzufügen

---

## 🔒 Security Best Practices

### ✅ DO:
- API Key im iOS Keychain speichern (mit `kSecAttrAccessibleAfterFirstUnlock`)
- HTTPS für alle API-Calls verwenden
- API Key nur in Memory halten während der Nutzung
- 401 Errors abfangen und User zur Re-Authentication auffordern

### ❌ DON'T:
- API Key hardcoded im Code
- API Key in UserDefaults speichern
- API Key in Logs ausgeben
- API Key in Git committen

---

**Status:** 🟡 Vorbereitet, Integration erforderlich
**Nächster Schritt:** APIService.swift modifizieren + APIKeySetupView erstellen


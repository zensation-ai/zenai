import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var apiService: APIService
    @EnvironmentObject var localStorageService: LocalStorageService
    @EnvironmentObject var offlineQueueService: OfflineQueueService
    @State private var isConnected = false
    @State private var isChecking = false
    @State private var isSyncing = false
    @State private var localStats: LocalStorageStats = LocalStorageStats()

    // Phase 13: Biometric Authentication
    @State private var biometricEnabled = BiometricService.shared.isEnabled
    @State private var showBiometricError = false
    @State private var biometricErrorMessage = ""

    var body: some View {
        NavigationStack {
            List {
                // Connection Status
                Section("Verbindung") {
                    HStack {
                        Image(systemName: isConnected ? "wifi" : "wifi.slash")
                            .foregroundColor(isConnected ? .green : .red)

                        Text("Backend-Status")

                        Spacer()

                        if isChecking {
                            ProgressView()
                        } else {
                            Text(isConnected ? "Verbunden" : "Nicht verbunden")
                                .foregroundColor(.zensationTextMuted)
                        }
                    }

                    Button("Verbindung testen") {
                        checkConnection()
                    }
                }

                // Local Storage
                Section("Lokaler Speicher") {
                    HStack {
                        Image(systemName: "internaldrive")
                            .foregroundColor(.blue)
                        Text("Gespeicherte Ideen")
                        Spacer()
                        Text("\(localStats.totalIdeas)")
                            .foregroundColor(.zensationTextMuted)
                    }

                    HStack {
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .foregroundColor(.orange)
                        Text("Nicht synchronisiert")
                        Spacer()
                        Text("\(localStats.unsyncedIdeas)")
                            .foregroundColor(.zensationTextMuted)
                    }

                    HStack {
                        Image(systemName: "hand.draw")
                            .foregroundColor(.purple)
                        Text("Swipe-Aktionen")
                        Spacer()
                        Text("\(localStats.totalSwipeActions)")
                            .foregroundColor(.zensationTextMuted)
                    }

                    Button(action: syncNow) {
                        HStack {
                            if isSyncing {
                                ProgressView()
                                    .padding(.trailing, 8)
                            }
                            Text(isSyncing ? "Synchronisiere..." : "Jetzt synchronisieren")
                        }
                    }
                    .disabled(isSyncing || !isConnected)
                }

                // Offline Queue
                Section("Offline-Warteschlange") {
                    HStack {
                        Image(systemName: offlineQueueService.isOnline ? "wifi" : "wifi.slash")
                            .foregroundColor(offlineQueueService.isOnline ? .green : .orange)
                        Text("Netzwerk-Status")
                        Spacer()
                        Text(offlineQueueService.isOnline ? "Online" : "Offline")
                            .foregroundColor(.zensationTextMuted)
                    }

                    HStack {
                        Image(systemName: "tray.full")
                            .foregroundColor(.blue)
                        Text("Ausstehende Aktionen")
                        Spacer()
                        Text("\(offlineQueueService.queuedItems.count)")
                            .foregroundColor(.zensationTextMuted)
                    }

                    Button(action: {
                        Task {
                            await offlineQueueService.forceSync()
                        }
                    }) {
                        HStack {
                            Image(systemName: "arrow.clockwise")
                            Text("Verbindung prüfen & synchronisieren")
                        }
                    }
                    .disabled(offlineQueueService.isProcessing)

                    if !offlineQueueService.queuedItems.isEmpty {
                        Button("Warteschlange leeren") {
                            offlineQueueService.clearQueue()
                        }
                        .foregroundColor(.red)
                    }
                }

                // API Key Management
                Section("API-Zugang") {
                    if APIKeyManager.shared.hasAPIKey() {
                        HStack {
                            Image(systemName: "key.fill")
                                .foregroundColor(.green)
                            Text("API Key konfiguriert")
                            Spacer()
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                        }

                        NavigationLink("API Key ändern") {
                            APIKeySetupView()
                        }
                    } else {
                        HStack {
                            Image(systemName: "key.slash")
                                .foregroundColor(.red)
                            Text("Kein API Key")
                            Spacer()
                            NavigationLink("Einrichten") {
                                APIKeySetupView()
                            }
                        }
                    }
                }

                // Security (Phase 13)
                Section("Sicherheit") {
                    if BiometricService.shared.isBiometricAvailable {
                        Toggle(isOn: $biometricEnabled) {
                            HStack {
                                Image(systemName: BiometricService.shared.availableBiometricType.iconName)
                                    .foregroundColor(.blue)
                                Text(BiometricService.shared.availableBiometricType.displayName)
                            }
                        }
                        .onChange(of: biometricEnabled) { _, newValue in
                            toggleBiometric(newValue)
                        }

                        if biometricEnabled {
                            Text("App wird bei jedem Start gesperrt")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    } else {
                        HStack {
                            Image(systemName: "lock.slash")
                                .foregroundColor(.secondary)
                            Text("Biometrie nicht verfügbar")
                                .foregroundColor(.secondary)
                        }
                    }
                }

                // Backend Configuration
                Section("Backend") {
                    HStack {
                        Text("URL")
                        Spacer()
                        Text(apiService.baseURL)
                            .font(.caption)
                            .foregroundColor(.zensationTextMuted)
                            .lineLimit(1)
                            .minimumScaleFactor(0.5)
                    }

                    HStack {
                        Text("Umgebung")
                        Spacer()
                        Text(AppEnvironment.isSimulator ? "Simulator" : "Gerät")
                            .foregroundColor(.zensationTextMuted)
                    }

                    NavigationLink("API Dokumentation") {
                        APIDocView()
                    }
                }

                // About
                Section("Über") {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text("1.2")
                            .foregroundColor(.zensationTextMuted)
                    }

                    HStack {
                        Text("Build")
                        Spacer()
                        Text("5")
                            .foregroundColor(.zensationTextMuted)
                    }

                    if let githubURL = URL(string: "https://github.com") {
                        Link(destination: githubURL) {
                            HStack {
                                Text("GitHub Repository")
                                Spacer()
                                Image(systemName: "arrow.up.right.square")
                                    .foregroundColor(.zensationTextMuted)
                            }
                        }
                    }
                }

                // Features
                Section("Features") {
                    FeatureRow(icon: "mic.fill", title: "Sprachaufnahme", status: .available)
                    FeatureRow(icon: "waveform", title: "Whisper Transcription", status: .available)
                    FeatureRow(icon: "brain", title: "Mistral Strukturierung", status: .available)
                    FeatureRow(icon: "magnifyingglass", title: "Semantische Suche", status: .available)
                    FeatureRow(icon: "chart.pie", title: "Knowledge Graph", status: .available)
                    FeatureRow(icon: "icloud.and.arrow.up", title: "Cloud Sync", status: .comingSoon)
                }
            }
            .navigationTitle("Einstellungen")
            .task {
                checkConnection()
                loadStats()
            }
            .alert("Biometrie-Fehler", isPresented: $showBiometricError) {
                Button("OK") {
                    showBiometricError = false
                }
            } message: {
                Text(biometricErrorMessage)
            }
        }
    }

    private func checkConnection() {
        isChecking = true
        Task {
            isConnected = await apiService.checkHealth()
            isChecking = false
        }
    }

    private func syncNow() {
        isSyncing = true
        Task {
            await localStorageService.syncWithServer()
            localStats = localStorageService.getStatistics()
            isSyncing = false
        }
    }

    private func loadStats() {
        localStats = localStorageService.getStatistics()
    }

    // Phase 13: Toggle biometric authentication
    private func toggleBiometric(_ enable: Bool) {
        if enable {
            Task {
                do {
                    try await BiometricService.shared.enableBiometricAuth()
                    await MainActor.run {
                        biometricEnabled = true
                    }
                } catch let error as BiometricService.BiometricError {
                    await MainActor.run {
                        biometricEnabled = false
                        biometricErrorMessage = error.localizedDescription
                        showBiometricError = true
                    }
                } catch {
                    await MainActor.run {
                        biometricEnabled = false
                        biometricErrorMessage = error.localizedDescription
                        showBiometricError = true
                    }
                }
            }
        } else {
            BiometricService.shared.disableBiometricAuth()
        }
    }
}

// MARK: - Feature Row

struct FeatureRow: View {
    let icon: String
    let title: String
    let status: FeatureStatus

    var body: some View {
        HStack {
            Image(systemName: icon)
                .frame(width: 24)
                .foregroundColor(.blue)

            Text(title)

            Spacer()

            switch status {
            case .available:
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(.green)
            case .comingSoon:
                Text("Bald")
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(Color.orange.opacity(0.2))
                    .foregroundColor(.orange)
                    .clipShape(Capsule())
            case .unavailable:
                Image(systemName: "xmark.circle.fill")
                    .foregroundColor(.red)
            }
        }
    }
}

enum FeatureStatus {
    case available
    case comingSoon
    case unavailable
}

// MARK: - API Doc View

struct APIDocView: View {
    var body: some View {
        List {
            Section("Endpoints") {
                EndpointRow(
                    method: "GET",
                    path: "/api/health",
                    description: "Health Check"
                )
                EndpointRow(
                    method: "GET",
                    path: "/api/ideas",
                    description: "Liste aller Ideen"
                )
                EndpointRow(
                    method: "POST",
                    path: "/api/ideas/search",
                    description: "Semantische Suche"
                )
                EndpointRow(
                    method: "POST",
                    path: "/api/voice-memo",
                    description: "Audio verarbeiten"
                )
                EndpointRow(
                    method: "POST",
                    path: "/api/voice-memo/text",
                    description: "Text verarbeiten"
                )
                EndpointRow(
                    method: "GET",
                    path: "/api/knowledge-graph/stats",
                    description: "Graph Statistiken"
                )
            }
        }
        .navigationTitle("API Dokumentation")
    }
}

struct EndpointRow: View {
    let method: String
    let path: String
    let description: String

    var methodColor: Color {
        switch method {
        case "GET": return .green
        case "POST": return .blue
        case "PUT": return .orange
        case "DELETE": return .red
        default: return .gray
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(method)
                    .font(.caption)
                    .fontWeight(.bold)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(methodColor.opacity(0.2))
                    .foregroundColor(methodColor)
                    .clipShape(RoundedRectangle(cornerRadius: 4))

                Text(path)
                    .font(.system(.caption, design: .monospaced))
            }

            Text(description)
                .font(.caption)
                .foregroundColor(.zensationTextMuted)
        }
    }
}

#Preview {
    SettingsView()
        .environmentObject(APIService())
        .environmentObject(LocalStorageService.shared)
        .environmentObject(OfflineQueueService.shared)
}

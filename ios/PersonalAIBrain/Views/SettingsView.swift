import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var apiService: APIService
    @State private var isConnected = false
    @State private var isChecking = false

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
                                .foregroundColor(.secondary)
                        }
                    }

                    Button("Verbindung testen") {
                        checkConnection()
                    }
                }

                // Backend Configuration
                Section("Backend") {
                    HStack {
                        Text("URL")
                        Spacer()
                        Text("localhost:3000")
                            .foregroundColor(.secondary)
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
                        Text("1.0.0")
                            .foregroundColor(.secondary)
                    }

                    HStack {
                        Text("Build")
                        Spacer()
                        Text("Phase 2 MVP")
                            .foregroundColor(.secondary)
                    }

                    Link(destination: URL(string: "https://github.com")!) {
                        HStack {
                            Text("GitHub Repository")
                            Spacer()
                            Image(systemName: "arrow.up.right.square")
                                .foregroundColor(.secondary)
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
                .foregroundColor(.secondary)
        }
    }
}

#Preview {
    SettingsView()
        .environmentObject(APIService())
}

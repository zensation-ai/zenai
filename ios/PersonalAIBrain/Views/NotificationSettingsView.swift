import SwiftUI

struct NotificationSettingsView: View {
    @EnvironmentObject var apiService: APIService
    @StateObject private var notificationService = NotificationService.shared

    @State private var preferences = NotificationPreferences.default
    @State private var isLoading = true
    @State private var showError = false
    @State private var errorMessage = ""

    var body: some View {
        List {
            // Authorization Status
            Section {
                HStack {
                    Image(systemName: notificationService.isAuthorized ? "bell.badge.fill" : "bell.slash.fill")
                        .foregroundColor(notificationService.isAuthorized ? .green : .red)
                        .font(.title2)

                    VStack(alignment: .leading) {
                        Text(notificationService.isAuthorized ? "Benachrichtigungen aktiv" : "Benachrichtigungen deaktiviert")
                            .font(.headline)
                        Text(notificationService.isAuthorized
                            ? "Du erhältst Push-Benachrichtigungen"
                            : "Aktiviere Benachrichtigungen in den Einstellungen"
                        )
                        .font(.caption)
                        .foregroundColor(.secondary)
                    }

                    Spacer()

                    if !notificationService.isAuthorized {
                        Button("Aktivieren") {
                            Task {
                                _ = await notificationService.requestAuthorization()
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                    }
                }
            }

            // Notification Types
            Section(header: Text("Benachrichtigungstypen")) {
                Toggle(isOn: $preferences.clusterReady) {
                    Label {
                        VStack(alignment: .leading) {
                            Text("Cluster bereit")
                            Text("Wenn Gedanken-Cluster zur Konsolidierung bereit sind")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    } icon: {
                        Image(systemName: "lightbulb.fill")
                            .foregroundColor(.yellow)
                    }
                }

                Toggle(isOn: $preferences.dailyDigest) {
                    Label {
                        VStack(alignment: .leading) {
                            Text("Tägliche Zusammenfassung")
                            Text("Überblick über neue Ideen und Aktivitäten")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    } icon: {
                        Image(systemName: "calendar")
                            .foregroundColor(.blue)
                    }
                }

                Toggle(isOn: $preferences.weeklyInsights) {
                    Label {
                        VStack(alignment: .leading) {
                            Text("Wöchentliche Insights")
                            Text("Wöchentliche Analyse deiner Gedanken")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    } icon: {
                        Image(systemName: "chart.bar.fill")
                            .foregroundColor(.purple)
                    }
                }

                Toggle(isOn: $preferences.priorityReminders) {
                    Label {
                        VStack(alignment: .leading) {
                            Text("Prioritäts-Erinnerungen")
                            Text("Erinnerungen für hochpriorisierte Ideen")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    } icon: {
                        Image(systemName: "exclamationmark.circle.fill")
                            .foregroundColor(.red)
                    }
                }
            }
            .disabled(!notificationService.isAuthorized)

            // Quiet Hours
            Section(header: Text("Ruhezeiten")) {
                HStack {
                    Text("Von")
                    Spacer()
                    TextField("22:00", text: Binding(
                        get: { preferences.quietHoursStart ?? "22:00" },
                        set: { preferences.quietHoursStart = $0 }
                    ))
                    .multilineTextAlignment(.trailing)
                    .keyboardType(.numbersAndPunctuation)
                    .frame(width: 60)
                }

                HStack {
                    Text("Bis")
                    Spacer()
                    TextField("08:00", text: Binding(
                        get: { preferences.quietHoursEnd ?? "08:00" },
                        set: { preferences.quietHoursEnd = $0 }
                    ))
                    .multilineTextAlignment(.trailing)
                    .keyboardType(.numbersAndPunctuation)
                    .frame(width: 60)
                }
            }
            .disabled(!notificationService.isAuthorized)

            // Actions
            Section {
                Button(action: testNotification) {
                    Label("Test-Benachrichtigung senden", systemImage: "bell.badge")
                }
                .disabled(!notificationService.isAuthorized)

                Button(action: clearAllNotifications) {
                    Label("Alle Benachrichtigungen löschen", systemImage: "trash")
                        .foregroundColor(.red)
                }
            }
        }
        .navigationTitle("Benachrichtigungen")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Speichern") {
                    savePreferences()
                }
                .disabled(isLoading)
            }
        }
        .task {
            await loadPreferences()
        }
        .alert("Fehler", isPresented: $showError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage)
        }
    }

    private func loadPreferences() async {
        isLoading = true
        do {
            preferences = try await apiService.getNotificationPreferences()
        } catch {
            // Use defaults on error
            preferences = .default
        }
        isLoading = false
    }

    private func savePreferences() {
        Task {
            do {
                try await apiService.updateNotificationPreferences(preferences)
            } catch {
                errorMessage = error.localizedDescription
                showError = true
            }
        }
    }

    private func testNotification() {
        notificationService.scheduleClusterReadyNotification(
            clusterId: "test-123",
            title: "Test-Cluster",
            maturityScore: 0.85
        )
    }

    private func clearAllNotifications() {
        notificationService.cancelAllNotifications()
        notificationService.clearBadge()
    }
}

// MARK: - Notification Section for Settings

struct NotificationSettingsSection: View {
    @StateObject private var notificationService = NotificationService.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Benachrichtigungen", systemImage: "bell.fill")
                .font(.headline)

            NavigationLink(destination: NotificationSettingsView()) {
                HStack {
                    VStack(alignment: .leading) {
                        Text("Benachrichtigungen verwalten")
                            .font(.subheadline)
                            .fontWeight(.medium)
                        Text(notificationService.isAuthorized ? "Aktiv" : "Deaktiviert")
                            .font(.caption)
                            .foregroundColor(notificationService.isAuthorized ? .green : .red)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .foregroundColor(.secondary)
                }
                .padding()
                .background(Color(.systemGray6))
                .cornerRadius(12)
            }
        }
    }
}

#Preview {
    NavigationView {
        NotificationSettingsView()
            .environmentObject(APIService())
    }
}

import SwiftUI

/// Push Notification Settings View
/// Allows users to configure notification preferences for different event types
struct NotificationSettingsView: View {
    @StateObject private var notificationService = NotificationService.shared

    @State private var preferences = PushNotificationPreferences.default
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var showError = false
    @State private var errorMessage = ""
    @State private var showSaveSuccess = false

    // Quiet hours time pickers
    @State private var quietHoursStartDate = Date()
    @State private var quietHoursEndDate = Date()

    var body: some View {
        List {
            // Authorization Status Section
            authorizationSection

            // Draft Notifications Section
            draftNotificationsSection

            // Idea Notifications Section
            ideaNotificationsSection

            // Quiet Hours Section
            quietHoursSection

            // Rate Limiting Section
            rateLimitingSection

            // Actions Section
            actionsSection
        }
        .navigationTitle("Benachrichtigungen")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: savePreferences) {
                    if isSaving {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle())
                    } else {
                        Text("Speichern")
                    }
                }
                .disabled(isLoading || isSaving)
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
        .alert("Gespeichert", isPresented: $showSaveSuccess) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Deine Benachrichtigungseinstellungen wurden aktualisiert.")
        }
    }

    // MARK: - Authorization Section

    private var authorizationSection: some View {
        Section {
            HStack(spacing: 16) {
                Image(systemName: notificationService.isAuthorized ? "bell.badge.fill" : "bell.slash.fill")
                    .font(.title)
                    .foregroundColor(notificationService.isAuthorized ? .green : .red)
                    .frame(width: 44)

                VStack(alignment: .leading, spacing: 4) {
                    Text(notificationService.isAuthorized ? "Benachrichtigungen aktiv" : "Benachrichtigungen deaktiviert")
                        .font(.headline)
                    Text(notificationService.isAuthorized
                        ? "Du erhältst Push-Benachrichtigungen auf diesem Gerät"
                        : "Aktiviere Benachrichtigungen in den Systemeinstellungen"
                    )
                    .font(.caption)
                    .foregroundColor(.secondary)
                }

                Spacer()

                if !notificationService.isAuthorized {
                    Button("Aktivieren") {
                        Task {
                            let granted = await notificationService.requestAuthorization()
                            if !granted {
                                // Open system settings
                                if let url = URL(string: UIApplication.openSettingsURLString) {
                                    await UIApplication.shared.open(url)
                                }
                            }
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                }
            }
            .padding(.vertical, 8)
        }
    }

    // MARK: - Draft Notifications Section

    private var draftNotificationsSection: some View {
        Section {
            Toggle(isOn: $preferences.draftReady) {
                NotificationToggleLabel(
                    icon: "doc.text.fill",
                    iconColor: .blue,
                    title: "Entwurf bereit",
                    description: "Wenn ein neuer Entwurf generiert wurde"
                )
            }

            Toggle(isOn: $preferences.draftFeedbackReminder) {
                NotificationToggleLabel(
                    icon: "star.fill",
                    iconColor: .yellow,
                    title: "Feedback-Erinnerung",
                    description: "Erinnerung, verwendete Entwürfe zu bewerten"
                )
            }
        } header: {
            Text("Entwürfe")
        } footer: {
            Text("Benachrichtigungen für die automatische Entwurf-Generierung")
        }
        .disabled(!notificationService.isAuthorized)
    }

    // MARK: - Idea Notifications Section

    private var ideaNotificationsSection: some View {
        Section {
            Toggle(isOn: $preferences.ideaConnections) {
                NotificationToggleLabel(
                    icon: "link",
                    iconColor: .purple,
                    title: "Ideen-Verbindungen",
                    description: "Wenn neue Verbindungen zwischen Ideen gefunden werden"
                )
            }

            Toggle(isOn: $preferences.learningSuggestions) {
                NotificationToggleLabel(
                    icon: "lightbulb.fill",
                    iconColor: .orange,
                    title: "Lern-Vorschläge",
                    description: "KI-basierte Verbesserungsvorschläge"
                )
            }

            Toggle(isOn: $preferences.weeklySummary) {
                NotificationToggleLabel(
                    icon: "chart.bar.fill",
                    iconColor: .green,
                    title: "Wöchentliche Zusammenfassung",
                    description: "Überblick über deine Aktivitäten"
                )
            }
        } header: {
            Text("Ideen & Insights")
        }
        .disabled(!notificationService.isAuthorized)
    }

    // MARK: - Quiet Hours Section

    private var quietHoursSection: some View {
        Section {
            Toggle(isOn: $preferences.quietHoursEnabled) {
                NotificationToggleLabel(
                    icon: "moon.fill",
                    iconColor: .indigo,
                    title: "Ruhezeiten",
                    description: "Keine Benachrichtigungen während dieser Zeit"
                )
            }

            if preferences.quietHoursEnabled {
                HStack {
                    Text("Von")
                    Spacer()
                    DatePicker(
                        "",
                        selection: $quietHoursStartDate,
                        displayedComponents: .hourAndMinute
                    )
                    .labelsHidden()
                    .onChange(of: quietHoursStartDate) { _, newValue in
                        preferences.quietHoursStart = formatTime(newValue)
                    }
                }

                HStack {
                    Text("Bis")
                    Spacer()
                    DatePicker(
                        "",
                        selection: $quietHoursEndDate,
                        displayedComponents: .hourAndMinute
                    )
                    .labelsHidden()
                    .onChange(of: quietHoursEndDate) { _, newValue in
                        preferences.quietHoursEnd = formatTime(newValue)
                    }
                }

                HStack {
                    Text("Zeitzone")
                    Spacer()
                    Text(preferences.timezone)
                        .foregroundColor(.secondary)
                }
            }
        } header: {
            Text("Ruhezeiten")
        } footer: {
            if preferences.quietHoursEnabled {
                Text("Du erhältst keine Benachrichtigungen zwischen \(preferences.quietHoursStart ?? "22:00") und \(preferences.quietHoursEnd ?? "08:00") Uhr.")
            }
        }
        .disabled(!notificationService.isAuthorized)
    }

    // MARK: - Rate Limiting Section

    private var rateLimitingSection: some View {
        Section {
            Stepper(value: $preferences.maxNotificationsPerHour, in: 1...30) {
                HStack {
                    Text("Pro Stunde")
                    Spacer()
                    Text("\(preferences.maxNotificationsPerHour)")
                        .foregroundColor(.secondary)
                        .monospacedDigit()
                }
            }

            Stepper(value: $preferences.maxNotificationsPerDay, in: 5...100, step: 5) {
                HStack {
                    Text("Pro Tag")
                    Spacer()
                    Text("\(preferences.maxNotificationsPerDay)")
                        .foregroundColor(.secondary)
                        .monospacedDigit()
                }
            }
        } header: {
            Text("Limits")
        } footer: {
            Text("Maximale Anzahl an Benachrichtigungen, um Überflutung zu vermeiden.")
        }
        .disabled(!notificationService.isAuthorized)
    }

    // MARK: - Actions Section

    private var actionsSection: some View {
        Section {
            Button(action: sendTestNotification) {
                Label("Test-Benachrichtigung senden", systemImage: "bell.badge")
            }
            .disabled(!notificationService.isAuthorized)

            Button(action: clearAllNotifications) {
                Label("Alle Benachrichtigungen löschen", systemImage: "trash")
            }
            .foregroundColor(.red)
        }
    }

    // MARK: - Actions

    private func loadPreferences() async {
        isLoading = true
        do {
            preferences = try await APIService.shared.getNotificationPreferences()
            updateQuietHoursDates()
        } catch {
            // Use defaults on error
            preferences = .default
            updateQuietHoursDates()
            print("Failed to load notification preferences: \(error)")
        }
        isLoading = false
    }

    private func savePreferences() {
        isSaving = true
        Task {
            do {
                try await APIService.shared.updateNotificationPreferences(preferences)
                await MainActor.run {
                    showSaveSuccess = true
                }
            } catch {
                await MainActor.run {
                    errorMessage = "Einstellungen konnten nicht gespeichert werden: \(error.localizedDescription)"
                    showError = true
                }
            }
            await MainActor.run {
                isSaving = false
            }
        }
    }

    private func sendTestNotification() {
        notificationService.scheduleClusterReadyNotification(
            clusterId: "test-\(UUID().uuidString.prefix(8))",
            title: "Test-Benachrichtigung",
            maturityScore: 0.95
        )
    }

    private func clearAllNotifications() {
        notificationService.cancelAllNotifications()
        notificationService.clearBadge()
    }

    // MARK: - Helpers

    private func updateQuietHoursDates() {
        quietHoursStartDate = parseTime(preferences.quietHoursStart ?? "22:00")
        quietHoursEndDate = parseTime(preferences.quietHoursEnd ?? "08:00")
    }

    private func parseTime(_ timeString: String) -> Date {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.date(from: timeString) ?? Date()
    }

    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }
}

// MARK: - Notification Toggle Label

struct NotificationToggleLabel: View {
    let icon: String
    let iconColor: Color
    let title: String
    let description: String

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                Text(description)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        } icon: {
            Image(systemName: icon)
                .foregroundColor(iconColor)
        }
    }
}

// MARK: - Notification Settings Section (for SettingsView)

struct NotificationSettingsSection: View {
    @StateObject private var notificationService = NotificationService.shared

    var body: some View {
        Section("Benachrichtigungen") {
            NavigationLink {
                NotificationSettingsView()
            } label: {
                HStack {
                    Image(systemName: notificationService.isAuthorized ? "bell.badge.fill" : "bell.slash.fill")
                        .foregroundColor(notificationService.isAuthorized ? .green : .orange)
                        .frame(width: 28)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Push-Benachrichtigungen")
                        Text(notificationService.isAuthorized ? "Aktiv" : "Deaktiviert")
                            .font(.caption)
                            .foregroundColor(notificationService.isAuthorized ? .green : .orange)
                    }
                }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        NotificationSettingsView()
    }
}

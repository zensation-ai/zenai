import SwiftUI

struct AutomationsView: View {
    @EnvironmentObject var apiService: APIService
    @EnvironmentObject var contextManager: ContextManager

    @State private var automations: [Automation] = []
    @State private var loading = true
    @State private var showCreateSheet = false
    @State private var selectedAutomation: Automation?
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            Color.zensationBackground.ignoresSafeArea()

            if loading {
                VStack(spacing: 16) {
                    AIBrainView(isActive: true, activityType: .thinking, size: 48)
                    Text("Lade Automationen...")
                        .foregroundColor(.zensationTextMuted)
                }
            } else if automations.isEmpty {
                emptyState
            } else {
                automationsList
            }
        }
        .navigationTitle("Automationen")
        .navigationBarTitleDisplayMode(.large)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbarBackground(Color.zensationSurface, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    showCreateSheet = true
                } label: {
                    Image(systemName: "plus")
                        .foregroundColor(.zensationOrange)
                }
            }
        }
        .sheet(isPresented: $showCreateSheet) {
            CreateAutomationSheet(onCreated: { automation in
                automations.insert(automation, at: 0)
            })
        }
        .sheet(item: $selectedAutomation) { automation in
            AutomationDetailSheet(
                automation: automation,
                onUpdated: { updated in
                    if let index = automations.firstIndex(where: { $0.id == updated.id }) {
                        automations[index] = updated
                    }
                },
                onDeleted: {
                    automations.removeAll { $0.id == automation.id }
                }
            )
        }
        .alert("Fehler", isPresented: .constant(errorMessage != nil)) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
        .task {
            await loadAutomations()
        }
    }

    private var emptyState: some View {
        VStack(spacing: 20) {
            Image(systemName: "bolt.circle")
                .font(.system(size: 60))
                .foregroundColor(.zensationTextMuted.opacity(0.5))

            Text("Keine Automationen")
                .font(.title2)
                .fontWeight(.semibold)
                .foregroundColor(.zensationText)

            Text("Erstelle Automationen, um wiederkehrende Aufgaben zu automatisieren.")
                .font(.subheadline)
                .foregroundColor(.zensationTextMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Button {
                showCreateSheet = true
            } label: {
                Label("Erste Automation erstellen", systemImage: "plus")
                    .font(.headline)
                    .foregroundColor(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .background(Color.zensationOrange)
                    .clipShape(Capsule())
            }
            .padding(.top, 8)
        }
    }

    private var automationsList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(automations) { automation in
                    AutomationCard(
                        automation: automation,
                        onTap: { selectedAutomation = automation },
                        onToggle: { enabled in
                            Task { await toggleAutomation(automation, enabled: enabled) }
                        },
                        onRun: {
                            Task { await runAutomation(automation) }
                        }
                    )
                }
            }
            .padding()
        }
    }

    private func loadAutomations() async {
        loading = true
        do {
            automations = try await apiService.fetchAutomations(context: contextManager.currentContext)
        } catch {
            errorMessage = "Automationen konnten nicht geladen werden."
        }
        loading = false
    }

    private func toggleAutomation(_ automation: Automation, enabled: Bool) async {
        do {
            let updated = try await apiService.updateAutomation(
                id: automation.id,
                enabled: enabled,
                context: contextManager.currentContext
            )
            if let index = automations.firstIndex(where: { $0.id == automation.id }) {
                automations[index] = updated
            }
        } catch {
            errorMessage = "Status konnte nicht geändert werden."
        }
    }

    private func runAutomation(_ automation: Automation) async {
        do {
            try await apiService.runAutomation(id: automation.id, context: contextManager.currentContext)
            // Show success feedback
        } catch {
            errorMessage = "Automation konnte nicht ausgeführt werden."
        }
    }
}

// MARK: - Automation Card

struct AutomationCard: View {
    let automation: Automation
    let onTap: () -> Void
    let onToggle: (Bool) -> Void
    let onRun: () -> Void

    @State private var isRunning = false

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Image(systemName: automation.trigger.icon)
                        .font(.title2)
                        .foregroundColor(automation.enabled ? .zensationOrange : .zensationTextMuted)
                        .frame(width: 40, height: 40)
                        .background(
                            (automation.enabled ? Color.zensationOrange : Color.zensationTextMuted)
                                .opacity(0.15)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 10))

                    VStack(alignment: .leading, spacing: 2) {
                        Text(automation.name)
                            .font(.headline)
                            .foregroundColor(.zensationText)

                        Text(automation.trigger.displayName)
                            .font(.caption)
                            .foregroundColor(.zensationTextMuted)
                    }

                    Spacer()

                    Toggle("", isOn: Binding(
                        get: { automation.enabled },
                        set: { onToggle($0) }
                    ))
                    .labelsHidden()
                    .tint(.zensationOrange)
                }

                if let description = automation.description {
                    Text(description)
                        .font(.subheadline)
                        .foregroundColor(.zensationTextMuted)
                        .lineLimit(2)
                }

                HStack {
                    Label("\(automation.actions.count) Aktionen", systemImage: "list.bullet")
                        .font(.caption)
                        .foregroundColor(.zensationTextMuted)

                    Spacer()

                    if let lastRun = automation.lastRun {
                        Text("Zuletzt: \(lastRun.formatted(.relative(presentation: .named)))")
                            .font(.caption)
                            .foregroundColor(.zensationTextMuted)
                    }

                    Button {
                        onRun()
                    } label: {
                        Image(systemName: "play.fill")
                            .font(.caption)
                            .foregroundColor(.zensationOrange)
                            .padding(8)
                            .background(Color.zensationOrange.opacity(0.15))
                            .clipShape(Circle())
                    }
                    .disabled(!automation.enabled)
                }
            }
            .padding()
            .background(Color.zensationSurface)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.zensationBorder, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Create Automation Sheet

struct CreateAutomationSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var apiService: APIService
    @EnvironmentObject var contextManager: ContextManager

    let onCreated: (Automation) -> Void

    @State private var name = ""
    @State private var description = ""
    @State private var trigger: AutomationTrigger = .manual
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ZStack {
                Color.zensationBackground.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 20) {
                        // Name
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Name")
                                .font(.caption)
                                .foregroundColor(.zensationTextMuted)
                            TextField("z.B. Tägliche Zusammenfassung", text: $name)
                                .textFieldStyle(.plain)
                                .padding()
                                .background(Color.zensationSurface)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10)
                                        .stroke(Color.zensationBorder, lineWidth: 1)
                                )
                        }

                        // Description
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Beschreibung (optional)")
                                .font(.caption)
                                .foregroundColor(.zensationTextMuted)
                            TextField("Was macht diese Automation?", text: $description, axis: .vertical)
                                .textFieldStyle(.plain)
                                .lineLimit(3...5)
                                .padding()
                                .background(Color.zensationSurface)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10)
                                        .stroke(Color.zensationBorder, lineWidth: 1)
                                )
                        }

                        // Trigger
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Auslöser")
                                .font(.caption)
                                .foregroundColor(.zensationTextMuted)

                            ForEach(AutomationTrigger.allCases, id: \.self) { triggerOption in
                                Button {
                                    trigger = triggerOption
                                } label: {
                                    HStack {
                                        Image(systemName: triggerOption.icon)
                                            .foregroundColor(trigger == triggerOption ? .zensationOrange : .zensationTextMuted)
                                            .frame(width: 24)

                                        VStack(alignment: .leading) {
                                            Text(triggerOption.displayName)
                                                .foregroundColor(.zensationText)
                                            Text(triggerOption.description)
                                                .font(.caption)
                                                .foregroundColor(.zensationTextMuted)
                                        }

                                        Spacer()

                                        if trigger == triggerOption {
                                            Image(systemName: "checkmark.circle.fill")
                                                .foregroundColor(.zensationOrange)
                                        }
                                    }
                                    .padding()
                                    .background(Color.zensationSurface)
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 10)
                                            .stroke(trigger == triggerOption ? Color.zensationOrange : Color.zensationBorder, lineWidth: 1)
                                    )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding()
                }
            }
            .navigationTitle("Neue Automation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarBackground(Color.zensationSurface, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Abbrechen") { dismiss() }
                        .foregroundColor(.zensationTextMuted)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Erstellen") {
                        Task { await createAutomation() }
                    }
                    .fontWeight(.semibold)
                    .foregroundColor(.zensationOrange)
                    .disabled(name.isEmpty || isSaving)
                }
            }
            .alert("Fehler", isPresented: .constant(errorMessage != nil)) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    private func createAutomation() async {
        isSaving = true
        do {
            let automation = try await apiService.createAutomation(
                name: name,
                description: description.isEmpty ? nil : description,
                trigger: trigger,
                context: contextManager.currentContext
            )
            onCreated(automation)
            dismiss()
        } catch {
            errorMessage = "Automation konnte nicht erstellt werden."
        }
        isSaving = false
    }
}

// MARK: - Automation Detail Sheet

struct AutomationDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var apiService: APIService
    @EnvironmentObject var contextManager: ContextManager

    let automation: Automation
    let onUpdated: (Automation) -> Void
    let onDeleted: () -> Void

    @State private var showDeleteConfirm = false
    @State private var isDeleting = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color.zensationBackground.ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        // Header
                        HStack {
                            Image(systemName: automation.trigger.icon)
                                .font(.title)
                                .foregroundColor(.zensationOrange)
                                .frame(width: 56, height: 56)
                                .background(Color.zensationOrange.opacity(0.15))
                                .clipShape(RoundedRectangle(cornerRadius: 12))

                            VStack(alignment: .leading, spacing: 4) {
                                Text(automation.name)
                                    .font(.title2)
                                    .fontWeight(.bold)
                                    .foregroundColor(.zensationText)

                                Text(automation.trigger.displayName)
                                    .font(.subheadline)
                                    .foregroundColor(.zensationTextMuted)
                            }
                        }

                        if let description = automation.description {
                            Text(description)
                                .font(.body)
                                .foregroundColor(.zensationTextMuted)
                        }

                        // Status
                        HStack {
                            Text("Status")
                                .font(.headline)
                                .foregroundColor(.zensationText)
                            Spacer()
                            Text(automation.enabled ? "Aktiv" : "Inaktiv")
                                .font(.subheadline)
                                .foregroundColor(automation.enabled ? .zensationSuccess : .zensationTextMuted)
                        }
                        .padding()
                        .background(Color.zensationSurface)
                        .clipShape(RoundedRectangle(cornerRadius: 10))

                        // Actions
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Aktionen (\(automation.actions.count))")
                                .font(.headline)
                                .foregroundColor(.zensationText)

                            ForEach(automation.actions, id: \.type) { action in
                                HStack {
                                    Image(systemName: "arrow.right.circle.fill")
                                        .foregroundColor(.zensationOrange)
                                    Text(action.type)
                                        .foregroundColor(.zensationText)
                                    Spacer()
                                }
                                .padding()
                                .background(Color.zensationSurface)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                        }

                        // Delete Button
                        Button(role: .destructive) {
                            showDeleteConfirm = true
                        } label: {
                            Label("Automation löschen", systemImage: "trash")
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(Color.zensationDanger.opacity(0.1))
                                .foregroundColor(.zensationDanger)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                        .disabled(isDeleting)
                    }
                    .padding()
                }
            }
            .navigationTitle("Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarBackground(Color.zensationSurface, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fertig") { dismiss() }
                        .foregroundColor(.zensationOrange)
                }
            }
            .confirmationDialog("Automation löschen?", isPresented: $showDeleteConfirm) {
                Button("Löschen", role: .destructive) {
                    Task { await deleteAutomation() }
                }
                Button("Abbrechen", role: .cancel) {}
            }
        }
    }

    private func deleteAutomation() async {
        isDeleting = true
        do {
            try await apiService.deleteAutomation(id: automation.id, context: contextManager.currentContext)
            onDeleted()
            dismiss()
        } catch {
            // Show error
        }
        isDeleting = false
    }
}

// MARK: - Models

struct Automation: Identifiable, Codable {
    let id: String
    var name: String
    var description: String?
    var trigger: AutomationTrigger
    var actions: [AutomationAction]
    var enabled: Bool
    var lastRun: Date?
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, name, description, trigger, actions, enabled
        case lastRun = "last_run"
        case createdAt = "created_at"
    }
}

struct AutomationAction: Codable {
    let type: String
    let config: [String: String]?
}

enum AutomationTrigger: String, Codable, CaseIterable {
    case manual
    case schedule
    case newIdea = "new_idea"
    case dailyDigest = "daily_digest"

    var icon: String {
        switch self {
        case .manual: return "hand.tap"
        case .schedule: return "clock"
        case .newIdea: return "lightbulb"
        case .dailyDigest: return "calendar"
        }
    }

    var displayName: String {
        switch self {
        case .manual: return "Manuell"
        case .schedule: return "Zeitplan"
        case .newIdea: return "Neue Idee"
        case .dailyDigest: return "Tägliches Digest"
        }
    }

    var description: String {
        switch self {
        case .manual: return "Wird manuell gestartet"
        case .schedule: return "Läuft nach Zeitplan"
        case .newIdea: return "Bei jeder neuen Idee"
        case .dailyDigest: return "Einmal täglich"
        }
    }
}

#Preview {
    NavigationStack {
        AutomationsView()
            .environmentObject(APIService())
            .environmentObject(ContextManager.shared)
    }
}

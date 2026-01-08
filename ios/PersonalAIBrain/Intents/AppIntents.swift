import AppIntents
import SwiftUI

/// Phase 13.3: App Intents for Siri Shortcuts
/// Enables voice commands and Shortcuts app integration

// MARK: - Record Voice Memo Intent

struct RecordVoiceMemoIntent: AppIntent {
    static var title: LocalizedStringResource = "Sprachmemo aufnehmen"
    static var description = IntentDescription("Startet eine neue Sprachaufnahme in Personal AI Brain")

    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult & OpensIntent {
        // Open app to record view
        return .result(opensIntent: OpenRecordViewIntent())
    }
}

struct OpenRecordViewIntent: OpenIntent {
    static var title: LocalizedStringResource = "Aufnahme öffnen"

    @MainActor
    func perform() async throws -> some IntentResult {
        // Navigate to record view via URL scheme
        if let url = URL(string: "personalai://record") {
            await UIApplication.shared.open(url)
        }
        return .result()
    }
}

// MARK: - Create Text Idea Intent

struct CreateTextIdeaIntent: AppIntent {
    static var title: LocalizedStringResource = "Idee erfassen"
    static var description = IntentDescription("Erstellt eine neue Idee aus Text")

    @Parameter(title: "Text", description: "Der Inhalt der Idee")
    var text: String

    @Parameter(title: "Kontext", default: .personal)
    var context: IntentContext

    static var parameterSummary: some ParameterSummary {
        Summary("Idee erfassen: \(\.$text)") {
            \.$context
        }
    }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        // Send text to backend
        do {
            let apiService = APIService()
            let contextValue = context == .personal ? "personal" : "work"
            let idea = try await apiService.processText(text, context: contextValue)
            return .result(value: "Idee '\(idea.title)' wurde erstellt!")
        } catch {
            throw IntentError.generic("Fehler beim Erstellen der Idee: \(error.localizedDescription)")
        }
    }
}

// MARK: - Search Ideas Intent

struct SearchIdeasIntent: AppIntent {
    static var title: LocalizedStringResource = "Ideen suchen"
    static var description = IntentDescription("Sucht in deinen Ideen")

    @Parameter(title: "Suchbegriff")
    var query: String

    @Parameter(title: "Kontext", default: .personal)
    var context: IntentContext

    static var parameterSummary: some ParameterSummary {
        Summary("Suche nach \(\.$query)") {
            \.$context
        }
    }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let apiService = APIService()
        let contextValue = context == .personal ? "personal" : "work"

        do {
            let results = try await apiService.searchIdeas(query: query, context: contextValue)
            if results.isEmpty {
                return .result(value: "Keine Ideen gefunden für '\(query)'")
            }
            let titles = results.prefix(3).map { $0.title }.joined(separator: ", ")
            return .result(value: "Gefunden: \(titles)")
        } catch {
            throw IntentError.generic("Fehler bei der Suche: \(error.localizedDescription)")
        }
    }
}

// MARK: - Get Recent Ideas Intent

struct GetRecentIdeasIntent: AppIntent {
    static var title: LocalizedStringResource = "Letzte Ideen abrufen"
    static var description = IntentDescription("Zeigt deine letzten Ideen")

    @Parameter(title: "Anzahl", default: 5)
    var count: Int

    @Parameter(title: "Kontext", default: .personal)
    var context: IntentContext

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let apiService = APIService()
        let contextValue = context == .personal ? "personal" : "work"

        do {
            let ideas = try await apiService.fetchIdeas(context: contextValue, limit: count)
            if ideas.isEmpty {
                return .result(value: "Noch keine Ideen vorhanden")
            }
            let summaries = ideas.prefix(count).enumerated().map { index, idea in
                "\(index + 1). \(idea.title)"
            }.joined(separator: "\n")
            return .result(value: "Deine letzten Ideen:\n\(summaries)")
        } catch {
            throw IntentError.generic("Fehler beim Laden: \(error.localizedDescription)")
        }
    }
}

// MARK: - Add Thought to Incubator Intent

struct AddThoughtIntent: AppIntent {
    static var title: LocalizedStringResource = "Gedanken zum Inkubator hinzufügen"
    static var description = IntentDescription("Fügt einen losen Gedanken zum Inkubator hinzu")

    @Parameter(title: "Gedanke")
    var thought: String

    static var parameterSummary: some ParameterSummary {
        Summary("Gedanke hinzufügen: \(\.$thought)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        do {
            let _ = try await IncubatorService.shared.addThought(thought)
            return .result(value: "Gedanke wurde zum Inkubator hinzugefügt!")
        } catch {
            throw IntentError.generic("Fehler: \(error.localizedDescription)")
        }
    }
}

// MARK: - Switch Context Intent

struct SwitchContextIntent: AppIntent {
    static var title: LocalizedStringResource = "Kontext wechseln"
    static var description = IntentDescription("Wechselt zwischen Personal und Work Kontext")

    @Parameter(title: "Kontext")
    var context: IntentContext

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let newContext: AIContext = context == .personal ? .personal : .work
        AIContextManager.shared.currentContext = newContext
        return .result(value: "Kontext gewechselt zu: \(newContext == .personal ? "Persönlich" : "Arbeit")")
    }
}

// MARK: - Intent Context Enum

enum IntentContext: String, AppEnum {
    case personal
    case work

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Kontext"

    static var caseDisplayRepresentations: [IntentContext: DisplayRepresentation] = [
        .personal: DisplayRepresentation(title: "Persönlich", image: .init(systemName: "house")),
        .work: DisplayRepresentation(title: "Arbeit", image: .init(systemName: "briefcase"))
    ]
}

// MARK: - Intent Errors

enum IntentError: Swift.Error, CustomLocalizedStringResourceConvertible {
    case generic(String)

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .generic(let message):
            return LocalizedStringResource(stringLiteral: message)
        }
    }
}

// MARK: - App Shortcuts Provider

struct PersonalAIBrainShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: RecordVoiceMemoIntent(),
            phrases: [
                "Starte Aufnahme in \(.applicationName)",
                "Nimm eine Idee auf mit \(.applicationName)",
                "Sprachmemo in \(.applicationName)"
            ],
            shortTitle: "Aufnahme starten",
            systemImageName: "mic.fill"
        )

        AppShortcut(
            intent: CreateTextIdeaIntent(),
            phrases: [
                "Erstelle eine Idee in \(.applicationName)",
                "Neue Idee in \(.applicationName)",
                "Erfasse \(\.$text) in \(.applicationName)"
            ],
            shortTitle: "Idee erfassen",
            systemImageName: "lightbulb"
        )

        AppShortcut(
            intent: SearchIdeasIntent(),
            phrases: [
                "Suche in \(.applicationName)",
                "Finde \(\.$query) in \(.applicationName)",
                "Suche nach \(\.$query) in \(.applicationName)"
            ],
            shortTitle: "Ideen suchen",
            systemImageName: "magnifyingglass"
        )

        AppShortcut(
            intent: GetRecentIdeasIntent(),
            phrases: [
                "Zeige meine letzten Ideen in \(.applicationName)",
                "Was sind meine neuesten Ideen in \(.applicationName)"
            ],
            shortTitle: "Letzte Ideen",
            systemImageName: "list.bullet"
        )

        AppShortcut(
            intent: AddThoughtIntent(),
            phrases: [
                "Füge Gedanken hinzu in \(.applicationName)",
                "Neuer Gedanke: \(\.$thought) in \(.applicationName)"
            ],
            shortTitle: "Gedanke hinzufügen",
            systemImageName: "brain"
        )
    }
}

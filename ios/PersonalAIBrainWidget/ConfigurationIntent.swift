import AppIntents

/// Phase 13.2: Widget Configuration Intent
/// Allows users to configure which context to show in the widget
struct ConfigurationIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Widget konfigurieren"
    static var description: IntentDescription = IntentDescription("Wähle den Kontext für das Widget")

    @Parameter(title: "Kontext", default: .personal)
    var context: WidgetContext
}

/// Available contexts for the widget
enum WidgetContext: String, AppEnum {
    case personal
    case work
    case both

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Kontext"

    static var caseDisplayRepresentations: [WidgetContext: DisplayRepresentation] = [
        .personal: DisplayRepresentation(title: "Persönlich", image: .init(systemName: "house")),
        .work: DisplayRepresentation(title: "Arbeit", image: .init(systemName: "briefcase")),
        .both: DisplayRepresentation(title: "Beide", image: .init(systemName: "square.stack"))
    ]
}

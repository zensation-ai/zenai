import WidgetKit
import SwiftUI

/// Phase 13.2: Personal AI Brain Widget
/// Provides quick capture and recent ideas at a glance

// MARK: - Widget Entry

struct WidgetEntry: TimelineEntry {
    let date: Date
    let recentIdeas: [WidgetIdea]
    let totalIdeas: Int
    let configuration: ConfigurationIntent?
}

struct WidgetIdea: Identifiable {
    let id: String
    let title: String
    let type: String
    let category: String
    let createdAt: Date

    var typeIcon: String {
        switch type {
        case "task": return "checkmark.circle"
        case "note": return "note.text"
        case "question": return "questionmark.circle"
        case "reminder": return "bell"
        default: return "lightbulb"
        }
    }

    var categoryColor: Color {
        switch category {
        case "work": return .blue
        case "personal": return .green
        case "health": return .red
        case "finance": return .yellow
        case "learning": return .purple
        case "creative": return .orange
        default: return .gray
        }
    }
}

// MARK: - Timeline Provider

struct Provider: IntentTimelineProvider {
    typealias Intent = ConfigurationIntent
    typealias Entry = WidgetEntry

    func placeholder(in context: Context) -> WidgetEntry {
        WidgetEntry(
            date: Date(),
            recentIdeas: [
                WidgetIdea(id: "1", title: "Beispiel Idee", type: "idea", category: "personal", createdAt: Date())
            ],
            totalIdeas: 42,
            configuration: nil
        )
    }

    func getSnapshot(for configuration: ConfigurationIntent, in context: Context, completion: @escaping (WidgetEntry) -> Void) {
        let entry = WidgetEntry(
            date: Date(),
            recentIdeas: loadRecentIdeas(),
            totalIdeas: loadTotalIdeas(),
            configuration: configuration
        )
        completion(entry)
    }

    func getTimeline(for configuration: ConfigurationIntent, in context: Context, completion: @escaping (Timeline<WidgetEntry>) -> Void) {
        let entry = WidgetEntry(
            date: Date(),
            recentIdeas: loadRecentIdeas(),
            totalIdeas: loadTotalIdeas(),
            configuration: configuration
        )

        // Update every 15 minutes
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }

    // Load recent ideas from shared UserDefaults (App Group)
    private func loadRecentIdeas() -> [WidgetIdea] {
        guard let sharedDefaults = UserDefaults(suiteName: "group.com.personalai.brain"),
              let data = sharedDefaults.data(forKey: "recentIdeas"),
              let ideas = try? JSONDecoder().decode([WidgetIdeaData].self, from: data) else {
            return []
        }

        return ideas.prefix(3).map { idea in
            WidgetIdea(
                id: idea.id,
                title: idea.title,
                type: idea.type,
                category: idea.category,
                createdAt: idea.createdAt
            )
        }
    }

    private func loadTotalIdeas() -> Int {
        guard let sharedDefaults = UserDefaults(suiteName: "group.com.personalai.brain") else {
            return 0
        }
        return sharedDefaults.integer(forKey: "totalIdeas")
    }
}

// Data structure for decoding from shared defaults
struct WidgetIdeaData: Codable {
    let id: String
    let title: String
    let type: String
    let category: String
    let createdAt: Date
}

// MARK: - Widget Views

struct QuickCaptureWidgetView: View {
    var entry: Provider.Entry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .systemSmall:
            SmallWidgetView(entry: entry)
        case .systemMedium:
            MediumWidgetView(entry: entry)
        case .systemLarge:
            LargeWidgetView(entry: entry)
        case .accessoryCircular:
            AccessoryCircularView(entry: entry)
        case .accessoryRectangular:
            AccessoryRectangularView(entry: entry)
        case .accessoryInline:
            AccessoryInlineView(entry: entry)
        default:
            SmallWidgetView(entry: entry)
        }
    }
}

// MARK: - Small Widget

struct SmallWidgetView: View {
    let entry: WidgetEntry

    var body: some View {
        ZStack {
            ContainerRelativeShape()
                .fill(
                    LinearGradient(
                        colors: [Color(red: 0.1, green: 0.1, blue: 0.15), Color(red: 0.05, green: 0.05, blue: 0.1)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            VStack(spacing: 12) {
                // Brain Icon with tap action
                Link(destination: URL(string: "personalai://record")!) {
                    ZStack {
                        Circle()
                            .fill(Color.orange.opacity(0.2))
                            .frame(width: 50, height: 50)

                        Image(systemName: "brain.head.profile")
                            .font(.system(size: 24))
                            .foregroundColor(.orange)
                    }
                }

                Text("Schnellerfassung")
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundColor(.white)

                Text("\(entry.totalIdeas) Ideen")
                    .font(.caption2)
                    .foregroundColor(.gray)
            }
            .padding()
        }
    }
}

// MARK: - Medium Widget

struct MediumWidgetView: View {
    let entry: WidgetEntry

    var body: some View {
        ZStack {
            ContainerRelativeShape()
                .fill(
                    LinearGradient(
                        colors: [Color(red: 0.1, green: 0.1, blue: 0.15), Color(red: 0.05, green: 0.05, blue: 0.1)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            HStack(spacing: 16) {
                // Quick Actions
                VStack(spacing: 8) {
                    Link(destination: URL(string: "personalai://record")!) {
                        QuickActionButton(icon: "mic.fill", label: "Aufnahme", color: .orange)
                    }

                    Link(destination: URL(string: "personalai://text")!) {
                        QuickActionButton(icon: "square.and.pencil", label: "Text", color: .blue)
                    }
                }
                .frame(width: 80)

                // Recent Ideas
                VStack(alignment: .leading, spacing: 6) {
                    Text("Letzte Ideen")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(.gray)

                    if entry.recentIdeas.isEmpty {
                        Text("Noch keine Ideen")
                            .font(.caption)
                            .foregroundColor(.gray)
                    } else {
                        ForEach(entry.recentIdeas.prefix(2)) { idea in
                            Link(destination: URL(string: "personalai://idea/\(idea.id)")!) {
                                HStack(spacing: 6) {
                                    Image(systemName: idea.typeIcon)
                                        .font(.caption)
                                        .foregroundColor(idea.categoryColor)

                                    Text(idea.title)
                                        .font(.caption)
                                        .foregroundColor(.white)
                                        .lineLimit(1)
                                }
                            }
                        }
                    }

                    Spacer()

                    Text("\(entry.totalIdeas) Ideen gesamt")
                        .font(.caption2)
                        .foregroundColor(.gray)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding()
        }
    }
}

struct QuickActionButton: View {
    let icon: String
    let label: String
    let color: Color

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(color.opacity(0.2))
                    .frame(width: 44, height: 44)

                Image(systemName: icon)
                    .font(.system(size: 18))
                    .foregroundColor(color)
            }

            Text(label)
                .font(.caption2)
                .foregroundColor(.gray)
        }
    }
}

// MARK: - Large Widget

struct LargeWidgetView: View {
    let entry: WidgetEntry

    var body: some View {
        ZStack {
            ContainerRelativeShape()
                .fill(
                    LinearGradient(
                        colors: [Color(red: 0.1, green: 0.1, blue: 0.15), Color(red: 0.05, green: 0.05, blue: 0.1)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            VStack(spacing: 16) {
                // Header
                HStack {
                    Image(systemName: "brain.head.profile")
                        .font(.title2)
                        .foregroundColor(.orange)

                    Text("Personal AI Brain")
                        .font(.headline)
                        .foregroundColor(.white)

                    Spacer()

                    Text("\(entry.totalIdeas)")
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(.orange)
                }

                Divider()
                    .background(Color.gray.opacity(0.3))

                // Quick Actions Row
                HStack(spacing: 20) {
                    Link(destination: URL(string: "personalai://record")!) {
                        QuickActionButton(icon: "mic.fill", label: "Aufnahme", color: .orange)
                    }

                    Link(destination: URL(string: "personalai://text")!) {
                        QuickActionButton(icon: "square.and.pencil", label: "Text", color: .blue)
                    }

                    Link(destination: URL(string: "personalai://search")!) {
                        QuickActionButton(icon: "magnifyingglass", label: "Suche", color: .purple)
                    }

                    Link(destination: URL(string: "personalai://incubator")!) {
                        QuickActionButton(icon: "lightbulb", label: "Inkubator", color: .yellow)
                    }
                }

                Divider()
                    .background(Color.gray.opacity(0.3))

                // Recent Ideas
                VStack(alignment: .leading, spacing: 8) {
                    Text("Letzte Ideen")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(.gray)

                    if entry.recentIdeas.isEmpty {
                        HStack {
                            Spacer()
                            Text("Noch keine Ideen erfasst")
                                .font(.caption)
                                .foregroundColor(.gray)
                            Spacer()
                        }
                        .padding(.vertical, 20)
                    } else {
                        ForEach(entry.recentIdeas) { idea in
                            Link(destination: URL(string: "personalai://idea/\(idea.id)")!) {
                                HStack(spacing: 10) {
                                    Image(systemName: idea.typeIcon)
                                        .font(.body)
                                        .foregroundColor(idea.categoryColor)
                                        .frame(width: 24)

                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(idea.title)
                                            .font(.subheadline)
                                            .foregroundColor(.white)
                                            .lineLimit(1)

                                        Text(idea.createdAt, style: .relative)
                                            .font(.caption2)
                                            .foregroundColor(.gray)
                                    }

                                    Spacer()

                                    Image(systemName: "chevron.right")
                                        .font(.caption)
                                        .foregroundColor(.gray)
                                }
                                .padding(.vertical, 4)
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Spacer()
            }
            .padding()
        }
    }
}

// MARK: - Lock Screen Widgets (iOS 16+)

struct AccessoryCircularView: View {
    let entry: WidgetEntry

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()

            VStack(spacing: 2) {
                Image(systemName: "brain.head.profile")
                    .font(.system(size: 20))
                    .foregroundColor(.orange)

                Text("\(entry.totalIdeas)")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.primary)
            }
        }
        .widgetURL(URL(string: "personalai://record"))
    }
}

struct AccessoryRectangularView: View {
    let entry: WidgetEntry

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "brain.head.profile")
                .font(.title2)
                .foregroundColor(.orange)

            VStack(alignment: .leading, spacing: 2) {
                Text("AI Brain")
                    .font(.headline)
                    .fontWeight(.semibold)

                if let latestIdea = entry.recentIdeas.first {
                    Text(latestIdea.title)
                        .font(.caption)
                        .lineLimit(1)
                        .foregroundColor(.secondary)
                } else {
                    Text("\(entry.totalIdeas) Ideen")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Spacer()
        }
        .widgetURL(URL(string: "personalai://record"))
    }
}

struct AccessoryInlineView: View {
    let entry: WidgetEntry

    var body: some View {
        Label {
            if let latestIdea = entry.recentIdeas.first {
                Text(latestIdea.title)
            } else {
                Text("\(entry.totalIdeas) Ideen in AI Brain")
            }
        } icon: {
            Image(systemName: "brain.head.profile")
        }
    }
}

// MARK: - Widget Configuration

@main
struct PersonalAIBrainWidget: Widget {
    let kind: String = "PersonalAIBrainWidget"

    var body: some WidgetConfiguration {
        IntentConfiguration(kind: kind, intent: ConfigurationIntent.self, provider: Provider()) { entry in
            QuickCaptureWidgetView(entry: entry)
        }
        .configurationDisplayName("Personal AI Brain")
        .description("Schnellzugriff auf deine Ideen")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .systemLarge,
            .accessoryCircular,      // Lock Screen circular widget
            .accessoryRectangular,   // Lock Screen rectangular widget
            .accessoryInline         // Lock Screen inline widget
        ])
    }
}

// MARK: - Previews

struct PersonalAIBrainWidget_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            QuickCaptureWidgetView(entry: WidgetEntry(
                date: Date(),
                recentIdeas: [
                    WidgetIdea(id: "1", title: "App Architektur planen", type: "task", category: "work", createdAt: Date().addingTimeInterval(-3600)),
                    WidgetIdea(id: "2", title: "Urlaubsplanung", type: "idea", category: "personal", createdAt: Date().addingTimeInterval(-7200)),
                    WidgetIdea(id: "3", title: "Wie funktioniert SwiftUI?", type: "question", category: "learning", createdAt: Date().addingTimeInterval(-86400))
                ],
                totalIdeas: 42,
                configuration: nil
            ))
            .previewContext(WidgetPreviewContext(family: .systemSmall))
            .previewDisplayName("Small")

            QuickCaptureWidgetView(entry: WidgetEntry(
                date: Date(),
                recentIdeas: [
                    WidgetIdea(id: "1", title: "App Architektur planen", type: "task", category: "work", createdAt: Date().addingTimeInterval(-3600)),
                    WidgetIdea(id: "2", title: "Urlaubsplanung", type: "idea", category: "personal", createdAt: Date().addingTimeInterval(-7200))
                ],
                totalIdeas: 42,
                configuration: nil
            ))
            .previewContext(WidgetPreviewContext(family: .systemMedium))
            .previewDisplayName("Medium")

            QuickCaptureWidgetView(entry: WidgetEntry(
                date: Date(),
                recentIdeas: [
                    WidgetIdea(id: "1", title: "App Architektur planen", type: "task", category: "work", createdAt: Date().addingTimeInterval(-3600)),
                    WidgetIdea(id: "2", title: "Urlaubsplanung", type: "idea", category: "personal", createdAt: Date().addingTimeInterval(-7200)),
                    WidgetIdea(id: "3", title: "Wie funktioniert SwiftUI?", type: "question", category: "learning", createdAt: Date().addingTimeInterval(-86400))
                ],
                totalIdeas: 42,
                configuration: nil
            ))
            .previewContext(WidgetPreviewContext(family: .systemLarge))
            .previewDisplayName("Large")

            // Lock Screen Widgets
            QuickCaptureWidgetView(entry: WidgetEntry(
                date: Date(),
                recentIdeas: [
                    WidgetIdea(id: "1", title: "App Architektur planen", type: "task", category: "work", createdAt: Date())
                ],
                totalIdeas: 42,
                configuration: nil
            ))
            .previewContext(WidgetPreviewContext(family: .accessoryCircular))
            .previewDisplayName("Circular")

            QuickCaptureWidgetView(entry: WidgetEntry(
                date: Date(),
                recentIdeas: [
                    WidgetIdea(id: "1", title: "App Architektur planen", type: "task", category: "work", createdAt: Date())
                ],
                totalIdeas: 42,
                configuration: nil
            ))
            .previewContext(WidgetPreviewContext(family: .accessoryRectangular))
            .previewDisplayName("Rectangular")

            QuickCaptureWidgetView(entry: WidgetEntry(
                date: Date(),
                recentIdeas: [
                    WidgetIdea(id: "1", title: "App Architektur planen", type: "task", category: "work", createdAt: Date())
                ],
                totalIdeas: 42,
                configuration: nil
            ))
            .previewContext(WidgetPreviewContext(family: .accessoryInline))
            .previewDisplayName("Inline")
        }
    }
}

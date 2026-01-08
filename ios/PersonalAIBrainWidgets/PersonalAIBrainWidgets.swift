import WidgetKit
import SwiftUI

/// Phase 20: Widget Extension for Personal AI Brain
/// Provides quick access to ideas, stats, and productivity data

// MARK: - Widget Bundle

@main
struct PersonalAIBrainWidgetBundle: WidgetBundle {
    var body: some Widget {
        RecentIdeasWidget()
        ProductivityWidget()
        QuickCaptureWidget()
    }
}

// MARK: - Recent Ideas Widget

struct RecentIdeasWidget: Widget {
    let kind: String = "RecentIdeasWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: RecentIdeasProvider()) { entry in
            RecentIdeasWidgetView(entry: entry)
        }
        .configurationDisplayName("Letzte Ideen")
        .description("Zeigt deine neuesten Gedanken")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct RecentIdeasEntry: TimelineEntry {
    let date: Date
    let ideas: [WidgetIdea]
    let totalCount: Int
}

struct WidgetIdea: Identifiable {
    let id: String
    let title: String
    let type: String
    let category: String
    let createdAt: Date
}

struct RecentIdeasProvider: TimelineProvider {
    func placeholder(in context: Context) -> RecentIdeasEntry {
        RecentIdeasEntry(
            date: Date(),
            ideas: [
                WidgetIdea(id: "1", title: "Beispiel-Idee", type: "idea", category: "business", createdAt: Date())
            ],
            totalCount: 42
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (RecentIdeasEntry) -> Void) {
        let entry = loadData()
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RecentIdeasEntry>) -> Void) {
        let entry = loadData()
        // Update every 15 minutes
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }

    private func loadData() -> RecentIdeasEntry {
        let sharedDefaults = UserDefaults(suiteName: "group.com.personalai.brain")
        let totalCount = sharedDefaults?.integer(forKey: "totalIdeas") ?? 0

        var ideas: [WidgetIdea] = []

        if let data = sharedDefaults?.data(forKey: "recentIdeas"),
           let decoded = try? JSONDecoder().decode([WidgetIdeaData].self, from: data) {
            ideas = decoded.map { item in
                WidgetIdea(
                    id: item.id,
                    title: item.title,
                    type: item.type,
                    category: item.category,
                    createdAt: item.createdAt
                )
            }
        }

        return RecentIdeasEntry(date: Date(), ideas: ideas, totalCount: totalCount)
    }
}

struct WidgetIdeaData: Codable {
    let id: String
    let title: String
    let type: String
    let category: String
    let createdAt: Date
}

struct RecentIdeasWidgetView: View {
    var entry: RecentIdeasEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .systemSmall:
            SmallRecentIdeasView(entry: entry)
        case .systemMedium:
            MediumRecentIdeasView(entry: entry)
        case .systemLarge:
            LargeRecentIdeasView(entry: entry)
        default:
            SmallRecentIdeasView(entry: entry)
        }
    }
}

struct SmallRecentIdeasView: View {
    let entry: RecentIdeasEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "brain")
                    .foregroundColor(.purple)
                Text("\(entry.totalCount)")
                    .font(.title2)
                    .fontWeight(.bold)
            }

            Text("Gedanken")
                .font(.caption)
                .foregroundColor(.secondary)

            Spacer()

            if let latest = entry.ideas.first {
                Text(latest.title)
                    .font(.caption)
                    .lineLimit(2)
            }
        }
        .padding()
        .widgetBackground()
    }
}

struct MediumRecentIdeasView: View {
    let entry: RecentIdeasEntry

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Image(systemName: "brain")
                        .foregroundColor(.purple)
                    Text("AI Brain")
                        .font(.headline)
                }

                Text("\(entry.totalCount) Gedanken")
                    .font(.caption)
                    .foregroundColor(.secondary)

                Spacer()

                Link(destination: URL(string: "personalai://record")!) {
                    Label("Aufnehmen", systemImage: "mic.fill")
                        .font(.caption)
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.purple)
                        .cornerRadius(8)
                }
            }

            Divider()

            VStack(alignment: .leading, spacing: 4) {
                Text("Neueste")
                    .font(.caption)
                    .foregroundColor(.secondary)

                ForEach(entry.ideas.prefix(3)) { idea in
                    HStack(spacing: 4) {
                        Text(typeIcon(idea.type))
                            .font(.caption2)
                        Text(idea.title)
                            .font(.caption)
                            .lineLimit(1)
                    }
                }
            }
        }
        .padding()
        .widgetBackground()
    }

    private func typeIcon(_ type: String) -> String {
        switch type {
        case "idea": return "💡"
        case "task": return "✅"
        case "insight": return "🔍"
        case "problem": return "⚠️"
        case "question": return "❓"
        default: return "📝"
        }
    }
}

struct LargeRecentIdeasView: View {
    let entry: RecentIdeasEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "brain")
                    .foregroundColor(.purple)
                Text("Personal AI Brain")
                    .font(.headline)
                Spacer()
                Text("\(entry.totalCount)")
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(.purple)
            }

            Divider()

            Text("Letzte Gedanken")
                .font(.subheadline)
                .foregroundColor(.secondary)

            ForEach(entry.ideas.prefix(5)) { idea in
                HStack {
                    Text(typeIcon(idea.type))
                    VStack(alignment: .leading) {
                        Text(idea.title)
                            .font(.subheadline)
                            .lineLimit(1)
                        Text(timeAgo(idea.createdAt))
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                }
            }

            Spacer()

            HStack {
                Link(destination: URL(string: "personalai://record")!) {
                    Label("Aufnehmen", systemImage: "mic.fill")
                        .font(.caption)
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.purple)
                        .cornerRadius(8)
                }

                Spacer()

                Link(destination: URL(string: "personalai://ideas")!) {
                    Label("Alle anzeigen", systemImage: "list.bullet")
                        .font(.caption)
                        .foregroundColor(.purple)
                }
            }
        }
        .padding()
        .widgetBackground()
    }

    private func typeIcon(_ type: String) -> String {
        switch type {
        case "idea": return "💡"
        case "task": return "✅"
        case "insight": return "🔍"
        case "problem": return "⚠️"
        case "question": return "❓"
        default: return "📝"
        }
    }

    private func timeAgo(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = Locale(identifier: "de_DE")
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

// MARK: - Productivity Widget

struct ProductivityWidget: Widget {
    let kind: String = "ProductivityWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ProductivityProvider()) { entry in
            ProductivityWidgetView(entry: entry)
        }
        .configurationDisplayName("Produktivität")
        .description("Zeigt deinen Produktivitäts-Score")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct ProductivityEntry: TimelineEntry {
    let date: Date
    let score: Int
    let todayCount: Int
    let weekCount: Int
    let streak: Int
}

struct ProductivityProvider: TimelineProvider {
    func placeholder(in context: Context) -> ProductivityEntry {
        ProductivityEntry(date: Date(), score: 75, todayCount: 3, weekCount: 15, streak: 5)
    }

    func getSnapshot(in context: Context, completion: @escaping (ProductivityEntry) -> Void) {
        let entry = loadData()
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ProductivityEntry>) -> Void) {
        let entry = loadData()
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }

    private func loadData() -> ProductivityEntry {
        let sharedDefaults = UserDefaults(suiteName: "group.com.personalai.brain")
        let score = sharedDefaults?.integer(forKey: "productivityScore") ?? 0
        let todayCount = sharedDefaults?.integer(forKey: "todayCount") ?? 0
        let weekCount = sharedDefaults?.integer(forKey: "weekCount") ?? 0
        let streak = sharedDefaults?.integer(forKey: "streak") ?? 0

        return ProductivityEntry(
            date: Date(),
            score: score,
            todayCount: todayCount,
            weekCount: weekCount,
            streak: streak
        )
    }
}

struct ProductivityWidgetView: View {
    var entry: ProductivityEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .systemSmall:
            SmallProductivityView(entry: entry)
        case .systemMedium:
            MediumProductivityView(entry: entry)
        default:
            SmallProductivityView(entry: entry)
        }
    }
}

struct SmallProductivityView: View {
    let entry: ProductivityEntry

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .stroke(Color.gray.opacity(0.2), lineWidth: 8)
                Circle()
                    .trim(from: 0, to: CGFloat(entry.score) / 100)
                    .stroke(scoreColor, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                VStack {
                    Text("\(entry.score)")
                        .font(.title)
                        .fontWeight(.bold)
                        .foregroundColor(scoreColor)
                    Text("%")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
            .frame(width: 80, height: 80)

            Text("Produktivität")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding()
        .widgetBackground()
    }

    private var scoreColor: Color {
        if entry.score >= 70 { return .green }
        if entry.score >= 40 { return .orange }
        return .red
    }
}

struct MediumProductivityView: View {
    let entry: ProductivityEntry

    var body: some View {
        HStack(spacing: 20) {
            // Score
            ZStack {
                Circle()
                    .stroke(Color.gray.opacity(0.2), lineWidth: 8)
                Circle()
                    .trim(from: 0, to: CGFloat(entry.score) / 100)
                    .stroke(scoreColor, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                VStack {
                    Text("\(entry.score)")
                        .font(.title)
                        .fontWeight(.bold)
                        .foregroundColor(scoreColor)
                    Text("Score")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
            .frame(width: 80, height: 80)

            // Stats
            VStack(alignment: .leading, spacing: 8) {
                StatRow(icon: "sun.max", label: "Heute", value: "\(entry.todayCount)")
                StatRow(icon: "calendar", label: "Diese Woche", value: "\(entry.weekCount)")
                StatRow(icon: "flame.fill", label: "Serie", value: "\(entry.streak) Tage")
            }

            Spacer()
        }
        .padding()
        .widgetBackground()
    }

    private var scoreColor: Color {
        if entry.score >= 70 { return .green }
        if entry.score >= 40 { return .orange }
        return .red
    }
}

struct StatRow: View {
    let icon: String
    let label: String
    let value: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundColor(.purple)
                .frame(width: 16)
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
            Spacer()
            Text(value)
                .font(.caption)
                .fontWeight(.medium)
        }
    }
}

// MARK: - Quick Capture Widget

struct QuickCaptureWidget: Widget {
    let kind: String = "QuickCaptureWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: QuickCaptureProvider()) { entry in
            QuickCaptureWidgetView(entry: entry)
        }
        .configurationDisplayName("Schnell erfassen")
        .description("Starte schnell eine Aufnahme")
        .supportedFamilies([.systemSmall])
    }
}

struct QuickCaptureEntry: TimelineEntry {
    let date: Date
}

struct QuickCaptureProvider: TimelineProvider {
    func placeholder(in context: Context) -> QuickCaptureEntry {
        QuickCaptureEntry(date: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (QuickCaptureEntry) -> Void) {
        completion(QuickCaptureEntry(date: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<QuickCaptureEntry>) -> Void) {
        let entry = QuickCaptureEntry(date: Date())
        // Static widget, update rarely
        let nextUpdate = Calendar.current.date(byAdding: .hour, value: 1, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }
}

struct QuickCaptureWidgetView: View {
    var entry: QuickCaptureEntry

    var body: some View {
        Link(destination: URL(string: "personalai://record")!) {
            VStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(Color.purple.opacity(0.2))
                        .frame(width: 60, height: 60)
                    Image(systemName: "mic.fill")
                        .font(.title)
                        .foregroundColor(.purple)
                }

                Text("Gedanke\nerfassen")
                    .font(.caption)
                    .multilineTextAlignment(.center)
                    .foregroundColor(.primary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .widgetBackground()
    }
}

// MARK: - Widget Background Extension

extension View {
    func widgetBackground() -> some View {
        if #available(iOS 17.0, *) {
            return self.containerBackground(.fill.tertiary, for: .widget)
        } else {
            return self.background(Color(.systemBackground))
        }
    }
}

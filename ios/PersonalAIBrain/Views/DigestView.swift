import SwiftUI

/// Phase 20: Digest View
/// Displays daily and weekly digests with AI-generated insights
struct DigestView: View {
    @StateObject private var viewModel = DigestViewModel()
    @State private var selectedTab = 0

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Tab Picker
                Picker("Digest Type", selection: $selectedTab) {
                    Text("Heute").tag(0)
                    Text("Woche").tag(1)
                    Text("Historie").tag(2)
                }
                .pickerStyle(.segmented)
                .padding()

                // Content
                TabView(selection: $selectedTab) {
                    DailyDigestTab(viewModel: viewModel)
                        .tag(0)

                    WeeklyDigestTab(viewModel: viewModel)
                        .tag(1)

                    DigestHistoryTab(viewModel: viewModel)
                        .tag(2)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
            }
            .navigationTitle("Digest")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { viewModel.refresh() }) {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
        }
        .onAppear {
            viewModel.loadDigests()
        }
        .alert("Fehler", isPresented: .constant(viewModel.error != nil)) {
            Button("OK") {
                viewModel.error = nil
            }
        } message: {
            Text(viewModel.error ?? "")
        }
    }
}

// MARK: - Daily Digest Tab

struct DailyDigestTab: View {
    @ObservedObject var viewModel: DigestViewModel

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                if viewModel.isLoading {
                    ProgressView("Lade Digest...")
                        .padding(.top, 40)
                } else if let digest = viewModel.dailyDigest {
                    DigestCard(digest: digest)
                } else {
                    EmptyDigestView(
                        type: "daily",
                        onGenerate: { viewModel.generateDailyDigest() }
                    )
                }
            }
            .padding()
        }
    }
}

// MARK: - Weekly Digest Tab

struct WeeklyDigestTab: View {
    @ObservedObject var viewModel: DigestViewModel

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                if viewModel.isLoading {
                    ProgressView("Lade Insights...")
                        .padding(.top, 40)
                } else if let digest = viewModel.weeklyDigest {
                    DigestCard(digest: digest)
                } else {
                    EmptyDigestView(
                        type: "weekly",
                        onGenerate: { viewModel.generateWeeklyDigest() }
                    )
                }
            }
            .padding()
        }
    }
}

// MARK: - Digest History Tab

struct DigestHistoryTab: View {
    @ObservedObject var viewModel: DigestViewModel

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                if viewModel.digestHistory.isEmpty {
                    Text("Noch keine Digests vorhanden")
                        .foregroundColor(.secondary)
                        .padding(.top, 40)
                } else {
                    ForEach(viewModel.digestHistory) { digest in
                        DigestHistoryRow(digest: digest)
                    }
                }
            }
            .padding()
        }
    }
}

// MARK: - Digest Card

struct DigestCard: View {
    let digest: Digest

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(digest.title)
                        .font(.headline)
                    Text(formatPeriod(digest))
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Spacer()
                ProductivityBadge(score: digest.productivityScore)
            }

            Divider()

            // Summary
            Text(digest.summary)
                .font(.body)
                .foregroundColor(.primary)

            // Statistics
            if !digest.statistics.byType.isEmpty {
                StatisticsSection(stats: digest.statistics)
            }

            // Highlights
            if !digest.highlights.isEmpty {
                HighlightsSection(highlights: digest.highlights)
            }

            // AI Insights
            if !digest.aiInsights.isEmpty {
                InsightsSection(insights: digest.aiInsights)
            }

            // Recommendations
            if !digest.recommendations.isEmpty {
                RecommendationsSection(recommendations: digest.recommendations)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(color: .black.opacity(0.1), radius: 8, y: 4)
    }

    private func formatPeriod(_ digest: Digest) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "de_DE")
        formatter.dateStyle = .medium

        if digest.type == "daily" {
            return formatter.string(from: digest.periodStart)
        } else {
            return "\(formatter.string(from: digest.periodStart)) - \(formatter.string(from: digest.periodEnd))"
        }
    }
}

// MARK: - Supporting Views

struct ProductivityBadge: View {
    let score: Int

    var body: some View {
        ZStack {
            Circle()
                .stroke(scoreColor.opacity(0.3), lineWidth: 4)
            Circle()
                .trim(from: 0, to: CGFloat(score) / 100)
                .stroke(scoreColor, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("\(score)")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(scoreColor)
        }
        .frame(width: 50, height: 50)
    }

    private var scoreColor: Color {
        if score >= 70 { return .green }
        if score >= 40 { return .orange }
        return .red
    }
}

struct StatisticsSection: View {
    let stats: DigestStatistics

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Statistiken")
                .font(.subheadline)
                .fontWeight(.semibold)

            HStack(spacing: 16) {
                StatBadge(label: "Gesamt", value: "\(stats.totalIdeas)", icon: "lightbulb")

                if let avgPerDay = stats.avgPerDay {
                    StatBadge(label: "Pro Tag", value: String(format: "%.1f", avgPerDay), icon: "chart.line.uptrend.xyaxis")
                }
            }

            // Type breakdown
            if !stats.byType.isEmpty {
                HStack(spacing: 8) {
                    ForEach(Array(stats.byType.keys.prefix(4)), id: \.self) { type in
                        if let count = stats.byType[type] {
                            TypeBadge(type: type, count: count)
                        }
                    }
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }
}

struct StatBadge: View {
    let label: String
    let value: String
    let icon: String

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundColor(.accentColor)
            VStack(alignment: .leading, spacing: 2) {
                Text(value)
                    .font(.headline)
                Text(label)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
    }
}

struct TypeBadge: View {
    let type: String
    let count: Int

    var body: some View {
        HStack(spacing: 4) {
            Text(typeIcon)
            Text("\(count)")
                .font(.caption)
                .fontWeight(.medium)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(typeColor.opacity(0.2))
        .cornerRadius(8)
    }

    private var typeIcon: String {
        switch type {
        case "idea": return "💡"
        case "task": return "✅"
        case "insight": return "🔍"
        case "problem": return "⚠️"
        case "question": return "❓"
        default: return "📝"
        }
    }

    private var typeColor: Color {
        switch type {
        case "idea": return .yellow
        case "task": return .green
        case "insight": return .blue
        case "problem": return .red
        case "question": return .purple
        default: return .gray
        }
    }
}

struct HighlightsSection: View {
    let highlights: [DigestHighlight]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Highlights", systemImage: "star.fill")
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundColor(.orange)

            ForEach(highlights) { highlight in
                HStack {
                    Text(highlight.title)
                        .font(.subheadline)
                    Spacer()
                    Text(highlight.reason)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 4)
            }
        }
        .padding()
        .background(Color.orange.opacity(0.1))
        .cornerRadius(12)
    }
}

struct InsightsSection: View {
    let insights: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("AI Erkenntnisse", systemImage: "brain")
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundColor(.purple)

            ForEach(insights, id: \.self) { insight in
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "sparkle")
                        .font(.caption)
                        .foregroundColor(.purple)
                    Text(insight)
                        .font(.subheadline)
                }
            }
        }
        .padding()
        .background(Color.purple.opacity(0.1))
        .cornerRadius(12)
    }
}

struct RecommendationsSection: View {
    let recommendations: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Empfehlungen", systemImage: "lightbulb")
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundColor(.green)

            ForEach(recommendations, id: \.self) { rec in
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "arrow.right.circle.fill")
                        .font(.caption)
                        .foregroundColor(.green)
                    Text(rec)
                        .font(.subheadline)
                }
            }
        }
        .padding()
        .background(Color.green.opacity(0.1))
        .cornerRadius(12)
    }
}

struct EmptyDigestView: View {
    let type: String
    let onGenerate: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: type == "daily" ? "sun.max" : "calendar")
                .font(.system(size: 48))
                .foregroundColor(.secondary)

            Text(type == "daily" ? "Kein Tages-Digest vorhanden" : "Kein Wochen-Digest vorhanden")
                .font(.headline)

            Text(type == "daily"
                 ? "Erstelle einen Digest mit einer Zusammenfassung deiner heutigen Gedanken."
                 : "Erstelle einen Digest mit Insights aus deiner Woche.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)

            Button(action: onGenerate) {
                Label("Jetzt generieren", systemImage: "sparkles")
                    .font(.headline)
                    .foregroundColor(.white)
                    .padding()
                    .background(Color.accentColor)
                    .cornerRadius(12)
            }
        }
        .padding(40)
    }
}

struct DigestHistoryRow: View {
    let digest: Digest

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(digest.title)
                    .font(.subheadline)
                    .fontWeight(.medium)
                Text("\(digest.ideasCount) Gedanken")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            Spacer()
            ProductivityBadge(score: digest.productivityScore)
                .scaleEffect(0.7)
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }
}

// MARK: - View Model

@MainActor
class DigestViewModel: ObservableObject {
    @Published var dailyDigest: Digest?
    @Published var weeklyDigest: Digest?
    @Published var digestHistory: [Digest] = []
    @Published var isLoading = false
    @Published var error: String?

    private let apiService = APIService.shared

    func loadDigests() {
        Task {
            isLoading = true
            defer { isLoading = false }

            do {
                async let daily = loadLatestDigest(type: "daily")
                async let weekly = loadLatestDigest(type: "weekly")
                async let history = loadDigestHistory()

                dailyDigest = try await daily
                weeklyDigest = try await weekly
                digestHistory = try await history
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    func refresh() {
        loadDigests()
    }

    func generateDailyDigest() {
        Task {
            isLoading = true
            defer { isLoading = false }

            do {
                dailyDigest = try await apiService.generateDigest(type: "daily")
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    func generateWeeklyDigest() {
        Task {
            isLoading = true
            defer { isLoading = false }

            do {
                weeklyDigest = try await apiService.generateDigest(type: "weekly")
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func loadLatestDigest(type: String) async throws -> Digest? {
        return try await apiService.getLatestDigest(type: type)
    }

    private func loadDigestHistory() async throws -> [Digest] {
        return try await apiService.getDigestHistory(limit: 10)
    }
}

// MARK: - Models

struct Digest: Identifiable, Codable {
    let id: String
    let type: String
    let periodStart: Date
    let periodEnd: Date
    let title: String
    let summary: String
    let highlights: [DigestHighlight]
    let statistics: DigestStatistics
    let aiInsights: [String]
    let recommendations: [String]
    let ideasCount: Int
    let topCategories: [String]
    let topTypes: [String]
    let productivityScore: Int
    let createdAt: Date
}

struct DigestHighlight: Identifiable, Codable {
    var id: String { "\(title)-\(type)" }
    let title: String
    let type: String
    let category: String
    let reason: String

    private enum CodingKeys: String, CodingKey {
        case title, type, category, reason
    }
}

struct DigestStatistics: Codable {
    let totalIdeas: Int
    let byType: [String: Int]
    let byCategory: [String: Int]
    let byPriority: [String: Int]
    let avgPerDay: Double?
}

// MARK: - Preview

struct DigestView_Previews: PreviewProvider {
    static var previews: some View {
        DigestView()
    }
}

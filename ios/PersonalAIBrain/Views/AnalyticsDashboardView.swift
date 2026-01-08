import SwiftUI
import Charts

/// Phase 20: Analytics Dashboard View
/// Comprehensive analytics with trends, patterns, and productivity tracking
struct AnalyticsDashboardView: View {
    @StateObject private var viewModel = AnalyticsViewModel()
    @State private var selectedPeriod: AnalyticsPeriod = .week

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    // Period Picker
                    Picker("Zeitraum", selection: $selectedPeriod) {
                        ForEach(AnalyticsPeriod.allCases, id: \.self) { period in
                            Text(period.label).tag(period)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal)

                    if viewModel.isLoading {
                        ProgressView("Lade Analytics...")
                            .padding(.top, 40)
                    } else {
                        // Productivity Score Card
                        ProductivityScoreCard(score: viewModel.productivityScore)

                        // Summary Stats
                        SummaryStatsCard(summary: viewModel.summary)

                        // Goals Progress
                        GoalsProgressCard(goals: viewModel.goals)

                        // Streaks
                        StreaksCard(streaks: viewModel.streaks)

                        // Activity Chart
                        ActivityChartCard(activity: viewModel.hourlyActivity)

                        // Trends
                        TrendChartCard(trends: viewModel.weeklyTrend, title: "Wöchentlicher Trend")

                        // Patterns
                        PatternsCard(patterns: viewModel.patterns)

                        // Comparison
                        ComparisonCard(comparison: viewModel.comparison)
                    }
                }
                .padding()
            }
            .navigationTitle("Analytics")
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
            viewModel.loadDashboard()
        }
        .onChange(of: selectedPeriod) { _, _ in
            viewModel.loadDashboard()
        }
    }
}

// MARK: - Productivity Score Card

struct ProductivityScoreCard: View {
    let score: ProductivityScoreData?

    var body: some View {
        VStack(spacing: 16) {
            Text("Produktivitäts-Score")
                .font(.headline)

            if let score = score {
                ZStack {
                    Circle()
                        .stroke(Color.gray.opacity(0.2), lineWidth: 12)
                    Circle()
                        .trim(from: 0, to: CGFloat(score.overall) / 100)
                        .stroke(scoreColor(score.overall), style: StrokeStyle(lineWidth: 12, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .animation(.easeOut(duration: 0.8), value: score.overall)
                    VStack {
                        Text("\(score.overall)")
                            .font(.system(size: 42, weight: .bold))
                            .foregroundColor(scoreColor(score.overall))
                        Text(score.trend.label)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .frame(width: 140, height: 140)

                // Breakdown
                HStack(spacing: 16) {
                    ScoreBreakdownItem(
                        label: "Output",
                        score: score.breakdown.output.score,
                        icon: "chart.bar.fill"
                    )
                    ScoreBreakdownItem(
                        label: "Konsistenz",
                        score: score.breakdown.consistency.score,
                        icon: "calendar"
                    )
                    ScoreBreakdownItem(
                        label: "Vielfalt",
                        score: score.breakdown.variety.score,
                        icon: "square.grid.2x2"
                    )
                    ScoreBreakdownItem(
                        label: "Qualität",
                        score: score.breakdown.quality.score,
                        icon: "star.fill"
                    )
                }
            } else {
                Text("Keine Daten verfügbar")
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(color: .black.opacity(0.1), radius: 8, y: 4)
    }

    private func scoreColor(_ score: Int) -> Color {
        if score >= 70 { return .green }
        if score >= 40 { return .orange }
        return .red
    }
}

struct ScoreBreakdownItem: View {
    let label: String
    let score: Int
    let icon: String

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundColor(scoreColor)
            Text("\(score)")
                .font(.headline)
                .foregroundColor(scoreColor)
            Text(label)
                .font(.caption2)
                .foregroundColor(.secondary)
        }
    }

    private var scoreColor: Color {
        if score >= 70 { return .green }
        if score >= 40 { return .orange }
        return .red
    }
}

// MARK: - Summary Stats Card

struct SummaryStatsCard: View {
    let summary: AnalyticsSummary?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Übersicht")
                .font(.headline)

            if let summary = summary {
                LazyVGrid(columns: [
                    GridItem(.flexible()),
                    GridItem(.flexible()),
                    GridItem(.flexible())
                ], spacing: 16) {
                    SummaryStatItem(value: "\(summary.today)", label: "Heute", icon: "sun.max")
                    SummaryStatItem(value: "\(summary.thisWeek)", label: "Diese Woche", icon: "calendar")
                    SummaryStatItem(value: "\(summary.thisMonth)", label: "Dieser Monat", icon: "calendar.badge.clock")
                    SummaryStatItem(value: "\(summary.total)", label: "Gesamt", icon: "tray.full")
                    SummaryStatItem(value: "\(summary.highPriority)", label: "Hohe Prio", icon: "exclamationmark.circle", color: .red)
                }
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(color: .black.opacity(0.1), radius: 8, y: 4)
    }
}

struct SummaryStatItem: View {
    let value: String
    let label: String
    let icon: String
    var color: Color = .accentColor

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .foregroundColor(color)
            Text(value)
                .font(.title2)
                .fontWeight(.bold)
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }
}

// MARK: - Goals Progress Card

struct GoalsProgressCard: View {
    let goals: GoalsData?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Ziele")
                .font(.headline)

            if let goals = goals {
                VStack(spacing: 16) {
                    GoalProgressRow(
                        label: "Tägliches Ziel",
                        current: goals.daily.current,
                        target: goals.daily.target,
                        progress: goals.daily.progress
                    )

                    GoalProgressRow(
                        label: "Wöchentliches Ziel",
                        current: goals.weekly.current,
                        target: goals.weekly.target,
                        progress: goals.weekly.progress
                    )
                }
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(color: .black.opacity(0.1), radius: 8, y: 4)
    }
}

struct GoalProgressRow: View {
    let label: String
    let current: Int
    let target: Int
    let progress: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(label)
                    .font(.subheadline)
                Spacer()
                Text("\(current)/\(target)")
                    .font(.subheadline)
                    .fontWeight(.medium)
            }

            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.gray.opacity(0.2))
                        .frame(height: 8)

                    Capsule()
                        .fill(progressColor)
                        .frame(width: geometry.size.width * CGFloat(min(progress, 100)) / 100, height: 8)
                        .animation(.easeOut(duration: 0.5), value: progress)
                }
            }
            .frame(height: 8)
        }
    }

    private var progressColor: Color {
        if progress >= 100 { return .green }
        if progress >= 50 { return .orange }
        return .blue
    }
}

// MARK: - Streaks Card

struct StreaksCard: View {
    let streaks: StreakData?

    var body: some View {
        HStack(spacing: 20) {
            StreakItem(
                value: streaks?.current ?? 0,
                label: "Aktuelle Serie",
                icon: "flame.fill",
                color: .orange
            )

            Divider()
                .frame(height: 50)

            StreakItem(
                value: streaks?.longest ?? 0,
                label: "Längste Serie",
                icon: "trophy.fill",
                color: .yellow
            )
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(color: .black.opacity(0.1), radius: 8, y: 4)
    }
}

struct StreakItem: View {
    let value: Int
    let label: String
    let icon: String
    let color: Color

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.title)
                .foregroundColor(color)

            VStack(alignment: .leading) {
                Text("\(value) Tage")
                    .font(.title2)
                    .fontWeight(.bold)
                Text(label)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
    }
}

// MARK: - Activity Chart Card

struct ActivityChartCard: View {
    let activity: [HourlyActivity]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Aktivität nach Uhrzeit")
                .font(.headline)

            if #available(iOS 16.0, *) {
                Chart(activity, id: \.hour) { item in
                    BarMark(
                        x: .value("Stunde", item.hour),
                        y: .value("Anzahl", item.count)
                    )
                    .foregroundStyle(Color.accentColor.gradient)
                }
                .frame(height: 150)
                .chartXAxis {
                    AxisMarks(values: [0, 6, 12, 18, 23]) { value in
                        AxisValueLabel {
                            if let hour = value.as(Int.self) {
                                Text("\(hour)")
                            }
                        }
                    }
                }
            } else {
                // Fallback for iOS 15
                HStack(alignment: .bottom, spacing: 4) {
                    ForEach(activity, id: \.hour) { item in
                        VStack {
                            Rectangle()
                                .fill(Color.accentColor)
                                .frame(width: 8, height: max(4, CGFloat(item.count) * 10))
                        }
                    }
                }
                .frame(height: 100)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(color: .black.opacity(0.1), radius: 8, y: 4)
    }
}

// MARK: - Trend Chart Card

struct TrendChartCard: View {
    let trends: [WeeklyTrendItem]
    let title: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.headline)

            if #available(iOS 16.0, *) {
                Chart(trends, id: \.week) { item in
                    LineMark(
                        x: .value("Woche", item.week, unit: .weekOfYear),
                        y: .value("Anzahl", item.count)
                    )
                    .foregroundStyle(Color.accentColor)

                    AreaMark(
                        x: .value("Woche", item.week, unit: .weekOfYear),
                        y: .value("Anzahl", item.count)
                    )
                    .foregroundStyle(Color.accentColor.opacity(0.2))
                }
                .frame(height: 150)
            } else {
                // Fallback
                Text("Charts benötigen iOS 16+")
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(color: .black.opacity(0.1), radius: 8, y: 4)
    }
}

// MARK: - Patterns Card

struct PatternsCard: View {
    let patterns: PatternsData?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Muster & Insights")
                .font(.headline)

            if let patterns = patterns {
                ForEach(patterns.insights, id: \.self) { insight in
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "sparkle")
                            .foregroundColor(.purple)
                        Text(insight)
                            .font(.subheadline)
                    }
                }

                Divider()

                // Peak times
                HStack {
                    VStack(alignment: .leading) {
                        Text("Produktivste Zeit")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        if let peakHour = patterns.peakTimes.hours.first {
                            Text(peakHour.label)
                                .font(.subheadline)
                                .fontWeight(.medium)
                        }
                    }
                    Spacer()
                    VStack(alignment: .trailing) {
                        Text("Aktivster Tag")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        if let peakDay = patterns.peakTimes.days.first {
                            Text(peakDay.label)
                                .font(.subheadline)
                                .fontWeight(.medium)
                        }
                    }
                }
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(color: .black.opacity(0.1), radius: 8, y: 4)
    }
}

// MARK: - Comparison Card

struct ComparisonCard: View {
    let comparison: ComparisonData?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Vergleich zur Vorwoche")
                .font(.headline)

            if let comparison = comparison {
                HStack(spacing: 20) {
                    ComparisonItem(
                        label: "Gedanken",
                        current: comparison.current.total,
                        change: comparison.changes.total
                    )
                    ComparisonItem(
                        label: "Hohe Prio",
                        current: comparison.current.highPriority,
                        change: comparison.changes.highPriority
                    )
                    ComparisonItem(
                        label: "Aktive Tage",
                        current: comparison.current.activeDays,
                        change: comparison.changes.activeDays
                    )
                }
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(color: .black.opacity(0.1), radius: 8, y: 4)
    }
}

struct ComparisonItem: View {
    let label: String
    let current: Int
    let change: Int

    var body: some View {
        VStack(spacing: 4) {
            Text("\(current)")
                .font(.title2)
                .fontWeight(.bold)
            HStack(spacing: 2) {
                Image(systemName: change >= 0 ? "arrow.up" : "arrow.down")
                    .font(.caption2)
                Text("\(abs(change))%")
                    .font(.caption)
            }
            .foregroundColor(change >= 0 ? .green : .red)
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }
}

// MARK: - View Model

@MainActor
class AnalyticsViewModel: ObservableObject {
    @Published var productivityScore: ProductivityScoreData?
    @Published var summary: AnalyticsSummary?
    @Published var goals: GoalsData?
    @Published var streaks: StreakData?
    @Published var hourlyActivity: [HourlyActivity] = []
    @Published var weeklyTrend: [WeeklyTrendItem] = []
    @Published var patterns: PatternsData?
    @Published var comparison: ComparisonData?
    @Published var isLoading = false

    private let apiService = APIService.shared

    func loadDashboard() {
        Task {
            isLoading = true
            defer { isLoading = false }

            do {
                let dashboard = try await apiService.getAnalyticsDashboard()
                let scoreData = try await apiService.getProductivityScore()
                let patternsData = try await apiService.getPatterns()
                let comparisonData = try await apiService.getComparison()

                summary = dashboard.summary
                goals = dashboard.goals
                streaks = dashboard.streaks
                hourlyActivity = dashboard.activity.byHour
                weeklyTrend = dashboard.trends.weekly
                productivityScore = scoreData
                patterns = patternsData
                comparison = comparisonData
            } catch {
                print("Analytics error: \(error)")
            }
        }
    }

    func refresh() {
        loadDashboard()
    }
}

// MARK: - Models

enum AnalyticsPeriod: CaseIterable {
    case week, month

    var label: String {
        switch self {
        case .week: return "Woche"
        case .month: return "Monat"
        }
    }
}

struct AnalyticsSummary: Codable {
    let total: Int
    let today: Int
    let thisWeek: Int
    let thisMonth: Int
    let highPriority: Int
}

struct GoalsData: Codable {
    let daily: GoalProgress
    let weekly: GoalProgress
}

struct GoalProgress: Codable {
    let target: Int
    let current: Int
    let progress: Int
}

struct StreakData: Codable {
    let current: Int
    let longest: Int
}

struct HourlyActivity: Codable {
    let hour: Int
    let count: Int
}

struct WeeklyTrendItem: Codable {
    let week: Date
    let count: Int
}

struct ProductivityScoreData: Codable {
    let overall: Int
    let breakdown: ScoreBreakdown
    let trend: ScoreTrend
}

struct ScoreBreakdown: Codable {
    let output: ScoreComponent
    let consistency: ScoreComponent
    let variety: ScoreComponent
    let quality: ScoreComponent
}

struct ScoreComponent: Codable {
    let score: Int
    let label: String
    let description: String
}

struct ScoreTrend: Codable {
    let label: String

    private enum CodingKeys: String, CodingKey {
        case label = "trend"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let trendString = try container.decode(String.self)
        switch trendString {
        case "excellent": label = "Ausgezeichnet"
        case "good": label = "Gut"
        case "moderate": label = "Moderat"
        default: label = "Verbesserungsbedarf"
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(label)
    }
}

struct PatternsData: Codable {
    let peakTimes: PeakTimes
    let insights: [String]
}

struct PeakTimes: Codable {
    let hours: [PeakHour]
    let days: [PeakDay]
}

struct PeakHour: Codable {
    let hour: Int
    let label: String
    let count: Int
}

struct PeakDay: Codable {
    let day: Int
    let label: String
    let count: Int
}

struct ComparisonData: Codable {
    let current: ComparisonPeriod
    let previous: ComparisonPeriod
    let changes: ComparisonChanges
}

struct ComparisonPeriod: Codable {
    let total: Int
    let highPriority: Int
    let tasks: Int
    let ideas: Int
    let activeDays: Int
}

struct ComparisonChanges: Codable {
    let total: Int
    let highPriority: Int
    let tasks: Int
    let ideas: Int
    let activeDays: Int
}

// MARK: - Preview

struct AnalyticsDashboardView_Previews: PreviewProvider {
    static var previews: some View {
        AnalyticsDashboardView()
    }
}

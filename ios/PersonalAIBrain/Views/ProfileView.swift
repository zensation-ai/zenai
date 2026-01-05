import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var apiService: APIService
    @State private var stats: ProfileStatsResponse?
    @State private var recommendations: Recommendations?
    @State private var isLoading = true
    @State private var autoPriorityEnabled = false

    var body: some View {
        NavigationView {
            ScrollView {
                if isLoading {
                    VStack {
                        Spacer()
                        ProgressView()
                        Spacer()
                    }
                    .frame(minHeight: 400)
                } else {
                    VStack(spacing: 20) {
                        // Stats Cards
                        if let stats = stats {
                            StatsGridView(stats: stats)
                        }

                        // Insights
                        if let recs = recommendations, !recs.insights.isEmpty {
                            InsightsView(insights: recs.insights)
                        }

                        // Optimal Hours
                        if let recs = recommendations, !recs.optimalHours.isEmpty {
                            OptimalHoursView(hours: recs.optimalHours)
                        }

                        // Suggested Topics
                        if let recs = recommendations, !recs.suggestedTopics.isEmpty {
                            SuggestedTopicsView(topics: recs.suggestedTopics)
                        }

                        // Settings
                        SettingsSectionView(
                            autoPriorityEnabled: $autoPriorityEnabled,
                            onToggle: toggleAutoPriority
                        )
                    }
                    .padding()
                }
            }
            .navigationTitle("Dein Profil")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: loadData) {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
            .task {
                await loadDataAsync()
            }
        }
    }

    private func loadData() {
        Task {
            await loadDataAsync()
        }
    }

    private func loadDataAsync() async {
        isLoading = true
        do {
            async let statsTask = apiService.getProfileStats()
            async let recsTask = apiService.getRecommendations()

            stats = try await statsTask
            recommendations = try await recsTask
            autoPriorityEnabled = stats?.autoPriorityEnabled ?? false
        } catch {
            print("Failed to load profile: \(error)")
        }
        isLoading = false
    }

    private func toggleAutoPriority() {
        Task {
            do {
                try await apiService.setAutoPriority(enabled: autoPriorityEnabled)
            } catch {
                autoPriorityEnabled.toggle() // Revert on error
                print("Failed to toggle auto priority: \(error)")
            }
        }
    }
}

struct StatsGridView: View {
    let stats: ProfileStatsResponse

    var body: some View {
        LazyVGrid(columns: [
            GridItem(.flexible()),
            GridItem(.flexible()),
            GridItem(.flexible())
        ], spacing: 16) {
            StatCard(
                icon: "lightbulb.fill",
                value: "\(stats.totalIdeas)",
                label: "Ideen",
                color: .yellow
            )
            StatCard(
                icon: "calendar",
                value: "\(stats.totalMeetings)",
                label: "Meetings",
                color: .blue
            )
            StatCard(
                icon: "chart.line.uptrend.xyaxis",
                value: String(format: "%.1f", stats.avgIdeasPerDay),
                label: "Pro Tag",
                color: .green
            )
        }
    }
}

struct StatCard: View {
    let icon: String
    let value: String
    let label: String
    let color: Color

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title)
                .foregroundColor(color)
            Text(value)
                .font(.title)
                .fontWeight(.bold)
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
}

struct InsightsView: View {
    let insights: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Erkenntnisse", systemImage: "lightbulb")
                .font(.headline)

            ForEach(insights, id: \.self) { insight in
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: "info.circle.fill")
                        .foregroundColor(.blue)
                    Text(insight)
                        .foregroundColor(.secondary)
                }
                .padding()
                .background(Color.blue.opacity(0.1))
                .cornerRadius(10)
            }
        }
    }
}

struct OptimalHoursView: View {
    let hours: [Int]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Produktive Stunden", systemImage: "clock")
                .font(.headline)

            HStack(spacing: 12) {
                ForEach(hours, id: \.self) { hour in
                    Text("\(hour):00")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(
                            LinearGradient(
                                colors: [.orange, .yellow],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .foregroundColor(.white)
                        .cornerRadius(20)
                }
            }
        }
    }
}

struct SuggestedTopicsView: View {
    let topics: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Vorgeschlagene Themen", systemImage: "sparkles")
                .font(.headline)

            Text("Basierend auf deinen Interessen")
                .font(.caption)
                .foregroundColor(.secondary)

            FlowLayout(spacing: 8) {
                ForEach(topics, id: \.self) { topic in
                    Text(topic)
                        .font(.subheadline)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.purple.opacity(0.15))
                        .foregroundColor(.purple)
                        .cornerRadius(16)
                }
            }
        }
    }
}

struct SettingsSectionView: View {
    @Binding var autoPriorityEnabled: Bool
    let onToggle: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Einstellungen", systemImage: "gear")
                .font(.headline)

            HStack {
                VStack(alignment: .leading) {
                    Text("Auto-Priorität")
                        .font(.subheadline)
                        .fontWeight(.medium)
                    Text("Automatische Prioritätsvorschläge")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Spacer()
                Toggle("", isOn: $autoPriorityEnabled)
                    .onChange(of: autoPriorityEnabled) { _, _ in
                        onToggle()
                    }
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
        }
    }
}

#Preview {
    ProfileView()
        .environmentObject(APIService())
}

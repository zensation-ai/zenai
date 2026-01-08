import SwiftUI

/// Phase 10: Thought Incubator View
/// Shows loose thoughts and clusters ready for consolidation
struct IncubatorView: View {
    @StateObject private var viewModel = IncubatorViewModel()
    @State private var showingAddThought = false
    @State private var newThoughtText = ""

    var body: some View {
        NavigationView {
            ZStack {
                if viewModel.isLoading && viewModel.clusters.isEmpty {
                    ProgressView("Loading incubator...")
                } else {
                    ScrollView {
                        VStack(spacing: 20) {
                            // Stats Card
                            if let stats = viewModel.stats {
                                StatsCard(stats: stats)
                            }

                            // Ready Clusters Section
                            if !viewModel.readyClusters.isEmpty {
                                ReadyClustersSection(
                                    clusters: viewModel.readyClusters,
                                    onConsolidate: viewModel.consolidateCluster,
                                    onDismiss: viewModel.dismissCluster
                                )
                            }

                            // Incubating Clusters
                            if !viewModel.incubatingClusters.isEmpty {
                                IncubatingClustersSection(clusters: viewModel.incubatingClusters)
                            }

                            // Loose Thoughts
                            if !viewModel.looseThoughts.isEmpty {
                                LooseThoughtsSection(thoughts: viewModel.looseThoughts)
                            }

                            // Empty State
                            if viewModel.clusters.isEmpty && viewModel.looseThoughts.isEmpty && !viewModel.isLoading {
                                EmptyIncubatorView()
                            }
                        }
                        .padding()
                    }
                    .refreshable {
                        await viewModel.refresh()
                    }
                }
            }
            .navigationTitle("Incubator")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showingAddThought = true }) {
                        Image(systemName: "plus.bubble")
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { Task { await viewModel.runAnalysis() } }) {
                        Image(systemName: "sparkles")
                    }
                    .disabled(viewModel.isLoading)
                }
            }
            .sheet(isPresented: $showingAddThought) {
                AddThoughtSheet(
                    text: $newThoughtText,
                    onSubmit: {
                        Task {
                            await viewModel.addThought(newThoughtText)
                            newThoughtText = ""
                            showingAddThought = false
                        }
                    }
                )
            }
            .alert("Error", isPresented: .constant(viewModel.errorMessage != nil)) {
                Button("OK") { viewModel.errorMessage = nil }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
        .task {
            await viewModel.loadData()
        }
    }
}

// MARK: - Stats Card

struct StatsCard: View {
    let stats: IncubatorStats

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Text("Incubator Status")
                    .font(.headline)
                Spacer()
            }

            HStack(spacing: 16) {
                StatItem(value: stats.unprocessedThoughts, label: "Thoughts", icon: "lightbulb")
                StatItem(value: stats.totalClusters, label: "Clusters", icon: "circle.grid.2x2")
                StatItem(value: stats.readyClusters, label: "Ready", icon: "checkmark.circle")
                StatItem(value: stats.consolidatedToday, label: "Today", icon: "star")
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
}

struct StatItem: View {
    let value: Int
    let label: String
    let icon: String

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundColor(.accentColor)
            Text("\(value)")
                .font(.title2)
                .fontWeight(.bold)
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Ready Clusters Section

struct ReadyClustersSection: View {
    let clusters: [ThoughtCluster]
    let onConsolidate: (String) async -> Void
    let onDismiss: (String) async -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "sparkles")
                    .foregroundColor(.orange)
                Text("Ready for Review")
                    .font(.headline)
                Spacer()
                Text("\(clusters.count)")
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.orange.opacity(0.2))
                    .cornerRadius(8)
            }

            ForEach(clusters) { cluster in
                ReadyClusterCard(
                    cluster: cluster,
                    onConsolidate: { await onConsolidate(cluster.id) },
                    onDismiss: { await onDismiss(cluster.id) }
                )
            }
        }
    }
}

struct ReadyClusterCard: View {
    let cluster: ThoughtCluster
    let onConsolidate: () async -> Void
    let onDismiss: () async -> Void

    @State private var isProcessing = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let theme = cluster.theme {
                Text(theme)
                    .font(.headline)
            }

            if let summary = cluster.summary {
                Text(summary)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(3)
            }

            Text("\(cluster.thoughtCount) related thoughts")
                .font(.caption)
                .foregroundColor(.secondary)

            HStack(spacing: 12) {
                Button(action: {
                    isProcessing = true
                    Task {
                        await onConsolidate()
                        isProcessing = false
                    }
                }) {
                    HStack {
                        if isProcessing {
                            ProgressView()
                                .scaleEffect(0.8)
                        } else {
                            Image(systemName: "wand.and.stars")
                        }
                        Text("Create Idea")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(isProcessing)

                Button(action: {
                    Task { await onDismiss() }
                }) {
                    Image(systemName: "xmark")
                }
                .buttonStyle(.bordered)
                .disabled(isProcessing)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.1), radius: 4, x: 0, y: 2)
    }
}

// MARK: - Incubating Clusters Section

struct IncubatingClustersSection: View {
    let clusters: [ThoughtCluster]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "hourglass")
                    .foregroundColor(.blue)
                Text("Incubating")
                    .font(.headline)
                Spacer()
            }

            ForEach(clusters) { cluster in
                IncubatingClusterCard(cluster: cluster)
            }
        }
    }
}

struct IncubatingClusterCard: View {
    let cluster: ThoughtCluster

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let theme = cluster.theme {
                Text(theme)
                    .font(.subheadline)
                    .fontWeight(.medium)
            }

            Text("\(cluster.thoughtCount) thoughts gathering...")
                .font(.caption)
                .foregroundColor(.secondary)

            // Progress indicator
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.gray.opacity(0.2))
                        .frame(height: 4)

                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.blue)
                        .frame(width: geo.size.width * min(Double(cluster.thoughtCount) / 5.0, 1.0), height: 4)
                }
            }
            .frame(height: 4)
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(8)
    }
}

// MARK: - Loose Thoughts Section

struct LooseThoughtsSection: View {
    let thoughts: [LooseThought]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "lightbulb")
                    .foregroundColor(.yellow)
                Text("Loose Thoughts")
                    .font(.headline)
                Spacer()
                Text("\(thoughts.count)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            ForEach(thoughts.prefix(5)) { thought in
                ThoughtRow(thought: thought)
            }

            if thoughts.count > 5 {
                Text("+ \(thoughts.count - 5) more")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
    }
}

struct ThoughtRow: View {
    let thought: LooseThought

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(thought.processed ? Color.green : Color.orange)
                .frame(width: 8, height: 8)
                .padding(.top, 6)

            VStack(alignment: .leading, spacing: 4) {
                Text(thought.text)
                    .font(.subheadline)
                    .lineLimit(2)

                Text(thought.createdAt, style: .relative)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Empty State

struct EmptyIncubatorView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "lightbulb.slash")
                .font(.system(size: 48))
                .foregroundColor(.secondary)

            Text("Incubator is Empty")
                .font(.headline)

            Text("Add loose thoughts and they will cluster into structured ideas over time.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(40)
    }
}

// MARK: - Add Thought Sheet

struct AddThoughtSheet: View {
    @Binding var text: String
    let onSubmit: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            VStack(spacing: 16) {
                TextEditor(text: $text)
                    .frame(minHeight: 150)
                    .padding(8)
                    .background(Color(.systemGray6))
                    .cornerRadius(8)

                Text("Quick thoughts that will incubate into ideas")
                    .font(.caption)
                    .foregroundColor(.secondary)

                Spacer()
            }
            .padding()
            .navigationTitle("New Thought")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { onSubmit() }
                        .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

// MARK: - View Model

@MainActor
class IncubatorViewModel: ObservableObject {
    @Published var clusters: [ThoughtCluster] = []
    @Published var looseThoughts: [LooseThought] = []
    @Published var stats: IncubatorStats?
    @Published var isLoading = false
    @Published var errorMessage: String?

    var readyClusters: [ThoughtCluster] {
        clusters.filter { $0.status == .ready }
    }

    var incubatingClusters: [ThoughtCluster] {
        clusters.filter { $0.status == .incubating }
    }

    func loadData() async {
        isLoading = true
        defer { isLoading = false }

        do {
            async let clustersTask = IncubatorService.shared.getClusters()
            async let thoughtsTask = IncubatorService.shared.getThoughts(limit: 20, includeProcessed: false)
            async let statsTask = IncubatorService.shared.getStats()

            let (fetchedClusters, fetchedThoughts, fetchedStats) = try await (clustersTask, thoughtsTask, statsTask)

            self.clusters = fetchedClusters
            self.looseThoughts = fetchedThoughts
            self.stats = fetchedStats
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refresh() async {
        await loadData()
    }

    func addThought(_ text: String) async {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        do {
            let thought = try await IncubatorService.shared.addThought(text)
            looseThoughts.insert(thought, at: 0)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func consolidateCluster(_ clusterId: String) async {
        do {
            let result = try await IncubatorService.shared.consolidateCluster(clusterId)
            if result.success {
                clusters.removeAll { $0.id == clusterId }
                await loadData() // Refresh to get updated stats
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func dismissCluster(_ clusterId: String) async {
        do {
            try await IncubatorService.shared.dismissCluster(clusterId)
            clusters.removeAll { $0.id == clusterId }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func runAnalysis() async {
        isLoading = true
        defer { isLoading = false }

        do {
            try await IncubatorService.shared.runBatchAnalysis()
            await loadData()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Preview

#Preview {
    IncubatorView()
}

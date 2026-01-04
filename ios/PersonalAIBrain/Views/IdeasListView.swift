import SwiftUI

struct IdeasListView: View {
    @EnvironmentObject var apiService: APIService
    @State private var ideas: [Idea] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var selectedFilter: IdeaType?

    var filteredIdeas: [Idea] {
        if let filter = selectedFilter {
            return ideas.filter { $0.type == filter }
        }
        return ideas
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Filter Pills
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        FilterPill(
                            title: "Alle",
                            isSelected: selectedFilter == nil,
                            color: .zensationOrange
                        ) {
                            selectedFilter = nil
                        }

                        ForEach(IdeaType.allCases, id: \.self) { type in
                            FilterPill(
                                title: type.displayName,
                                isSelected: selectedFilter == type,
                                color: colorFor(type)
                            ) {
                                selectedFilter = type
                            }
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                }
                .background(Color.zensationSurface)

                // Content
                if isLoading {
                    ProgressView("Lade Ideen...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error = errorMessage {
                    VStack(spacing: 16) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.system(size: 48))
                            .foregroundColor(.zensationWarning)
                        Text(error)
                            .multilineTextAlignment(.center)
                        Button("Erneut versuchen") {
                            Task { await loadIdeas() }
                        }
                        .buttonStyle(.bordered)
                    }
                    .padding()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if filteredIdeas.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "brain.head.profile")
                            .font(.system(size: 64))
                            .foregroundColor(.gray)
                        Text("Keine Ideen gefunden")
                            .font(.headline)
                        Text("Nimm deine erste Idee auf!")
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(filteredIdeas) { idea in
                        NavigationLink(destination: IdeaDetailView(idea: idea)) {
                            IdeaRow(idea: idea)
                        }
                    }
                    .listStyle(.plain)
                    .refreshable {
                        await loadIdeas()
                    }
                }
            }
            .navigationTitle("Meine Ideen")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { Task { await loadIdeas() } }) {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
        }
        .task {
            await loadIdeas()
        }
    }

    private func loadIdeas() async {
        isLoading = true
        errorMessage = nil

        do {
            ideas = try await apiService.fetchIdeas()
        } catch {
            errorMessage = error.localizedDescription
            // Show sample data in case of error
            ideas = Idea.sampleData
        }

        isLoading = false
    }

    private func colorFor(_ type: IdeaType) -> Color {
        switch type {
        case .idea: return .zensationWarning
        case .task: return .zensationOrange
        case .insight: return .purple
        case .problem: return .zensationDanger
        case .question: return .zensationOrangeLight
        }
    }
}

// MARK: - Filter Pill

struct FilterPill: View {
    let title: String
    let isSelected: Bool
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline)
                .fontWeight(isSelected ? .semibold : .regular)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isSelected ? color.opacity(0.2) : Color.zensationSurfaceLight)
                .foregroundColor(isSelected ? color : .primary)
                .clipShape(Capsule())
                .overlay(
                    Capsule()
                        .stroke(isSelected ? color : Color.clear, lineWidth: 1)
                )
        }
    }
}

// MARK: - Idea Row

struct IdeaRow: View {
    let idea: Idea

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: idea.type.icon)
                    .foregroundColor(colorFor(idea.type))

                Text(idea.title)
                    .font(.headline)
                    .lineLimit(1)

                Spacer()

                PriorityBadge(priority: idea.priority)
            }

            if let summary = idea.summary {
                Text(summary)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }

            HStack {
                Text(idea.category.displayName)
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(Color.zensationSurfaceLight)
                    .clipShape(Capsule())

                Spacer()

                Text(idea.createdAt.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private func colorFor(_ type: IdeaType) -> Color {
        switch type {
        case .idea: return .zensationWarning
        case .task: return .zensationOrange
        case .insight: return .purple
        case .problem: return .zensationDanger
        case .question: return .zensationOrangeLight
        }
    }
}

// MARK: - Priority Badge

struct PriorityBadge: View {
    let priority: Priority

    var body: some View {
        Text(priority.displayName)
            .font(.caption2)
            .fontWeight(.medium)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(colorFor(priority).opacity(0.2))
            .foregroundColor(colorFor(priority))
            .clipShape(Capsule())
    }

    private func colorFor(_ priority: Priority) -> Color {
        switch priority {
        case .low: return .zensationTextMuted
        case .medium: return .zensationOrange
        case .high: return .zensationDanger
        }
    }
}

#Preview {
    IdeasListView()
        .environmentObject(APIService())
}

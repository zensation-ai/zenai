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
            ZStack {
                Color.zensationBackground.ignoresSafeArea()

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
                    VStack(spacing: 16) {
                        AIBrainView(isActive: true, activityType: .thinking, size: 64)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error = errorMessage {
                    VStack(spacing: 16) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.system(size: 48))
                            .foregroundColor(.zensationWarning)
                        Text(error)
                            .foregroundColor(.zensationText)
                            .multilineTextAlignment(.center)
                        Button("Erneut versuchen") {
                            Task { await loadIdeas() }
                        }
                        .buttonStyle(.bordered)
                        .tint(.zensationOrange)
                    }
                    .padding()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if filteredIdeas.isEmpty {
                    VStack(spacing: 20) {
                        AIBrainView(
                            isActive: false,
                            activityType: .idle,
                            size: 80,
                            ideasCount: ideas.count,
                            showGreeting: true
                        )

                        if selectedFilter != nil {
                            Text("Keine \(selectedFilter?.displayName ?? "") gefunden")
                                .font(.headline)
                                .foregroundColor(.zensationText)
                            Text("Versuche einen anderen Filter")
                                .foregroundColor(.zensationTextMuted)
                        } else {
                            Text("Nimm deine erste Idee auf!")
                                .foregroundColor(.zensationTextMuted)
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(filteredIdeas) { idea in
                        NavigationLink(destination: IdeaDetailView(idea: idea, onDelete: {
                            ideas.removeAll { $0.id == idea.id }
                        })) {
                            IdeaRow(idea: idea)
                        }
                        .listRowBackground(Color.zensationBackground)
                        .listRowSeparatorTint(.zensationBorder)
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                deleteIdea(idea)
                            } label: {
                                Label("Löschen", systemImage: "trash")
                            }
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                    .background(Color.zensationBackground)
                    .refreshable {
                        await loadIdeas()
                    }
                }
                }
            }
            .navigationTitle("Meine Ideen")
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarBackground(Color.zensationSurface, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { Task { await loadIdeas() } }) {
                        Image(systemName: "arrow.clockwise")
                            .foregroundColor(.zensationOrange)
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
            print("🔄 Fetching ideas from API...")
            ideas = try await apiService.fetchIdeas()
            print("✅ Successfully loaded \(ideas.count) ideas")
        } catch {
            print("❌ Error loading ideas: \(error)")
            errorMessage = "Es besteht keine Verbindung zum Backend.\n\nFehler: \(error.localizedDescription)\n\nStelle sicher, dass dein iPhone und Mac im gleichen WLAN sind."
            ideas = []
        }

        isLoading = false
    }

    private func deleteIdea(_ idea: Idea) {
        Task {
            do {
                try await apiService.deleteIdea(id: idea.id)
                ideas.removeAll { $0.id == idea.id }
            } catch {
                errorMessage = "Löschen fehlgeschlagen: \(error.localizedDescription)"
            }
        }
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
                .foregroundColor(isSelected ? color : .zensationText)
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
                    .foregroundColor(.zensationText)
                    .lineLimit(1)

                Spacer()

                PriorityBadge(priority: idea.priority)
            }

            if let summary = idea.summary {
                Text(summary)
                    .font(.subheadline)
                    .foregroundColor(.zensationTextMuted)
                    .lineLimit(2)
            }

            HStack {
                Text(idea.category.displayName)
                    .font(.caption)
                    .foregroundColor(.zensationTextMuted)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(Color.zensationSurfaceLight)
                    .clipShape(Capsule())

                Spacer()

                Text(idea.createdAt.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption)
                    .foregroundColor(.zensationTextMuted)
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

//
//  ArchiveView.swift
//  PersonalAIBrain
//
//  Phase 17: Archive View for viewing and restoring archived ideas
//

import SwiftUI

struct ArchiveView: View {
    @EnvironmentObject var apiService: APIService
    @EnvironmentObject var contextManager: ContextManager

    @State private var archivedIdeas: [Idea] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var lastLoadedContext: AIContext?

    var body: some View {
        NavigationStack {
            ZStack {
                Color.zensationBackground.ignoresSafeArea()

                if isLoading {
                    VStack(spacing: 16) {
                        ProgressView()
                            .scaleEffect(1.5)
                            .tint(.zensationOrange)
                        Text("Lade Archiv...")
                            .foregroundColor(.zensationTextMuted)
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
                            Task { await loadArchivedIdeas() }
                        }
                        .buttonStyle(.bordered)
                        .tint(.zensationOrange)
                    }
                    .padding()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if archivedIdeas.isEmpty {
                    VStack(spacing: 20) {
                        Image(systemName: "archivebox")
                            .font(.system(size: 64))
                            .foregroundColor(.zensationTextMuted)

                        Text("Archiv ist leer")
                            .font(.headline)
                            .foregroundColor(.zensationText)

                        Text("Archivierte Gedanken erscheinen hier")
                            .foregroundColor(.zensationTextMuted)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(archivedIdeas) { idea in
                        ArchivedIdeaRow(idea: idea) {
                            restoreIdea(idea)
                        } onDelete: {
                            deleteIdea(idea)
                        }
                        .listRowBackground(Color.zensationBackground)
                        .listRowSeparatorTint(.zensationBorder)
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                    .background(Color.zensationBackground)
                    .refreshable {
                        await loadArchivedIdeas()
                    }
                }
            }
            .navigationTitle("Archiv")
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarBackground(Color.zensationSurface, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    ContextIndicator(context: contextManager.currentContext)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Text("\(archivedIdeas.count)")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.blue.opacity(0.2))
                        .foregroundColor(.blue)
                        .clipShape(Capsule())
                }
            }
        }
        .task {
            await loadArchivedIdeas()
        }
        .onChange(of: contextManager.currentContext) { _, newContext in
            if lastLoadedContext != newContext {
                Task {
                    await loadArchivedIdeas()
                }
            }
        }
    }

    private func loadArchivedIdeas() async {
        isLoading = true
        errorMessage = nil
        lastLoadedContext = contextManager.currentContext

        do {
            archivedIdeas = try await apiService.fetchArchivedIdeas(context: contextManager.currentContext)
        } catch {
            errorMessage = "Fehler beim Laden: \(error.localizedDescription)"
            archivedIdeas = []
        }

        isLoading = false
    }

    private func restoreIdea(_ idea: Idea) {
        Task {
            do {
                try await apiService.restoreIdea(id: idea.id, context: contextManager.currentContext)
                archivedIdeas.removeAll { $0.id == idea.id }
            } catch {
                errorMessage = "Wiederherstellung fehlgeschlagen: \(error.localizedDescription)"
            }
        }
    }

    private func deleteIdea(_ idea: Idea) {
        Task {
            do {
                try await apiService.deleteIdea(id: idea.id)
                archivedIdeas.removeAll { $0.id == idea.id }
            } catch {
                errorMessage = "Löschen fehlgeschlagen: \(error.localizedDescription)"
            }
        }
    }
}

// MARK: - Archived Idea Row

struct ArchivedIdeaRow: View {
    let idea: Idea
    let onRestore: () -> Void
    let onDelete: () -> Void

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

                // Restore button
                Button(action: onRestore) {
                    Image(systemName: "arrow.uturn.backward.circle.fill")
                        .font(.title2)
                        .foregroundColor(.green)
                }
                .buttonStyle(.plain)
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

                PriorityBadge(priority: idea.priority)

                Spacer()

                Text(idea.createdAt.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption)
                    .foregroundColor(.zensationTextMuted)
            }
        }
        .padding(.vertical, 4)
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button(role: .destructive, action: onDelete) {
                Label("Löschen", systemImage: "trash")
            }
        }
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            Button(action: onRestore) {
                Label("Wiederherstellen", systemImage: "arrow.uturn.backward")
            }
            .tint(.green)
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

#Preview {
    ArchiveView()
        .environmentObject(APIService())
        .environmentObject(ContextManager())
}

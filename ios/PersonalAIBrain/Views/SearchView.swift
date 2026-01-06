import SwiftUI

struct SearchView: View {
    @EnvironmentObject var apiService: APIService
    @EnvironmentObject var contextManager: ContextManager

    @State private var searchText = ""
    @State private var searchResults: [Idea] = []
    @State private var isSearching = false
    @State private var hasSearched = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Search Bar
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.zensationTextMuted)

                    TextField("Semantische Suche...", text: $searchText)
                        .textFieldStyle(.plain)
                        .autocorrectionDisabled()
                        .onSubmit {
                            performSearch()
                        }

                    if !searchText.isEmpty {
                        Button(action: { searchText = "" }) {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.zensationTextMuted)
                        }
                    }
                }
                .padding()
                .background(Color(.systemGray6))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding()

                // Content
                if isSearching {
                    Spacer()
                    AIBrainView(isActive: true, activityType: .searching, size: 64)
                    Spacer()
                } else if let error = errorMessage {
                    Spacer()
                    VStack(spacing: 12) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.largeTitle)
                            .foregroundColor(.orange)
                        Text(error)
                            .multilineTextAlignment(.center)
                    }
                    .padding()
                    Spacer()
                } else if !hasSearched {
                    // Initial state with context
                    Spacer()
                    VStack(spacing: 16) {
                        AIBrainView(isActive: false, activityType: .idle, size: 64)

                        // Context indicator
                        ContextIndicator(context: contextManager.currentContext)

                        Text("Semantische Suche")
                            .font(.title2)
                            .fontWeight(.semibold)

                        Text("Finde verwandte \(contextManager.currentContext.displayName)-Ideen basierend auf Bedeutung.")
                            .multilineTextAlignment(.center)
                            .foregroundColor(.zensationTextMuted)
                            .padding(.horizontal)

                        // Example queries
                        VStack(spacing: 8) {
                            Text("Beispiele:")
                                .font(.caption)
                                .fontWeight(.semibold)

                            ForEach(exampleQueries, id: \.self) { query in
                                Button(action: {
                                    searchText = query
                                    performSearch()
                                }) {
                                    Text(query)
                                        .font(.caption)
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 6)
                                        .background(Color.blue.opacity(0.1))
                                        .foregroundColor(.blue)
                                        .clipShape(Capsule())
                                }
                            }
                        }
                        .padding(.top)
                    }
                    Spacer()
                } else if searchResults.isEmpty {
                    Spacer()
                    VStack(spacing: 12) {
                        Image(systemName: "magnifyingglass")
                            .font(.largeTitle)
                            .foregroundColor(.zensationTextMuted)
                        Text("Keine Ergebnisse für \"\(searchText)\"")
                            .foregroundColor(.zensationTextMuted)
                    }
                    Spacer()
                } else {
                    // Results
                    List(searchResults) { idea in
                        NavigationLink(destination: IdeaDetailView(idea: idea)) {
                            IdeaRow(idea: idea)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Suchen")
        }
    }

    private var exampleQueries: [String] {
        [
            "KI Projekte",
            "Business Ideen",
            "Technische Lösungen",
            "Offene Aufgaben"
        ]
    }

    private func performSearch() {
        guard !searchText.trimmingCharacters(in: .whitespaces).isEmpty else { return }

        isSearching = true
        hasSearched = true
        errorMessage = nil

        Task {
            do {
                // Use context-aware search
                searchResults = try await apiService.searchIdeasInContext(
                    query: searchText,
                    context: contextManager.currentContext
                )
            } catch {
                errorMessage = error.localizedDescription
                searchResults = []
            }
            isSearching = false
        }
    }
}

#Preview {
    SearchView()
        .environmentObject(APIService())
        .environmentObject(ContextManager())
}

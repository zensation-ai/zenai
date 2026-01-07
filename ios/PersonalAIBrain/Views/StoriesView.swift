import SwiftUI

/// Stories View - Shows automatically grouped related content
struct StoriesView: View {
    @EnvironmentObject var apiService: APIService
    @State private var stories: [Story] = []
    @State private var isLoading = false
    @State private var searchQuery = ""
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ZStack {
                Color.zensationBackground.ignoresSafeArea()

                if isLoading {
                    loadingState
                } else if let error = errorMessage {
                    errorState(message: error)
                } else if stories.isEmpty {
                    emptyState
                } else {
                    ScrollView {
                        LazyVStack(spacing: 16) {
                            // Header info
                            HStack {
                                Text("\(stories.count) Stories gefunden")
                                    .font(.caption)
                                    .foregroundColor(.zensationTextMuted)
                                Spacer()
                            }
                            .padding(.horizontal)

                            ForEach(stories) { story in
                                StoryCard(story: story)
                            }
                        }
                        .padding()
                    }
                    .refreshable {
                        await loadStoriesAsync(query: searchQuery.isEmpty ? nil : searchQuery)
                    }
                }
            }
            .navigationTitle("Stories")
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarBackground(Color.zensationSurface, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .searchable(text: $searchQuery, prompt: "Nach Thema suchen...")
            .onSubmit(of: .search) {
                loadStories(query: searchQuery)
            }
            .onChange(of: searchQuery) { _, newValue in
                if newValue.isEmpty {
                    loadStories()
                }
            }
            .onAppear {
                if stories.isEmpty {
                    loadStories()
                }
            }
        }
    }

    // MARK: - Loading State
    private var loadingState: some View {
        VStack(spacing: 20) {
            AIBrainView(isActive: true, activityType: .searching, size: 64)

            Text("Analysiere Inhalte...")
                .font(.headline)
                .foregroundColor(.zensationText)

            Text("Suche nach zusammenhängenden Gedanken")
                .font(.caption)
                .foregroundColor(.zensationTextMuted)
        }
    }

    // MARK: - Error State
    private func errorState(message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 48))
                .foregroundColor(.zensationWarning)

            Text("Verbindungsproblem")
                .font(.headline)
                .foregroundColor(.zensationText)

            Text(message)
                .font(.caption)
                .foregroundColor(.zensationTextMuted)
                .multilineTextAlignment(.center)

            Button(action: { loadStories() }) {
                HStack {
                    Image(systemName: "arrow.clockwise")
                    Text("Erneut versuchen")
                }
            }
            .buttonStyle(.bordered)
        }
        .padding()
    }

    // MARK: - Empty State
    private var emptyState: some View {
        VStack(spacing: 20) {
            AIBrainView(isActive: false, activityType: .idle, size: 80)

            Text("Noch keine Stories")
                .font(.title2)
                .fontWeight(.semibold)
                .foregroundColor(.zensationText)

            Text("Stories entstehen automatisch, wenn die KI zusammenhängende Inhalte erkennt.")
                .font(.subheadline)
                .foregroundColor(.zensationTextMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            // Tipps
            VStack(alignment: .leading, spacing: 12) {
                Text("So entstehen Stories:")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(.zensationText)

                TipRowStories(icon: "mic.fill", text: "Sprich über verwandte Themen")
                TipRowStories(icon: "photo.fill", text: "Füge Fotos mit ähnlichem Kontext hinzu")
                TipRowStories(icon: "brain", text: "Die KI erkennt Zusammenhänge automatisch")
            }
            .padding()
            .background(Color.zensationSurface)
            .cornerRadius(12)
            .padding(.horizontal, 40)
            .padding(.top, 20)
        }
        .frame(maxHeight: .infinity)
    }

    // MARK: - Load Stories
    private func loadStories(query: String? = nil) {
        isLoading = true
        errorMessage = nil

        apiService.fetchStories(query: query) { result in
            isLoading = false

            switch result {
            case .success(let fetchedStories):
                withAnimation {
                    stories = fetchedStories
                }
            case .failure(let error):
                errorMessage = error.localizedDescription
                print("❌ Error loading stories: \(error)")
            }
        }
    }

    private func loadStoriesAsync(query: String?) async {
        loadStories(query: query)
    }
}

// MARK: - Tip Row for Stories
struct TipRowStories: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundColor(.zensationOrange)
                .frame(width: 20)
            Text(text)
                .font(.caption)
                .foregroundColor(.zensationTextMuted)
        }
    }
}

/// Story Card
struct StoryCard: View {
    let story: Story

    var body: some View {
        NavigationLink(destination: StoryDetailView(story: story)) {
            VStack(alignment: .leading, spacing: 12) {
                // Header
                HStack(alignment: .top) {
                    // Icon
                    ZStack {
                        Circle()
                            .fill(Color.zensationOrange.opacity(0.15))
                            .frame(width: 44, height: 44)

                        Image(systemName: "book.fill")
                            .font(.title3)
                            .foregroundColor(.zensationOrange)
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text(story.title)
                            .font(.headline)
                            .foregroundColor(.zensationText)
                            .lineLimit(2)

                        if let description = story.description {
                            Text(description)
                                .font(.caption)
                                .foregroundColor(.zensationTextMuted)
                                .lineLimit(1)
                        }
                    }

                    Spacer()

                    // Item count badge
                    HStack(spacing: 4) {
                        Image(systemName: "doc.fill")
                            .font(.caption2)
                        Text("\(story.itemCount)")
                            .font(.caption)
                            .fontWeight(.semibold)
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.zensationOrange)
                    .cornerRadius(8)
                }

                Divider()
                    .background(Color.zensationBorder)

                // Items Preview
                VStack(spacing: 8) {
                    ForEach(story.items.prefix(3)) { item in
                        StoryItemRow(item: item)
                    }

                    if story.items.count > 3 {
                        HStack {
                            Spacer()
                            Text("+ \(story.items.count - 3) weitere Einträge")
                                .font(.caption)
                                .foregroundColor(.zensationOrange)
                            Image(systemName: "chevron.right")
                                .font(.caption2)
                                .foregroundColor(.zensationOrange)
                        }
                    }
                }

                // Footer
                HStack {
                    Image(systemName: "clock")
                        .font(.caption2)
                    Text(story.createdAt, style: .relative)
                        .font(.caption)
                    Spacer()
                }
                .foregroundColor(.zensationTextMuted)
            }
            .padding()
            .background(Color.zensationSurface)
            .cornerRadius(16)
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.zensationBorder, lineWidth: 1)
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

/// Story Item Row
struct StoryItemRow: View {
    let item: StoryItem

    var body: some View {
        HStack(spacing: 12) {
            // Type icon
            ZStack {
                Circle()
                    .fill(colorForType(item.type).opacity(0.15))
                    .frame(width: 28, height: 28)

                Image(systemName: iconForType(item.type))
                    .font(.caption)
                    .foregroundColor(colorForType(item.type))
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(item.content)
                    .font(.caption)
                    .foregroundColor(.zensationText)
                    .lineLimit(2)

                HStack(spacing: 8) {
                    Text(item.type.rawValue.capitalized)
                        .font(.caption2)
                        .foregroundColor(.zensationTextMuted)

                    if item.mediaUrl != nil {
                        HStack(spacing: 2) {
                            Image(systemName: "paperclip")
                                .font(.caption2)
                            Text("Media")
                                .font(.caption2)
                        }
                        .foregroundColor(.zensationOrange)
                    }
                }
            }

            Spacer()
        }
    }

    private func iconForType(_ type: StoryItemType) -> String {
        switch type {
        case .text: return "text.bubble.fill"
        case .audio: return "waveform"
        case .photo: return "photo.fill"
        case .video: return "video.fill"
        case .idea: return "lightbulb.fill"
        }
    }

    private func colorForType(_ type: StoryItemType) -> Color {
        switch type {
        case .text: return .blue
        case .audio: return .purple
        case .photo: return .green
        case .video: return .red
        case .idea: return .zensationOrange
        }
    }
}

/// Story Detail View
struct StoryDetailView: View {
    let story: Story

    var body: some View {
        ZStack {
            Color.zensationBackground.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Header Card
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(alignment: .top) {
                            // Icon
                            ZStack {
                                Circle()
                                    .fill(Color.zensationOrange.opacity(0.15))
                                    .frame(width: 56, height: 56)

                                Image(systemName: "book.fill")
                                    .font(.title2)
                                    .foregroundColor(.zensationOrange)
                            }

                            VStack(alignment: .leading, spacing: 4) {
                                Text(story.title)
                                    .font(.title2)
                                    .fontWeight(.bold)
                                    .foregroundColor(.zensationText)

                                if let description = story.description {
                                    Text(description)
                                        .font(.subheadline)
                                        .foregroundColor(.zensationTextMuted)
                                }
                            }
                        }

                        Divider()
                            .background(Color.zensationBorder)

                        // Stats
                        HStack(spacing: 20) {
                            StatItem(icon: "doc.fill", value: "\(story.itemCount)", label: "Inhalte")
                            StatItem(icon: "clock", value: story.createdAt.formatted(date: .abbreviated, time: .omitted), label: "Erstellt")
                        }
                    }
                    .padding()
                    .background(Color.zensationSurface)
                    .cornerRadius(16)
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(Color.zensationBorder, lineWidth: 1)
                    )

                    // Timeline Header
                    HStack {
                        Text("Timeline")
                            .font(.headline)
                            .foregroundColor(.zensationText)
                        Spacer()
                        Text("\(story.items.count) Einträge")
                            .font(.caption)
                            .foregroundColor(.zensationTextMuted)
                    }

                    // All Items as Timeline
                    VStack(spacing: 0) {
                        ForEach(Array(story.items.enumerated()), id: \.element.id) { index, item in
                            StoryItemDetail(item: item, isLast: index == story.items.count - 1)
                        }
                    }
                }
                .padding()
            }
        }
        .navigationTitle("Story")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbarBackground(Color.zensationSurface, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
    }
}

// MARK: - Stat Item
struct StatItem: View {
    let icon: String
    let value: String
    let label: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundColor(.zensationOrange)

            VStack(alignment: .leading, spacing: 2) {
                Text(value)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundColor(.zensationText)
                Text(label)
                    .font(.caption2)
                    .foregroundColor(.zensationTextMuted)
            }
        }
    }
}

/// Story Item Detail with Timeline
struct StoryItemDetail: View {
    let item: StoryItem
    var isLast: Bool = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Timeline line & dot
            VStack(spacing: 0) {
                Circle()
                    .fill(colorForType(item.type))
                    .frame(width: 12, height: 12)

                if !isLast {
                    Rectangle()
                        .fill(Color.zensationBorder)
                        .frame(width: 2)
                }
            }

            // Content card
            VStack(alignment: .leading, spacing: 8) {
                // Header
                HStack {
                    HStack(spacing: 6) {
                        Image(systemName: iconForType(item.type))
                            .font(.caption)
                            .foregroundColor(colorForType(item.type))

                        Text(item.type.rawValue.capitalized)
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundColor(.zensationText)
                    }

                    Spacer()

                    Text(item.timestamp, style: .relative)
                        .font(.caption2)
                        .foregroundColor(.zensationTextMuted)
                }

                // Content
                Text(item.content)
                    .font(.subheadline)
                    .foregroundColor(.zensationText)

                // Media attachment
                if item.mediaUrl != nil {
                    HStack(spacing: 6) {
                        Image(systemName: "paperclip")
                            .font(.caption2)
                        Text("Media angehängt")
                            .font(.caption)
                    }
                    .foregroundColor(.zensationOrange)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.zensationOrange.opacity(0.1))
                    .cornerRadius(6)
                }
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.zensationSurface)
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.zensationBorder, lineWidth: 1)
            )
        }
        .padding(.bottom, isLast ? 0 : 8)
    }

    private func iconForType(_ type: StoryItemType) -> String {
        switch type {
        case .text: return "text.bubble.fill"
        case .audio: return "waveform"
        case .photo: return "photo.fill"
        case .video: return "video.fill"
        case .idea: return "lightbulb.fill"
        }
    }

    private func colorForType(_ type: StoryItemType) -> Color {
        switch type {
        case .text: return .blue
        case .audio: return .purple
        case .photo: return .green
        case .video: return .red
        case .idea: return .orange
        }
    }
}

#Preview {
    StoriesView()
        .environmentObject(APIService())
}

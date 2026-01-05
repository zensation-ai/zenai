import SwiftUI

// MARK: - Swipe Action
enum SwipeAction {
    case later      // Swipe left - review later
    case archive    // Swipe down - archive/dismiss
    case priority   // Swipe right - mark as priority
    case detail     // Tap - show detail

    var color: Color {
        switch self {
        case .later: return .zensationWarning
        case .archive: return .zensationTextMuted
        case .priority: return .zensationSuccess
        case .detail: return .zensationOrange
        }
    }

    var icon: String {
        switch self {
        case .later: return "clock.arrow.circlepath"
        case .archive: return "archivebox"
        case .priority: return "star.fill"
        case .detail: return "arrow.up.left.and.arrow.down.right"
        }
    }

    var label: String {
        switch self {
        case .later: return "Später"
        case .archive: return "Archiv"
        case .priority: return "Priorität"
        case .detail: return "Details"
        }
    }
}

// MARK: - Swipe Card View
struct SwipeCardView: View {
    let idea: Idea
    let onSwipe: (SwipeAction) -> Void
    let onTap: () -> Void

    @State private var offset: CGSize = .zero
    @State private var rotation: Double = 0
    @GestureState private var isDragging = false

    private let swipeThreshold: CGFloat = 100
    private let rotationMultiplier: Double = 0.02

    var currentAction: SwipeAction? {
        if offset.width > swipeThreshold {
            return .priority
        } else if offset.width < -swipeThreshold {
            return .later
        } else if offset.height > swipeThreshold {
            return .archive
        }
        return nil
    }

    var body: some View {
        ZStack {
            // Card background
            RoundedRectangle(cornerRadius: 20)
                .fill(Color.zensationSurface)
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(Color.zensationBorder, lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.25), radius: 12, x: 0, y: 6)

            // Action overlay
            if let action = currentAction {
                RoundedRectangle(cornerRadius: 20)
                    .fill(action.color.opacity(0.2))
                    .overlay(
                        VStack {
                            Image(systemName: action.icon)
                                .font(.system(size: 48))
                                .foregroundColor(action.color)
                            Text(action.label)
                                .font(.headline)
                                .foregroundColor(action.color)
                        }
                    )
            }

            // Card content
            VStack(alignment: .leading, spacing: 16) {
                // Header
                HStack {
                    Image(systemName: idea.type.icon)
                        .font(.title2)
                        .foregroundColor(colorFor(idea.type))

                    Spacer()

                    PriorityIndicator(priority: idea.priority)
                }

                // Title
                Text(idea.title)
                    .font(.title2)
                    .fontWeight(.bold)
                    .lineLimit(2)

                // Summary
                if let summary = idea.summary {
                    Text(summary)
                        .font(.body)
                        .foregroundColor(.zensationTextMuted)
                        .lineLimit(4)
                }

                Spacer()

                // Keywords
                if let keywords = idea.keywords, !keywords.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(keywords.prefix(5), id: \.self) { keyword in
                                Text(keyword)
                                    .font(.caption)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 4)
                                    .background(Color.zensationOrange.opacity(0.15))
                                    .foregroundColor(.zensationOrange)
                                    .clipShape(Capsule())
                            }
                        }
                    }
                }

                // Footer
                HStack {
                    Label(idea.category.displayName, systemImage: "folder")
                        .font(.caption)
                        .foregroundColor(.zensationTextMuted)

                    Spacer()

                    Text(idea.createdAt.formatted(date: .abbreviated, time: .omitted))
                        .font(.caption)
                        .foregroundColor(.zensationTextMuted)
                }
            }
            .padding(24)
            .opacity(currentAction == nil ? 1.0 : 0.3)
        }
        .frame(height: 400)
        .offset(offset)
        .rotationEffect(.degrees(rotation))
        .gesture(
            DragGesture()
                .updating($isDragging) { _, state, _ in
                    state = true
                }
                .onChanged { value in
                    offset = value.translation
                    rotation = Double(value.translation.width) * rotationMultiplier
                }
                .onEnded { value in
                    handleSwipeEnd(translation: value.translation)
                }
        )
        .onTapGesture {
            onTap()
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.7), value: offset)
    }

    private func handleSwipeEnd(translation: CGSize) {
        if let action = currentAction {
            // Animate out
            withAnimation(.easeOut(duration: 0.3)) {
                switch action {
                case .priority:
                    offset.width = 500
                case .later:
                    offset.width = -500
                case .archive:
                    offset.height = 500
                case .detail:
                    break
                }
            }

            // Trigger action after animation
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                onSwipe(action)
            }
        } else {
            // Reset position
            withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                offset = .zero
                rotation = 0
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

// MARK: - Priority Indicator
struct PriorityIndicator: View {
    let priority: Priority

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3) { index in
                Circle()
                    .fill(index < priorityLevel ? priorityColor : Color.gray.opacity(0.3))
                    .frame(width: 8, height: 8)
            }
        }
    }

    private var priorityLevel: Int {
        switch priority {
        case .low: return 1
        case .medium: return 2
        case .high: return 3
        }
    }

    private var priorityColor: Color {
        switch priority {
        case .low: return .zensationTextMuted
        case .medium: return .zensationOrange
        case .high: return .zensationDanger
        }
    }
}

// MARK: - Swipe Cards Stack View
struct SwipeCardsView: View {
    @EnvironmentObject var apiService: APIService
    @State private var ideas: [Idea] = []
    @State private var currentIndex = 0
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var selectedIdea: Idea?
    @State private var showingDetail = false
    @State private var actionHistory: [(Idea, SwipeAction)] = []

    var body: some View {
        NavigationStack {
            ZStack {
                // Background
                Color.zensationBackground
                    .ignoresSafeArea()

                if isLoading {
                    ProgressView("Lade Ideen...")
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
                } else if ideas.isEmpty || currentIndex >= ideas.count {
                    // Empty state
                    VStack(spacing: 20) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 80))
                            .foregroundColor(.zensationSuccess)

                        Text("Alle Ideen durchgesehen!")
                            .font(.title2)
                            .fontWeight(.semibold)

                        Text("Du hast alle deine Ideen bearbeitet.")
                            .foregroundColor(.zensationTextMuted)

                        if !actionHistory.isEmpty {
                            Button("Letzte Aktion rückgängig") {
                                undoLastAction()
                            }
                            .buttonStyle(.bordered)
                        }

                        Button("Neu laden") {
                            Task { await loadIdeas() }
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .padding()
                } else {
                    VStack {
                        // Swipe hints
                        SwipeHintsView()
                            .padding(.top)

                        Spacer()

                        // Card stack
                        ZStack {
                            // Show next card behind
                            if currentIndex + 1 < ideas.count {
                                SwipeCardView(
                                    idea: ideas[currentIndex + 1],
                                    onSwipe: { _ in },
                                    onTap: {}
                                )
                                .scaleEffect(0.95)
                                .offset(y: 10)
                                .opacity(0.5)
                            }

                            // Current card
                            SwipeCardView(
                                idea: ideas[currentIndex],
                                onSwipe: handleSwipe,
                                onTap: {
                                    selectedIdea = ideas[currentIndex]
                                    showingDetail = true
                                }
                            )
                        }
                        .padding(.horizontal, 20)

                        Spacer()

                        // Action buttons
                        HStack(spacing: 40) {
                            ActionButton(action: .later) {
                                performAction(.later)
                            }

                            ActionButton(action: .archive) {
                                performAction(.archive)
                            }

                            ActionButton(action: .priority) {
                                performAction(.priority)
                            }
                        }
                        .padding(.bottom, 30)
                    }
                }
            }
            .navigationTitle("Review")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    if !actionHistory.isEmpty {
                        Button(action: undoLastAction) {
                            Image(systemName: "arrow.uturn.backward")
                        }
                    }
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    if !ideas.isEmpty && currentIndex < ideas.count {
                        Text("\(currentIndex + 1) / \(ideas.count)")
                            .font(.caption)
                            .foregroundColor(.zensationTextMuted)
                    }
                }
            }
            .sheet(isPresented: $showingDetail) {
                if let idea = selectedIdea {
                    NavigationStack {
                        IdeaDetailView(idea: idea)
                            .toolbar {
                                ToolbarItem(placement: .navigationBarTrailing) {
                                    Button("Fertig") {
                                        showingDetail = false
                                    }
                                }
                            }
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
        currentIndex = 0
        actionHistory = []

        do {
            ideas = try await apiService.fetchIdeas()
        } catch {
            errorMessage = error.localizedDescription
            ideas = Idea.sampleData
        }

        isLoading = false
    }

    private func handleSwipe(_ action: SwipeAction) {
        guard currentIndex < ideas.count else { return }

        let idea = ideas[currentIndex]
        actionHistory.append((idea, action))
        currentIndex += 1

        // Send action to backend
        Task {
            do {
                let actionString: String
                switch action {
                case .priority:
                    actionString = "priority"
                case .archive:
                    actionString = "archive"
                case .later:
                    actionString = "later"
                case .detail:
                    return // Don't send detail action
                }
                try await apiService.sendSwipeAction(ideaId: idea.id, action: actionString)
            } catch {
                print("Failed to sync swipe action: \(error)")
                // Optionally queue for offline sync
                OfflineQueueService.shared.enqueueSwipeAction(ideaId: idea.id, action: action)
            }
        }
    }

    private func performAction(_ action: SwipeAction) {
        handleSwipe(action)
    }

    private func undoLastAction() {
        guard !actionHistory.isEmpty else { return }

        actionHistory.removeLast()
        currentIndex = max(0, currentIndex - 1)
    }
}

// MARK: - Swipe Hints
struct SwipeHintsView: View {
    var body: some View {
        HStack {
            HintLabel(icon: "clock.arrow.circlepath", text: "Später", direction: .left)
            Spacer()
            HintLabel(icon: "star.fill", text: "Priorität", direction: .right)
        }
        .font(.caption)
        .foregroundColor(.zensationTextMuted)
        .padding(.horizontal, 30)
    }
}

struct HintLabel: View {
    let icon: String
    let text: String
    let direction: HintDirection

    enum HintDirection {
        case left, right
    }

    var body: some View {
        HStack(spacing: 4) {
            if direction == .left {
                Image(systemName: "chevron.left")
            }
            Image(systemName: icon)
            Text(text)
            if direction == .right {
                Image(systemName: "chevron.right")
            }
        }
    }
}

// MARK: - Action Button
struct ActionButton: View {
    let action: SwipeAction
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            ZStack {
                Circle()
                    .fill(action.color.opacity(0.15))
                    .frame(width: 60, height: 60)

                Image(systemName: action.icon)
                    .font(.title2)
                    .foregroundColor(action.color)
            }
        }
    }
}

#Preview {
    SwipeCardsView()
        .environmentObject(APIService())
}

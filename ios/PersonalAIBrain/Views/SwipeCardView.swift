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
    @EnvironmentObject var contextManager: ContextManager

    @State private var ideas: [Idea] = []
    @State private var currentIndex = 0
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var selectedIdea: Idea?
    @State private var showingDetail = false
    @State private var actionHistory: [(Idea, SwipeAction)] = []

    // Toast feedback
    @State private var showActionToast = false
    @State private var lastAction: SwipeAction?
    @State private var lastActionIdea: Idea?

    // Context tracking
    @State private var lastLoadedContext: AIContext?

    var body: some View {
        NavigationStack {
            ZStack {
                // Background
                Color.zensationBackground
                    .ignoresSafeArea()

                if isLoading {
                    // Enhanced loading state with context
                    VStack(spacing: 20) {
                        AIBrainView(isActive: true, activityType: .thinking, size: 64)
                        Text("Lade \(contextManager.currentContext.displayName)-Ideen...")
                            .font(.headline)
                            .foregroundColor(.zensationTextMuted)
                        Text("Suche nach Ideen zum Reviewen")
                            .font(.caption)
                            .foregroundColor(.zensationTextMuted)

                        // Context indicator
                        ContextIndicator(context: contextManager.currentContext)
                    }
                } else if let error = errorMessage {
                    VStack(spacing: 16) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.system(size: 48))
                            .foregroundColor(.zensationWarning)
                        Text("Verbindungsproblem")
                            .font(.headline)
                        Text(error)
                            .font(.subheadline)
                            .foregroundColor(.zensationTextMuted)
                            .multilineTextAlignment(.center)
                        Button(action: { Task { await loadIdeas() } }) {
                            HStack {
                                Image(systemName: "arrow.clockwise")
                                Text("Erneut versuchen")
                            }
                        }
                        .buttonStyle(.bordered)
                    }
                    .padding()
                } else if ideas.isEmpty || currentIndex >= ideas.count {
                    // Enhanced empty state with context
                    VStack(spacing: 20) {
                        AIBrainView(isActive: false, activityType: .idle, size: 80)

                        Text("Alle \(contextManager.currentContext.displayName)-Ideen durchgesehen!")
                            .font(.title2)
                            .fontWeight(.semibold)

                        Text("Du hast alle \(ideas.count) Ideen im \(contextManager.currentContext.displayName)-Bereich bearbeitet.")
                            .foregroundColor(.zensationTextMuted)
                            .multilineTextAlignment(.center)

                        // Action summary
                        if !actionHistory.isEmpty {
                            actionSummaryView
                        }

                        HStack(spacing: 16) {
                            if !actionHistory.isEmpty {
                                Button(action: undoLastAction) {
                                    HStack {
                                        Image(systemName: "arrow.uturn.backward")
                                        Text("Rückgängig")
                                    }
                                }
                                .buttonStyle(.bordered)
                            }

                            Button(action: { Task { await loadIdeas() } }) {
                                HStack {
                                    Image(systemName: "arrow.clockwise")
                                    Text("Neu laden")
                                }
                            }
                            .buttonStyle(.borderedProminent)
                        }
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

                        // Action buttons with labels
                        HStack(spacing: 30) {
                            ActionButtonWithLabel(action: .later) {
                                performAction(.later)
                            }

                            ActionButtonWithLabel(action: .archive) {
                                performAction(.archive)
                            }

                            ActionButtonWithLabel(action: .priority) {
                                performAction(.priority)
                            }
                        }
                        .padding(.bottom, 20)
                    }
                }

                // Action Toast Overlay
                VStack {
                    Spacer()
                    if showActionToast, let action = lastAction, let idea = lastActionIdea {
                        SwipeActionToast(action: action, ideaTitle: idea.title) {
                            undoLastAction()
                        }
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        .padding(.bottom, 100)
                    }
                }
                .animation(.spring(response: 0.3), value: showActionToast)
            }
            .navigationTitle("Review")
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarBackground(Color.zensationSurface, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    if !actionHistory.isEmpty {
                        Button(action: undoLastAction) {
                            HStack(spacing: 4) {
                                Image(systemName: "arrow.uturn.backward")
                                Text("\(actionHistory.count)")
                                    .font(.caption)
                            }
                        }
                    }
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    if !ideas.isEmpty && currentIndex < ideas.count {
                        HStack(spacing: 4) {
                            Text("\(currentIndex + 1)")
                                .fontWeight(.semibold)
                            Text("/")
                            Text("\(ideas.count)")
                        }
                        .font(.subheadline)
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
        .onChange(of: contextManager.currentContext) { oldContext, newContext in
            // Reload when context changes
            if lastLoadedContext != newContext {
                Task {
                    await loadIdeas()
                }
            }
        }
    }

    // MARK: - Action Summary View
    private var actionSummaryView: some View {
        let priorityCount = actionHistory.filter { $0.1 == .priority }.count
        let laterCount = actionHistory.filter { $0.1 == .later }.count
        let archiveCount = actionHistory.filter { $0.1 == .archive }.count

        return HStack(spacing: 20) {
            if priorityCount > 0 {
                VStack(spacing: 4) {
                    Image(systemName: "star.fill")
                        .foregroundColor(.zensationSuccess)
                    Text("\(priorityCount)")
                        .font(.headline)
                    Text("Priorität")
                        .font(.caption2)
                        .foregroundColor(.zensationTextMuted)
                }
            }
            if laterCount > 0 {
                VStack(spacing: 4) {
                    Image(systemName: "clock.arrow.circlepath")
                        .foregroundColor(.zensationWarning)
                    Text("\(laterCount)")
                        .font(.headline)
                    Text("Später")
                        .font(.caption2)
                        .foregroundColor(.zensationTextMuted)
                }
            }
            if archiveCount > 0 {
                VStack(spacing: 4) {
                    Image(systemName: "archivebox")
                        .foregroundColor(.zensationTextMuted)
                    Text("\(archiveCount)")
                        .font(.headline)
                    Text("Archiviert")
                        .font(.caption2)
                        .foregroundColor(.zensationTextMuted)
                }
            }
        }
        .padding()
        .background(Color.zensationSurfaceLight)
        .cornerRadius(12)
    }

    private func loadIdeas() async {
        print("🎴 SwipeCardsView.loadIdeas() called")
        isLoading = true
        errorMessage = nil
        currentIndex = 0
        actionHistory = []
        lastLoadedContext = contextManager.currentContext

        do {
            print("🔄 SwipeCardsView: Fetching \(contextManager.currentContext.displayName) ideas...")
            let fetchedIdeas = try await apiService.fetchIdeasForContext(context: contextManager.currentContext)
            print("✅ SwipeCardsView: Received \(fetchedIdeas.count) ideas from API")
            ideas = fetchedIdeas
            print("📊 SwipeCardsView: ideas array now has \(ideas.count) items")
        } catch {
            print("❌ SwipeCardsView: Error loading ideas: \(error)")
            errorMessage = error.localizedDescription
            ideas = Idea.sampleData
            print("⚠️ SwipeCardsView: Using sample data, count = \(ideas.count)")
        }

        isLoading = false
        print("🎴 SwipeCardsView: isLoading = false, ideas.count = \(ideas.count)")
    }

    private func handleSwipe(_ action: SwipeAction) {
        guard currentIndex < ideas.count else { return }

        let idea = ideas[currentIndex]

        // Haptic feedback based on action
        triggerHapticFeedback(for: action)

        actionHistory.append((idea, action))
        lastAction = action
        lastActionIdea = idea
        currentIndex += 1

        // Show toast
        showActionToast = true

        // Auto-hide toast
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
            if lastActionIdea?.id == idea.id {
                showActionToast = false
            }
        }

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
                OfflineQueueService.shared.enqueueSwipeAction(ideaId: idea.id, action: action)
            }
        }
    }

    private func triggerHapticFeedback(for action: SwipeAction) {
        switch action {
        case .priority:
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)
        case .archive:
            let generator = UIImpactFeedbackGenerator(style: .medium)
            generator.impactOccurred()
        case .later:
            let generator = UIImpactFeedbackGenerator(style: .light)
            generator.impactOccurred()
        case .detail:
            let generator = UISelectionFeedbackGenerator()
            generator.selectionChanged()
        }
    }

    private func performAction(_ action: SwipeAction) {
        handleSwipe(action)
    }

    private func undoLastAction() {
        guard !actionHistory.isEmpty else { return }

        // Haptic for undo
        let generator = UIImpactFeedbackGenerator(style: .rigid)
        generator.impactOccurred()

        actionHistory.removeLast()
        currentIndex = max(0, currentIndex - 1)
        showActionToast = false
    }
}

// MARK: - Swipe Action Toast
struct SwipeActionToast: View {
    let action: SwipeAction
    let ideaTitle: String
    let onUndo: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: action.icon)
                .font(.title3)
                .foregroundColor(action.color)

            VStack(alignment: .leading, spacing: 2) {
                Text(actionMessage)
                    .font(.subheadline)
                    .fontWeight(.medium)
                Text(ideaTitle)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            Button("Rückgängig") {
                onUndo()
            }
            .font(.subheadline)
            .fontWeight(.medium)
            .foregroundColor(action.color)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemBackground))
                .shadow(color: .black.opacity(0.15), radius: 8, y: 4)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(action.color.opacity(0.3), lineWidth: 1)
        )
        .padding(.horizontal)
    }

    private var actionMessage: String {
        switch action {
        case .priority: return "Als Priorität markiert"
        case .later: return "Für später markiert"
        case .archive: return "Archiviert"
        case .detail: return "Geöffnet"
        }
    }
}

// MARK: - Action Button with Label
struct ActionButtonWithLabel: View {
    let action: SwipeAction
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 8) {
                ZStack {
                    Circle()
                        .fill(action.color.opacity(0.15))
                        .frame(width: 56, height: 56)

                    Image(systemName: action.icon)
                        .font(.title2)
                        .foregroundColor(action.color)
                }

                Text(action.label)
                    .font(.caption)
                    .foregroundColor(.zensationTextMuted)
            }
        }
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
        .environmentObject(ContextManager())
}

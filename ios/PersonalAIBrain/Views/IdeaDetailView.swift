import SwiftUI

struct IdeaDetailView: View {
    @EnvironmentObject var apiService: APIService
    @Environment(\.dismiss) private var dismiss

    let idea: Idea
    var onDelete: (() -> Void)?
    var onUpdate: ((Idea) -> Void)?

    @State private var showDeleteConfirm = false
    @State private var isDeleting = false
    @State private var errorMessage: String?

    // Phase 25: Draft Support
    @State private var draft: Draft?
    @State private var isLoadingDraft = false
    @State private var showDraftCopied = false

    // Phase 5: Draft Feedback
    @State private var feedbackGiven = false
    @State private var showFeedbackSheet = false
    @State private var showFeedbackPrompt = false

    // Phase 4: Editing Support
    @State private var isEditing = false
    @State private var isSaving = false
    @State private var editTitle: String = ""
    @State private var editSummary: String = ""
    @State private var editType: IdeaType = .idea
    @State private var editCategory: IdeaCategory = .personal
    @State private var editPriority: Priority = .medium
    @State private var editNextSteps: String = ""
    @State private var editKeywords: String = ""

    var body: some View {
        ZStack {
            Color.zensationBackground.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Header
                    VStack(alignment: .leading, spacing: 8) {
                        if isEditing {
                            // Editing Mode - Type & Priority Pickers
                            HStack {
                                Picker("Typ", selection: $editType) {
                                    ForEach(IdeaType.allCases, id: \.self) { type in
                                        Label(type.displayName, systemImage: type.icon).tag(type)
                                    }
                                }
                                .pickerStyle(.menu)
                                .tint(.zensationOrange)

                                Spacer()

                                Picker("Priorität", selection: $editPriority) {
                                    ForEach(Priority.allCases, id: \.self) { priority in
                                        Text(priority.displayName).tag(priority)
                                    }
                                }
                                .pickerStyle(.menu)
                                .tint(priorityColor(editPriority))
                            }

                            // Editable Title
                            TextField("Titel", text: $editTitle)
                                .font(.title2)
                                .fontWeight(.bold)
                                .foregroundColor(.zensationText)
                                .textFieldStyle(.plain)

                            // Category Picker
                            HStack {
                                Picker("Kategorie", selection: $editCategory) {
                                    ForEach(IdeaCategory.allCases, id: \.self) { category in
                                        Label(category.displayName, systemImage: "folder").tag(category)
                                    }
                                }
                                .pickerStyle(.menu)
                                .tint(.zensationTextMuted)

                                Spacer()

                                Text(idea.createdAt.formatted(date: .long, time: .shortened))
                                    .font(.caption)
                                    .foregroundColor(.zensationTextMuted)
                            }
                        } else {
                            // Display Mode
                            HStack {
                                Image(systemName: idea.type.icon)
                                    .font(.title2)
                                    .foregroundColor(colorFor(idea.type))

                                Text(idea.type.displayName)
                                    .font(.subheadline)
                                    .foregroundColor(.zensationTextMuted)

                                Spacer()

                                PriorityBadge(priority: idea.priority)
                            }

                            Text(idea.title)
                                .font(.title)
                                .fontWeight(.bold)
                                .foregroundColor(.zensationText)

                            HStack {
                                Label(idea.category.displayName, systemImage: "folder")
                                Spacer()
                                Text(idea.createdAt.formatted(date: .long, time: .shortened))
                            }
                            .font(.caption)
                            .foregroundColor(.zensationTextMuted)
                        }
                    }
                    .padding()
                    .background(Color.zensationSurface)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(isEditing ? Color.zensationOrange : Color.zensationBorder, lineWidth: isEditing ? 2 : 1)
                    )

                // Summary
                if isEditing || idea.summary != nil {
                    SectionCard(title: "Zusammenfassung", icon: "doc.text") {
                        if isEditing {
                            TextEditor(text: $editSummary)
                                .frame(minHeight: 80)
                                .scrollContentBackground(.hidden)
                                .foregroundColor(.zensationText)
                        } else if let summary = idea.summary {
                            Text(summary)
                        }
                    }
                }

                // Phase 25: Draft Section (for tasks)
                if idea.type == .task {
                    if isLoadingDraft {
                        SectionCard(title: "Entwurf", icon: "doc.badge.gearshape") {
                            HStack {
                                ProgressView()
                                    .scaleEffect(0.8)
                                Text("Lade Entwurf...")
                                    .foregroundColor(.zensationTextMuted)
                            }
                        }
                    } else if let draft = draft {
                        DraftSectionCard(
                            draft: draft,
                            feedbackGiven: feedbackGiven,
                            onCopy: {
                                UIPasteboard.general.string = draft.content
                                showDraftCopied = true
                                // Hide after 2 seconds
                                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                                    showDraftCopied = false
                                }
                                // Phase 5: Record copy and show feedback prompt
                                Task {
                                    await apiService.recordDraftCopy(draftId: draft.id)
                                    if !feedbackGiven {
                                        try? await Task.sleep(nanoseconds: 3_000_000_000) // 3 seconds
                                        await MainActor.run {
                                            if !feedbackGiven {
                                                showFeedbackPrompt = true
                                            }
                                        }
                                    }
                                }
                            },
                            onFeedbackTap: {
                                showFeedbackSheet = true
                            },
                            onQuickFeedback: {
                                feedbackGiven = true
                            }
                        )
                    }
                }

                // Next Steps
                if isEditing || (idea.nextSteps != nil && !idea.nextSteps!.isEmpty) {
                    SectionCard(title: "Nächste Schritte", icon: "checklist") {
                        if isEditing {
                            VStack(alignment: .leading, spacing: 4) {
                                TextEditor(text: $editNextSteps)
                                    .frame(minHeight: 60)
                                    .scrollContentBackground(.hidden)
                                    .foregroundColor(.zensationText)
                                Text("Ein Schritt pro Zeile")
                                    .font(.caption2)
                                    .foregroundColor(.zensationTextMuted)
                            }
                        } else if let nextSteps = idea.nextSteps {
                            VStack(alignment: .leading, spacing: 8) {
                                ForEach(nextSteps, id: \.self) { step in
                                    HStack(alignment: .top, spacing: 8) {
                                        Image(systemName: "circle")
                                            .font(.caption)
                                            .foregroundColor(.blue)
                                        Text(step)
                                    }
                                }
                            }
                        }
                    }
                }

                // Context Needed (read-only, generated by AI)
                if !isEditing, let context = idea.contextNeeded, !context.isEmpty {
                    SectionCard(title: "Benötigter Kontext", icon: "questionmark.circle") {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(context, id: \.self) { item in
                                HStack(alignment: .top, spacing: 8) {
                                    Image(systemName: "arrow.right.circle")
                                        .font(.caption)
                                        .foregroundColor(.orange)
                                    Text(item)
                                }
                            }
                        }
                    }
                }

                // Keywords
                if isEditing || (idea.keywords != nil && !idea.keywords!.isEmpty) {
                    SectionCard(title: "Keywords", icon: "tag") {
                        if isEditing {
                            VStack(alignment: .leading, spacing: 4) {
                                TextField("Keywords (kommagetrennt)", text: $editKeywords)
                                    .textFieldStyle(.plain)
                                    .foregroundColor(.zensationText)
                                Text("Kommagetrennt eingeben")
                                    .font(.caption2)
                                    .foregroundColor(.zensationTextMuted)
                            }
                        } else if let keywords = idea.keywords {
                            FlowLayout(spacing: 8) {
                                ForEach(keywords, id: \.self) { keyword in
                                    Text(keyword)
                                        .font(.caption)
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 4)
                                        .background(Color.blue.opacity(0.1))
                                        .foregroundColor(.blue)
                                        .clipShape(Capsule())
                                }
                            }
                        }
                    }
                }

                // Raw Transcript
                if let transcript = idea.rawTranscript {
                    SectionCard(title: "Original-Transkript", icon: "waveform") {
                        Text(transcript)
                            .font(.callout)
                            .foregroundColor(.zensationTextMuted)
                            .italic()
                    }
                }
            }
            .padding()
        }
        }
        .navigationTitle("Details")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbarBackground(Color.zensationSurface, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                if isEditing {
                    Button("Abbrechen") {
                        isEditing = false
                    }
                    .foregroundColor(.zensationTextMuted)
                }
            }
            ToolbarItemGroup(placement: .navigationBarTrailing) {
                if isEditing {
                    Button {
                        saveChanges()
                    } label: {
                        if isSaving {
                            ProgressView()
                                .scaleEffect(0.8)
                        } else {
                            Text("Speichern")
                                .fontWeight(.semibold)
                        }
                    }
                    .disabled(isSaving || editTitle.isEmpty)
                    .foregroundColor(.zensationOrange)
                } else {
                    Button {
                        startEditing()
                    } label: {
                        Image(systemName: "pencil")
                    }
                    .foregroundColor(.zensationOrange)

                    Button(role: .destructive) {
                        showDeleteConfirm = true
                    } label: {
                        Image(systemName: "trash")
                            .foregroundColor(.zensationDanger)
                    }
                    .disabled(isDeleting)
                }
            }
        }
        .confirmationDialog(
            "Gedanke löschen?",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Löschen", role: .destructive) {
                deleteIdea()
            }
            Button("Abbrechen", role: .cancel) {}
        } message: {
            Text("Diese Aktion kann nicht rückgängig gemacht werden.")
        }
        .overlay {
            if isDeleting {
                Color.black.opacity(0.3)
                    .ignoresSafeArea()
                AIBrainView(isActive: true, activityType: .processing, size: 64)
            }
        }
        .alert("Fehler", isPresented: .constant(errorMessage != nil)) {
            Button("OK") {
                errorMessage = nil
            }
        } message: {
            Text(errorMessage ?? "")
        }
        .overlay {
            if showDraftCopied {
                VStack {
                    Spacer()
                    Text("In Zwischenablage kopiert")
                        .font(.subheadline)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(Color.zensationSuccess)
                        .foregroundColor(.white)
                        .clipShape(Capsule())
                        .shadow(radius: 4)
                        .padding(.bottom, 50)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .animation(.easeInOut, value: showDraftCopied)
            }
        }
        // Phase 5: Feedback Sheet
        .sheet(isPresented: $showFeedbackSheet) {
            if let draft = draft {
                DraftFeedbackSheet(
                    draftId: draft.id,
                    draftType: draft.draftType,
                    wordCount: draft.wordCount,
                    onFeedbackSubmitted: {
                        feedbackGiven = true
                    }
                )
            }
        }
        // Phase 5: Feedback Prompt Overlay
        .overlay {
            if showFeedbackPrompt, let draft = draft {
                ZStack {
                    Color.black.opacity(0.4)
                        .ignoresSafeArea()
                        .onTapGesture {
                            showFeedbackPrompt = false
                        }

                    FeedbackPromptSheet(
                        draftId: draft.id,
                        onFeedbackSubmitted: {
                            feedbackGiven = true
                        },
                        onDismiss: {
                            showFeedbackPrompt = false
                        }
                    )
                }
                .transition(.opacity)
                .animation(.easeInOut, value: showFeedbackPrompt)
            }
        }
        .task {
            // Load draft for tasks
            if idea.type == .task {
                await loadDraft()
            }
        }
    }

    // MARK: - Draft Loading

    private func loadDraft() async {
        isLoadingDraft = true
        // Use the idea's own context, fallback to current context if not available
        let ideaContext = idea.context ?? ContextManager.shared.currentContext
        print("📝 Loading draft for idea \(idea.id) in context: \(ideaContext.rawValue)")
        print("📝 Idea type: \(idea.type.rawValue), idea.context: \(idea.context?.rawValue ?? "nil")")

        do {
            let loadedDraft = try await apiService.fetchDraftForIdea(ideaId: idea.id, context: ideaContext)
            draft = loadedDraft
            if let d = loadedDraft {
                print("✅ Draft loaded successfully: type=\(d.draftType.rawValue), wordCount=\(d.wordCount), status=\(d.status.rawValue)")
            } else {
                print("ℹ️ No draft available for this idea")
            }
        } catch let error as APIError {
            print("❌ API error loading draft: \(error)")
        } catch {
            print("❌ Failed to load draft: \(error.localizedDescription)")
            print("❌ Full error: \(error)")
        }
        isLoadingDraft = false
    }

    private func deleteIdea() {
        isDeleting = true
        Task {
            do {
                try await apiService.deleteIdea(id: idea.id)
                await MainActor.run {
                    onDelete?()
                    dismiss()
                }
            } catch {
                await MainActor.run {
                    errorMessage = "Gedanke konnte nicht gelöscht werden: \(error.localizedDescription)"
                }
            }
            await MainActor.run {
                isDeleting = false
            }
        }
    }

    // MARK: - Editing

    private func startEditing() {
        editTitle = idea.title
        editSummary = idea.summary ?? ""
        editType = idea.type
        editCategory = idea.category
        editPriority = idea.priority
        editNextSteps = (idea.nextSteps ?? []).joined(separator: "\n")
        editKeywords = (idea.keywords ?? []).joined(separator: ", ")
        isEditing = true
    }

    private func saveChanges() {
        isSaving = true
        Task {
            do {
                let nextStepsArray = editNextSteps
                    .split(separator: "\n")
                    .map { String($0).trimmingCharacters(in: .whitespaces) }
                    .filter { !$0.isEmpty }

                let keywordsArray = editKeywords
                    .split(separator: ",")
                    .map { String($0).trimmingCharacters(in: .whitespaces) }
                    .filter { !$0.isEmpty }

                let updatedIdea = try await apiService.updateIdea(
                    id: idea.id,
                    title: editTitle,
                    summary: editSummary.isEmpty ? nil : editSummary,
                    type: editType,
                    category: editCategory,
                    priority: editPriority,
                    nextSteps: nextStepsArray.isEmpty ? nil : nextStepsArray,
                    keywords: keywordsArray.isEmpty ? nil : keywordsArray
                )

                await MainActor.run {
                    onUpdate?(updatedIdea)
                    isEditing = false
                }
            } catch {
                await MainActor.run {
                    errorMessage = "Änderungen konnten nicht gespeichert werden: \(error.localizedDescription)"
                }
            }
            await MainActor.run {
                isSaving = false
            }
        }
    }

    private func colorFor(_ type: IdeaType) -> Color {
        switch type {
        case .idea: return .yellow
        case .task: return .blue
        case .insight: return .purple
        case .problem: return .red
        case .question: return .orange
        }
    }

    private func priorityColor(_ priority: Priority) -> Color {
        switch priority {
        case .low: return .zensationTextMuted
        case .medium: return .zensationOrange
        case .high: return .zensationDanger
        }
    }
}

// MARK: - Section Card

struct SectionCard<Content: View>: View {
    let title: String
    let icon: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: icon)
                    .foregroundColor(.zensationOrange)
                Text(title)
                    .fontWeight(.semibold)
                    .foregroundColor(.zensationText)
            }
            .font(.headline)

            content
                .foregroundColor(.zensationText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.zensationSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.zensationBorder, lineWidth: 1)
        )
    }
}

// MARK: - Draft Section Card

struct DraftSectionCard: View {
    let draft: Draft
    var feedbackGiven: Bool = false
    let onCopy: () -> Void
    var onFeedbackTap: (() -> Void)?
    var onQuickFeedback: (() -> Void)?

    @EnvironmentObject var apiService: APIService
    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                Image(systemName: draft.draftType.icon)
                    .foregroundColor(.zensationSuccess)
                Text("\(draft.draftType.displayName)-Entwurf")
                    .fontWeight(.semibold)
                    .foregroundColor(.zensationText)

                Spacer()

                Text("\(draft.wordCount) Wörter")
                    .font(.caption)
                    .foregroundColor(.zensationTextMuted)
            }
            .font(.headline)

            // Content Preview or Full
            VStack(alignment: .leading, spacing: 8) {
                Text(isExpanded ? draft.content : String(draft.content.prefix(200)) + (draft.content.count > 200 ? "..." : ""))
                    .font(.body)
                    .foregroundColor(.zensationText)
                    .lineLimit(isExpanded ? nil : 5)

                if draft.content.count > 200 {
                    Button(isExpanded ? "Weniger anzeigen" : "Mehr anzeigen") {
                        withAnimation {
                            isExpanded.toggle()
                        }
                    }
                    .font(.caption)
                    .foregroundColor(.blue)
                }
            }

            // Actions
            HStack(spacing: 12) {
                Button(action: onCopy) {
                    Label("Kopieren", systemImage: "doc.on.doc")
                        .font(.subheadline)
                        .foregroundColor(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Color.zensationSuccess)
                        .clipShape(Capsule())
                }

                Spacer()
            }

            // Phase 5: Feedback Section
            Divider()
                .padding(.vertical, 4)

            if feedbackGiven {
                FeedbackSubmittedBadge()
            } else {
                VStack(spacing: 10) {
                    QuickFeedbackView(draftId: draft.id, onFeedbackSubmitted: {
                        onQuickFeedback?()
                    })

                    if let onFeedbackTap = onFeedbackTap {
                        FeedbackButton(action: onFeedbackTap)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.zensationSuccess.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.zensationSuccess.opacity(0.3), lineWidth: 1)
        )
    }
}

// MARK: - Flow Layout

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = FlowResult(in: proposal.width ?? 0, subviews: subviews, spacing: spacing)
        return CGSize(width: proposal.width ?? 0, height: result.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = FlowResult(in: bounds.width, subviews: subviews, spacing: spacing)

        for (index, subview) in subviews.enumerated() {
            let point = result.positions[index]
            subview.place(at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y), proposal: .unspecified)
        }
    }

    struct FlowResult {
        var positions: [CGPoint] = []
        var height: CGFloat = 0

        init(in width: CGFloat, subviews: Subviews, spacing: CGFloat) {
            var currentX: CGFloat = 0
            var currentY: CGFloat = 0
            var lineHeight: CGFloat = 0

            for subview in subviews {
                let size = subview.sizeThatFits(.unspecified)

                if currentX + size.width > width && currentX > 0 {
                    currentX = 0
                    currentY += lineHeight + spacing
                    lineHeight = 0
                }

                positions.append(CGPoint(x: currentX, y: currentY))
                lineHeight = max(lineHeight, size.height)
                currentX += size.width + spacing
            }

            height = currentY + lineHeight
        }
    }
}

#Preview {
    NavigationStack {
        IdeaDetailView(idea: Idea.sampleData[0])
    }
}

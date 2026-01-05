import SwiftUI

// MARK: - Training View
/// Allows users to explicitly train the AI by correcting its outputs
struct TrainingView: View {
    @EnvironmentObject var apiService: APIService
    @EnvironmentObject var contextManager: ContextManager

    @State private var trainingItems: [TrainingItem] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showingTrainingForm = false
    @State private var selectedIdea: Idea?

    var body: some View {
        NavigationStack {
            ZStack {
                Color.zensationBackground
                    .ignoresSafeArea()

                if isLoading {
                    LoadingView()
                } else if let error = errorMessage {
                    ErrorView(message: error) {
                        Task { await loadTrainingHistory() }
                    }
                } else if trainingItems.isEmpty {
                    EmptyTrainingView(onStartTraining: { showingTrainingForm = true })
                } else {
                    TrainingListView(
                        items: trainingItems,
                        onAddNew: { showingTrainingForm = true }
                    )
                }
            }
            .navigationTitle("AI Training")
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarBackground(Color.zensationSurface, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showingTrainingForm = true }) {
                        Image(systemName: "plus.circle.fill")
                            .foregroundColor(.zensationOrange)
                    }
                }
            }
            .sheet(isPresented: $showingTrainingForm) {
                TrainingFormView(context: contextManager.currentContext) { training in
                    trainingItems.insert(training, at: 0)
                }
            }
        }
        .task {
            await loadTrainingHistory()
        }
    }

    private func loadTrainingHistory() async {
        isLoading = true
        errorMessage = nil

        do {
            trainingItems = try await apiService.fetchTrainingHistory(context: contextManager.currentContext)
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }
}

// MARK: - Loading View
private struct LoadingView: View {
    var body: some View {
        VStack(spacing: 20) {
            AIBrainView(isActive: true, activityType: .thinking, size: 64)
            Text("Lade Training-Verlauf...")
                .font(.headline)
                .foregroundColor(.zensationTextMuted)
        }
    }
}

// MARK: - Error View
private struct ErrorView: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 48))
                .foregroundColor(.zensationWarning)
            Text("Fehler")
                .font(.headline)
            Text(message)
                .font(.subheadline)
                .foregroundColor(.zensationTextMuted)
                .multilineTextAlignment(.center)
            Button(action: onRetry) {
                HStack {
                    Image(systemName: "arrow.clockwise")
                    Text("Erneut versuchen")
                }
            }
            .buttonStyle(.bordered)
        }
        .padding()
    }
}

// MARK: - Empty Training View
private struct EmptyTrainingView: View {
    let onStartTraining: () -> Void

    var body: some View {
        VStack(spacing: 24) {
            // Brain Icon
            ZStack {
                Circle()
                    .fill(Color.zensationOrange.opacity(0.1))
                    .frame(width: 120, height: 120)

                Image(systemName: "brain.head.profile")
                    .font(.system(size: 48))
                    .foregroundColor(.zensationOrange)
            }

            VStack(spacing: 8) {
                Text("Trainiere deine AI")
                    .font(.title2)
                    .fontWeight(.bold)

                Text("Korrigiere die AI wenn sie falsch liegt.\nSie lernt aus deinem Feedback!")
                    .font(.subheadline)
                    .foregroundColor(.zensationTextMuted)
                    .multilineTextAlignment(.center)
            }

            // Training Benefits
            VStack(alignment: .leading, spacing: 12) {
                TrainingBenefitRow(
                    icon: "sparkles",
                    title: "Bessere Kategorisierung",
                    description: "Die AI lernt deine Kategorien"
                )
                TrainingBenefitRow(
                    icon: "text.quote",
                    title: "Tonalitat anpassen",
                    description: "Personal oder professionell"
                )
                TrainingBenefitRow(
                    icon: "tag.fill",
                    title: "Keywords verfeinern",
                    description: "Wichtige Begriffe erkennen"
                )
            }
            .padding()
            .background(Color.zensationSurfaceLight)
            .cornerRadius(16)

            Button(action: onStartTraining) {
                HStack {
                    Image(systemName: "plus.circle.fill")
                    Text("Erstes Training starten")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.zensationOrange)
        }
        .padding(24)
    }
}

// MARK: - Training Benefit Row
private struct TrainingBenefitRow: View {
    let icon: String
    let title: String
    let description: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundColor(.zensationOrange)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.medium)
                Text(description)
                    .font(.caption)
                    .foregroundColor(.zensationTextMuted)
            }
        }
    }
}

// MARK: - Training List View
private struct TrainingListView: View {
    let items: [TrainingItem]
    let onAddNew: () -> Void

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                // Stats Header
                TrainingStatsHeader(items: items)
                    .padding(.horizontal)
                    .padding(.top)

                // Training Items
                ForEach(items) { item in
                    TrainingItemCard(item: item)
                        .padding(.horizontal)
                }

                // Add new button
                Button(action: onAddNew) {
                    HStack {
                        Image(systemName: "plus.circle")
                        Text("Neues Training hinzufugen")
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.zensationSurfaceLight)
                    .cornerRadius(12)
                }
                .padding(.horizontal)
                .padding(.bottom, 20)
            }
        }
    }
}

// MARK: - Training Stats Header
private struct TrainingStatsHeader: View {
    let items: [TrainingItem]

    var body: some View {
        HStack(spacing: 16) {
            StatBox(
                value: "\(items.count)",
                label: "Trainings",
                icon: "brain.head.profile",
                color: .zensationOrange
            )

            StatBox(
                value: "\(categoryCorrections)",
                label: "Kategorie",
                icon: "folder.fill",
                color: .blue
            )

            StatBox(
                value: "\(priorityCorrections)",
                label: "Prioritat",
                icon: "star.fill",
                color: .yellow
            )

            StatBox(
                value: "\(toneCorrections)",
                label: "Tonalitat",
                icon: "waveform",
                color: .purple
            )
        }
    }

    private var categoryCorrections: Int {
        items.filter { $0.correctedCategory != nil }.count
    }

    private var priorityCorrections: Int {
        items.filter { $0.correctedPriority != nil }.count
    }

    private var toneCorrections: Int {
        items.filter { $0.toneFeedback != nil }.count
    }
}

// MARK: - Stat Box
private struct StatBox: View {
    let value: String
    let label: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundColor(color)
            Text(value)
                .font(.title3)
                .fontWeight(.bold)
            Text(label)
                .font(.caption2)
                .foregroundColor(.zensationTextMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Color.zensationSurfaceLight)
        .cornerRadius(12)
    }
}

// MARK: - Training Item Card
private struct TrainingItemCard: View {
    let item: TrainingItem

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                Image(systemName: item.trainingType.icon)
                    .foregroundColor(item.trainingType.color)

                Text(item.trainingType.displayName)
                    .font(.subheadline)
                    .fontWeight(.medium)

                Spacer()

                Text(item.createdAt.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption)
                    .foregroundColor(.zensationTextMuted)
            }

            // Original vs Corrected
            if let original = item.originalValue, let corrected = item.correctedValue {
                HStack(spacing: 8) {
                    // Original
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Original")
                            .font(.caption2)
                            .foregroundColor(.zensationTextMuted)
                        Text(original)
                            .font(.caption)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.red.opacity(0.1))
                            .foregroundColor(.red)
                            .cornerRadius(6)
                    }

                    Image(systemName: "arrow.right")
                        .font(.caption)
                        .foregroundColor(.zensationTextMuted)

                    // Corrected
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Korrigiert")
                            .font(.caption2)
                            .foregroundColor(.zensationTextMuted)
                        Text(corrected)
                            .font(.caption)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.green.opacity(0.1))
                            .foregroundColor(.green)
                            .cornerRadius(6)
                    }
                }
            }

            // Feedback text
            if let feedback = item.feedback {
                Text(feedback)
                    .font(.caption)
                    .foregroundColor(.zensationTextMuted)
                    .lineLimit(2)
            }

            // Weight indicator
            HStack {
                Text("Lerngewicht:")
                    .font(.caption2)
                    .foregroundColor(.zensationTextMuted)

                ForEach(0..<5) { index in
                    Image(systemName: index < item.weight / 2 ? "star.fill" : "star")
                        .font(.caption2)
                        .foregroundColor(.zensationOrange)
                }
            }
        }
        .padding()
        .background(Color.zensationSurface)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.zensationBorder, lineWidth: 1)
        )
    }
}

// MARK: - Training Form View
struct TrainingFormView: View {
    let context: AIContext
    let onComplete: (TrainingItem) -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var apiService: APIService

    @State private var selectedIdea: Idea?
    @State private var ideas: [Idea] = []
    @State private var isLoadingIdeas = true

    // Training fields
    @State private var trainingType: TrainingType = .category
    @State private var correctedCategory: IdeaCategory?
    @State private var correctedPriority: Priority?
    @State private var correctedType: IdeaType?
    @State private var toneFeedback: ToneFeedback?
    @State private var feedbackText = ""
    @State private var isSubmitting = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color.zensationBackground
                    .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 24) {
                        // Context indicator
                        ContextIndicator(context: context)
                            .padding(.top)

                        // Step 1: Select Idea
                        VStack(alignment: .leading, spacing: 12) {
                            SectionHeader(number: 1, title: "Wahle eine Idee")

                            if isLoadingIdeas {
                                ProgressView()
                                    .frame(maxWidth: .infinity, minHeight: 100)
                            } else if ideas.isEmpty {
                                Text("Keine Ideen vorhanden")
                                    .foregroundColor(.zensationTextMuted)
                                    .frame(maxWidth: .infinity, minHeight: 100)
                            } else {
                                IdeaPickerView(
                                    ideas: ideas,
                                    selectedIdea: $selectedIdea
                                )
                            }
                        }
                        .padding(.horizontal)

                        if selectedIdea != nil {
                            // Step 2: Training Type
                            VStack(alignment: .leading, spacing: 12) {
                                SectionHeader(number: 2, title: "Was korrigieren?")

                                TrainingTypePicker(selected: $trainingType)
                            }
                            .padding(.horizontal)

                            // Step 3: Correction
                            VStack(alignment: .leading, spacing: 12) {
                                SectionHeader(number: 3, title: "Korrektur")

                                switch trainingType {
                                case .category:
                                    CategoryCorrectionView(
                                        original: selectedIdea?.category,
                                        corrected: $correctedCategory
                                    )
                                case .priority:
                                    PriorityCorrectionView(
                                        original: selectedIdea?.priority,
                                        corrected: $correctedPriority
                                    )
                                case .type:
                                    TypeCorrectionView(
                                        original: selectedIdea?.type,
                                        corrected: $correctedType
                                    )
                                case .tone:
                                    ToneCorrectionView(selected: $toneFeedback)
                                case .general:
                                    GeneralFeedbackView(feedback: $feedbackText)
                                }
                            }
                            .padding(.horizontal)

                            // Step 4: Additional Feedback
                            if trainingType != .general {
                                VStack(alignment: .leading, spacing: 12) {
                                    SectionHeader(number: 4, title: "Zusatzliches Feedback (optional)")

                                    TextField("Erklare kurz warum...", text: $feedbackText, axis: .vertical)
                                        .textFieldStyle(.roundedBorder)
                                        .lineLimit(3...5)
                                }
                                .padding(.horizontal)
                            }

                            // Submit Button
                            Button(action: submitTraining) {
                                HStack {
                                    if isSubmitting {
                                        ProgressView()
                                            .tint(.white)
                                    } else {
                                        Image(systemName: "brain.head.profile")
                                        Text("Training speichern")
                                    }
                                }
                                .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(.zensationOrange)
                            .disabled(!isValidSubmission || isSubmitting)
                            .padding(.horizontal)
                            .padding(.bottom, 32)
                        }
                    }
                }
            }
            .navigationTitle("Neues Training")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Abbrechen") {
                        dismiss()
                    }
                }
            }
        }
        .task {
            await loadIdeas()
        }
    }

    private var isValidSubmission: Bool {
        guard selectedIdea != nil else { return false }

        switch trainingType {
        case .category:
            return correctedCategory != nil && correctedCategory != selectedIdea?.category
        case .priority:
            return correctedPriority != nil && correctedPriority != selectedIdea?.priority
        case .type:
            return correctedType != nil && correctedType != selectedIdea?.type
        case .tone:
            return toneFeedback != nil
        case .general:
            return !feedbackText.isEmpty
        }
    }

    private func loadIdeas() async {
        isLoadingIdeas = true
        do {
            ideas = try await apiService.fetchIdeas()
        } catch {
            print("Failed to load ideas: \(error)")
        }
        isLoadingIdeas = false
    }

    private func submitTraining() {
        guard let idea = selectedIdea else { return }

        isSubmitting = true

        Task {
            do {
                let training = try await apiService.submitTraining(
                    ideaId: idea.id,
                    context: context,
                    trainingType: trainingType,
                    correctedCategory: correctedCategory,
                    correctedPriority: correctedPriority,
                    correctedType: correctedType,
                    toneFeedback: toneFeedback,
                    feedback: feedbackText.isEmpty ? nil : feedbackText
                )

                await MainActor.run {
                    onComplete(training)
                    dismiss()
                }
            } catch {
                print("Training submission failed: \(error)")
                isSubmitting = false
            }
        }
    }
}

// MARK: - Section Header
private struct SectionHeader: View {
    let number: Int
    let title: String

    var body: some View {
        HStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(Color.zensationOrange)
                    .frame(width: 24, height: 24)

                Text("\(number)")
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
            }

            Text(title)
                .font(.headline)
        }
    }
}

// MARK: - Idea Picker View
private struct IdeaPickerView: View {
    let ideas: [Idea]
    @Binding var selectedIdea: Idea?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(ideas.prefix(10)) { idea in
                    IdeaPickerCard(
                        idea: idea,
                        isSelected: selectedIdea?.id == idea.id
                    )
                    .onTapGesture {
                        withAnimation(.spring(response: 0.3)) {
                            selectedIdea = idea
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Idea Picker Card
private struct IdeaPickerCard: View {
    let idea: Idea
    let isSelected: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: idea.type.icon)
                    .foregroundColor(isSelected ? .white : .zensationOrange)

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.white)
                }
            }

            Text(idea.title)
                .font(.subheadline)
                .fontWeight(.medium)
                .lineLimit(2)
                .foregroundColor(isSelected ? .white : .primary)

            Text(idea.category.displayName)
                .font(.caption)
                .foregroundColor(isSelected ? .white.opacity(0.8) : .zensationTextMuted)
        }
        .padding()
        .frame(width: 180, height: 120)
        .background(isSelected ? Color.zensationOrange : Color.zensationSurface)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(isSelected ? Color.zensationOrange : Color.zensationBorder, lineWidth: isSelected ? 2 : 1)
        )
    }
}

// MARK: - Training Type Picker
private struct TrainingTypePicker: View {
    @Binding var selected: TrainingType

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(TrainingType.allCases) { type in
                    TrainingTypeChip(
                        type: type,
                        isSelected: selected == type
                    )
                    .onTapGesture {
                        withAnimation(.spring(response: 0.3)) {
                            selected = type
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Training Type Chip
private struct TrainingTypeChip: View {
    let type: TrainingType
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: type.icon)
            Text(type.displayName)
        }
        .font(.subheadline)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(isSelected ? type.color : Color.zensationSurfaceLight)
        .foregroundColor(isSelected ? .white : .primary)
        .cornerRadius(20)
    }
}

// MARK: - Category Correction View
private struct CategoryCorrectionView: View {
    let original: IdeaCategory?
    @Binding var corrected: IdeaCategory?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let original = original {
                HStack {
                    Text("Original:")
                        .font(.caption)
                        .foregroundColor(.zensationTextMuted)
                    Text(original.displayName)
                        .font(.caption)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.zensationSurfaceLight)
                        .cornerRadius(6)
                }
            }

            Text("Richtige Kategorie:")
                .font(.caption)
                .foregroundColor(.zensationTextMuted)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach(IdeaCategory.allCases, id: \.self) { category in
                    CategoryOption(
                        category: category,
                        isSelected: corrected == category,
                        isOriginal: original == category
                    )
                    .onTapGesture {
                        corrected = category
                    }
                }
            }
        }
    }
}

// MARK: - Category Option
private struct CategoryOption: View {
    let category: IdeaCategory
    let isSelected: Bool
    let isOriginal: Bool

    var body: some View {
        HStack {
            Text(category.displayName)
                .font(.subheadline)
            Spacer()
            if isSelected {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(.zensationOrange)
            }
        }
        .padding()
        .background(isSelected ? Color.zensationOrange.opacity(0.15) : Color.zensationSurfaceLight)
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(isSelected ? Color.zensationOrange : Color.clear, lineWidth: 2)
        )
        .opacity(isOriginal ? 0.5 : 1.0)
    }
}

// MARK: - Priority Correction View
private struct PriorityCorrectionView: View {
    let original: Priority?
    @Binding var corrected: Priority?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let original = original {
                HStack {
                    Text("Original:")
                        .font(.caption)
                        .foregroundColor(.zensationTextMuted)
                    Text(original.displayName)
                        .font(.caption)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.zensationSurfaceLight)
                        .cornerRadius(6)
                }
            }

            Text("Richtige Prioritat:")
                .font(.caption)
                .foregroundColor(.zensationTextMuted)

            HStack(spacing: 12) {
                ForEach(Priority.allCases, id: \.self) { priority in
                    PriorityOption(
                        priority: priority,
                        isSelected: corrected == priority,
                        isOriginal: original == priority
                    )
                    .onTapGesture {
                        corrected = priority
                    }
                }
            }
        }
    }
}

// MARK: - Priority Option
private struct PriorityOption: View {
    let priority: Priority
    let isSelected: Bool
    let isOriginal: Bool

    private var color: Color {
        switch priority {
        case .low: return .gray
        case .medium: return .orange
        case .high: return .red
        }
    }

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(isSelected ? color : color.opacity(0.2))
                    .frame(width: 48, height: 48)

                Image(systemName: priority == .high ? "exclamationmark.2" : (priority == .medium ? "exclamationmark" : "minus"))
                    .font(.title3)
                    .foregroundColor(isSelected ? .white : color)
            }

            Text(priority.displayName)
                .font(.caption)
                .foregroundColor(isSelected ? color : .zensationTextMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(isSelected ? color.opacity(0.1) : Color.zensationSurfaceLight)
        .cornerRadius(12)
        .opacity(isOriginal ? 0.5 : 1.0)
    }
}

// MARK: - Type Correction View
private struct TypeCorrectionView: View {
    let original: IdeaType?
    @Binding var corrected: IdeaType?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let original = original {
                HStack {
                    Text("Original:")
                        .font(.caption)
                        .foregroundColor(.zensationTextMuted)

                    HStack(spacing: 4) {
                        Image(systemName: original.icon)
                        Text(original.displayName)
                    }
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.zensationSurfaceLight)
                    .cornerRadius(6)
                }
            }

            Text("Richtiger Typ:")
                .font(.caption)
                .foregroundColor(.zensationTextMuted)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach(IdeaType.allCases, id: \.self) { type in
                    TypeOption(
                        type: type,
                        isSelected: corrected == type,
                        isOriginal: original == type
                    )
                    .onTapGesture {
                        corrected = type
                    }
                }
            }
        }
    }
}

// MARK: - Type Option
private struct TypeOption: View {
    let type: IdeaType
    let isSelected: Bool
    let isOriginal: Bool

    private var color: Color {
        switch type {
        case .idea: return .yellow
        case .task: return .blue
        case .insight: return .purple
        case .problem: return .red
        case .question: return .orange
        }
    }

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: type.icon)
                .foregroundColor(isSelected ? .white : color)

            Text(type.displayName)
                .font(.subheadline)

            Spacer()

            if isSelected {
                Image(systemName: "checkmark")
                    .font(.caption)
            }
        }
        .padding()
        .background(isSelected ? color : Color.zensationSurfaceLight)
        .foregroundColor(isSelected ? .white : .primary)
        .cornerRadius(8)
        .opacity(isOriginal ? 0.5 : 1.0)
    }
}

// MARK: - Tone Correction View
private struct ToneCorrectionView: View {
    @Binding var selected: ToneFeedback?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Wie sollte die AI klingen?")
                .font(.caption)
                .foregroundColor(.zensationTextMuted)

            ForEach(ToneFeedback.allCases, id: \.self) { tone in
                ToneOption(tone: tone, isSelected: selected == tone)
                    .onTapGesture {
                        selected = tone
                    }
            }
        }
    }
}

// MARK: - Tone Option
private struct ToneOption: View {
    let tone: ToneFeedback
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: tone.icon)
                .font(.title2)
                .foregroundColor(isSelected ? .white : tone.color)
                .frame(width: 40)

            VStack(alignment: .leading, spacing: 2) {
                Text(tone.displayName)
                    .font(.subheadline)
                    .fontWeight(.medium)
                Text(tone.description)
                    .font(.caption)
                    .foregroundColor(isSelected ? .white.opacity(0.8) : .zensationTextMuted)
            }

            Spacer()

            if isSelected {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(.white)
            }
        }
        .padding()
        .background(isSelected ? tone.color : Color.zensationSurfaceLight)
        .foregroundColor(isSelected ? .white : .primary)
        .cornerRadius(12)
    }
}

// MARK: - General Feedback View
private struct GeneralFeedbackView: View {
    @Binding var feedback: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Schreibe dein Feedback:")
                .font(.caption)
                .foregroundColor(.zensationTextMuted)

            TextEditor(text: $feedback)
                .frame(minHeight: 120)
                .padding(8)
                .background(Color.zensationSurfaceLight)
                .cornerRadius(8)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.zensationBorder, lineWidth: 1)
                )
        }
    }
}

// Training Models are defined in Models/TrainingModels.swift

#Preview {
    TrainingView()
        .environmentObject(APIService())
        .environmentObject(ContextManager())
}

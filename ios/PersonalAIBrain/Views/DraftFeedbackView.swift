import SwiftUI

// MARK: - Phase 5: Draft Feedback Views

/// Quick thumbs up/down feedback component
struct QuickFeedbackView: View {
    let draftId: String
    let onFeedbackSubmitted: () -> Void

    @State private var isSubmitting = false
    @State private var submitted: Bool? = nil
    @EnvironmentObject var apiService: APIService

    var body: some View {
        if let submitted = submitted {
            HStack {
                Image(systemName: submitted ? "hand.thumbsup.fill" : "hand.thumbsdown.fill")
                    .foregroundColor(submitted ? .green : .orange)
                Text("Feedback gespeichert")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity)
            .background(Color.green.opacity(0.1))
            .cornerRadius(8)
        } else {
            HStack(spacing: 12) {
                Text("War dieser Entwurf hilfreich?")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                Spacer()

                Button(action: { submitQuickFeedback(isPositive: true) }) {
                    Image(systemName: "hand.thumbsup")
                        .font(.title2)
                        .foregroundColor(.green)
                }
                .disabled(isSubmitting)

                Button(action: { submitQuickFeedback(isPositive: false) }) {
                    Image(systemName: "hand.thumbsdown")
                        .font(.title2)
                        .foregroundColor(.orange)
                }
                .disabled(isSubmitting)
            }
            .padding()
            .background(Color.green.opacity(0.08))
            .cornerRadius(8)
        }
    }

    private func submitQuickFeedback(isPositive: Bool) {
        isSubmitting = true
        Task {
            let success = await apiService.submitQuickFeedback(draftId: draftId, isPositive: isPositive)
            await MainActor.run {
                isSubmitting = false
                if success {
                    submitted = isPositive
                    onFeedbackSubmitted()
                }
            }
        }
    }
}

// MARK: - Star Rating

struct StarRatingView: View {
    @Binding var rating: Int
    var maxRating: Int = 5
    var size: CGFloat = 28
    var color: Color = .yellow

    var body: some View {
        HStack(spacing: 4) {
            ForEach(1...maxRating, id: \.self) { star in
                Image(systemName: star <= rating ? "star.fill" : "star")
                    .font(.system(size: size))
                    .foregroundColor(star <= rating ? color : .gray.opacity(0.3))
                    .onTapGesture {
                        withAnimation(.easeInOut(duration: 0.1)) {
                            rating = star
                        }
                    }
            }
        }
    }
}

// MARK: - Content Reuse Slider

struct ContentReuseSlider: View {
    @Binding var value: Double

    private var label: String {
        switch value {
        case 0..<20: return "Fast nichts"
        case 20..<40: return "Wenig"
        case 40..<60: return "Etwa die Hälfte"
        case 60..<80: return "Großteil"
        default: return "Fast alles"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Wie viel hast du übernommen?")
                .font(.subheadline)
                .foregroundColor(.secondary)

            HStack {
                Slider(value: $value, in: 0...100, step: 5)
                    .tint(.green)

                Text("\(Int(value))%")
                    .font(.headline)
                    .foregroundColor(.green)
                    .frame(width: 50)
            }

            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }
}

// MARK: - Edit Categories

struct EditCategoriesView: View {
    @Binding var selectedCategories: Set<DraftEditCategory>

    private let columns = [
        GridItem(.flexible()),
        GridItem(.flexible()),
        GridItem(.flexible())
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Was hast du geändert?")
                .font(.subheadline)
                .foregroundColor(.secondary)

            LazyVGrid(columns: columns, spacing: 8) {
                ForEach(DraftEditCategory.allCases, id: \.self) { category in
                    Button(action: { toggleCategory(category) }) {
                        HStack(spacing: 4) {
                            Image(systemName: category.icon)
                                .font(.caption)
                            Text(category.displayName)
                                .font(.caption)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(selectedCategories.contains(category) ? Color.green.opacity(0.2) : Color.gray.opacity(0.1))
                        .foregroundColor(selectedCategories.contains(category) ? .green : .primary)
                        .cornerRadius(16)
                        .overlay(
                            RoundedRectangle(cornerRadius: 16)
                                .stroke(selectedCategories.contains(category) ? Color.green : Color.clear, lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func toggleCategory(_ category: DraftEditCategory) {
        if selectedCategories.contains(category) {
            selectedCategories.remove(category)
        } else {
            selectedCategories.insert(category)
        }
    }
}

// MARK: - Detailed Feedback Sheet

struct DraftFeedbackSheet: View {
    let draftId: String
    let draftType: DraftType
    let wordCount: Int
    let onFeedbackSubmitted: () -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var apiService: APIService

    @State private var rating: Int = 0
    @State private var feedbackText: String = ""
    @State private var contentReusedPercent: Double = 70
    @State private var selectedCategories: Set<DraftEditCategory> = []
    @State private var wasHelpful: Bool? = nil
    @State private var wouldUseAgain: Bool? = nil
    @State private var isSubmitting = false
    @State private var showError = false
    @State private var errorMessage = ""

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    // Main Rating
                    VStack(spacing: 8) {
                        Text("Gesamtbewertung")
                            .font(.headline)
                        StarRatingView(rating: $rating, size: 36)
                    }
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(Color.gray.opacity(0.05))
                    .cornerRadius(12)

                    // Was it helpful?
                    VStack(alignment: .leading, spacing: 8) {
                        Text("War der Entwurf hilfreich?")
                            .font(.subheadline)
                            .foregroundColor(.secondary)

                        HStack(spacing: 12) {
                            Button(action: { wasHelpful = wasHelpful == true ? nil : true }) {
                                Label("Ja", systemImage: "hand.thumbsup")
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 10)
                                    .background(wasHelpful == true ? Color.green.opacity(0.2) : Color.gray.opacity(0.1))
                                    .foregroundColor(wasHelpful == true ? .green : .primary)
                                    .cornerRadius(8)
                            }
                            .buttonStyle(.plain)

                            Button(action: { wasHelpful = wasHelpful == false ? nil : false }) {
                                Label("Nein", systemImage: "hand.thumbsdown")
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 10)
                                    .background(wasHelpful == false ? Color.orange.opacity(0.2) : Color.gray.opacity(0.1))
                                    .foregroundColor(wasHelpful == false ? .orange : .primary)
                                    .cornerRadius(8)
                            }
                            .buttonStyle(.plain)

                            Spacer()
                        }
                    }

                    Divider()

                    // Content Reuse Slider
                    ContentReuseSlider(value: $contentReusedPercent)

                    // Edit Categories (if not using most of it)
                    if contentReusedPercent < 90 {
                        Divider()
                        EditCategoriesView(selectedCategories: $selectedCategories)
                    }

                    Divider()

                    // Free text feedback
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Zusätzliches Feedback (optional)")
                            .font(.subheadline)
                            .foregroundColor(.secondary)

                        TextField("Was hat gut funktioniert? Was könnte besser sein?", text: $feedbackText, axis: .vertical)
                            .lineLimit(3...6)
                            .textFieldStyle(.roundedBorder)
                    }

                    Divider()

                    // Would use again?
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Würdest du die Funktion wieder nutzen?")
                            .font(.subheadline)
                            .foregroundColor(.secondary)

                        HStack(spacing: 12) {
                            Button(action: { wouldUseAgain = wouldUseAgain == true ? nil : true }) {
                                Label("Ja", systemImage: "checkmark")
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 10)
                                    .background(wouldUseAgain == true ? Color.green.opacity(0.2) : Color.gray.opacity(0.1))
                                    .foregroundColor(wouldUseAgain == true ? .green : .primary)
                                    .cornerRadius(8)
                            }
                            .buttonStyle(.plain)

                            Button(action: { wouldUseAgain = wouldUseAgain == false ? nil : false }) {
                                Label("Nein", systemImage: "xmark")
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 10)
                                    .background(wouldUseAgain == false ? Color.red.opacity(0.2) : Color.gray.opacity(0.1))
                                    .foregroundColor(wouldUseAgain == false ? .red : .primary)
                                    .cornerRadius(8)
                            }
                            .buttonStyle(.plain)

                            Spacer()
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Feedback geben")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Senden") {
                        submitFeedback()
                    }
                    .disabled(rating == 0 || isSubmitting)
                    .fontWeight(.semibold)
                }
            }
            .alert("Fehler", isPresented: $showError) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage)
            }
        }
    }

    private func submitFeedback() {
        isSubmitting = true

        let feedback = DraftFeedbackRequest(
            rating: rating,
            feedbackText: feedbackText.isEmpty ? nil : feedbackText,
            contentReusedPercent: Int(contentReusedPercent),
            editsDescription: nil,
            editCategories: selectedCategories.isEmpty ? nil : selectedCategories.map { $0.rawValue },
            wasHelpful: wasHelpful,
            wouldUseAgain: wouldUseAgain,
            qualityAspects: nil,
            feedbackSource: "manual"
        )

        Task {
            let success = await apiService.submitDetailedFeedback(draftId: draftId, feedback: feedback)
            await MainActor.run {
                isSubmitting = false
                if success {
                    onFeedbackSubmitted()
                    dismiss()
                } else {
                    errorMessage = "Feedback konnte nicht gesendet werden"
                    showError = true
                }
            }
        }
    }
}

// MARK: - Feedback Prompt Sheet (Post-copy)

struct FeedbackPromptSheet: View {
    let draftId: String
    let onFeedbackSubmitted: () -> Void
    let onDismiss: () -> Void

    @EnvironmentObject var apiService: APIService
    @State private var rating: Int = 0
    @State private var isSubmitting = false

    var body: some View {
        VStack(spacing: 20) {
            Text("Wie war der Entwurf?")
                .font(.headline)

            StarRatingView(rating: $rating, size: 40)

            HStack(spacing: 16) {
                Button("Überspringen") {
                    onDismiss()
                }
                .foregroundColor(.secondary)

                Button(action: submitRating) {
                    if isSubmitting {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    } else {
                        Text("Bewerten")
                    }
                }
                .disabled(rating == 0 || isSubmitting)
                .padding(.horizontal, 24)
                .padding(.vertical, 10)
                .background(rating > 0 ? Color.green : Color.gray)
                .foregroundColor(.white)
                .cornerRadius(8)
            }
        }
        .padding(24)
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(radius: 20)
    }

    private func submitRating() {
        isSubmitting = true
        let feedback = DraftFeedbackRequest(
            rating: rating,
            feedbackSource: "prompt"
        )

        Task {
            let success = await apiService.submitDetailedFeedback(draftId: draftId, feedback: feedback)
            await MainActor.run {
                isSubmitting = false
                if success {
                    onFeedbackSubmitted()
                }
                onDismiss()
            }
        }
    }
}

// MARK: - Feedback Button (Collapsed state)

struct FeedbackButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label("Feedback geben", systemImage: "star")
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundColor(.green)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity)
                .background(Color.green.opacity(0.1))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.green, style: StrokeStyle(lineWidth: 1, dash: [5]))
                )
                .cornerRadius(8)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Feedback Submitted Badge

struct FeedbackSubmittedBadge: View {
    var body: some View {
        HStack {
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(.green)
            Text("Feedback gegeben")
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundColor(.green)
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(Color.green.opacity(0.1))
        .cornerRadius(8)
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: 20) {
        QuickFeedbackView(draftId: "test", onFeedbackSubmitted: {})

        FeedbackButton(action: {})

        FeedbackSubmittedBadge()

        StarRatingView(rating: .constant(3))
    }
    .padding()
    .environmentObject(APIService())
}

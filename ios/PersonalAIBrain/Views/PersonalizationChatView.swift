import SwiftUI

/// Phase 21: Personalization Chat - "Lerne mich kennen"
/// Conversational interface for the AI to learn about the user
struct PersonalizationChatView: View {
    @StateObject private var viewModel = PersonalizationChatViewModel()
    @State private var inputText = ""
    @FocusState private var isInputFocused: Bool

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Progress Bar
                if viewModel.progress > 0 {
                    ProgressHeader(progress: viewModel.progress, factsCount: viewModel.factsCount)
                }

                // Chat Messages
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 16) {
                            ForEach(viewModel.messages) { message in
                                ChatBubble(message: message)
                                    .id(message.id)
                            }

                            if viewModel.isLoading {
                                TypingIndicator()
                                    .id("typing")
                            }
                        }
                        .padding()
                    }
                    .onChange(of: viewModel.messages.count) { _, _ in
                        withAnimation {
                            proxy.scrollTo(viewModel.messages.last?.id ?? "typing", anchor: .bottom)
                        }
                    }
                }

                // Input Area
                ChatInputBar(
                    text: $inputText,
                    isLoading: viewModel.isLoading,
                    onSend: sendMessage
                )
                .focused($isInputFocused)
            }
            .navigationTitle("Lerne mich kennen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Menu {
                        Button(action: { viewModel.showProgress = true }) {
                            Label("Fortschritt", systemImage: "chart.bar")
                        }
                        Button(action: { viewModel.showFacts = true }) {
                            Label("Gelerntes", systemImage: "brain")
                        }
                        Button(action: { viewModel.showSummary = true }) {
                            Label("Zusammenfassung", systemImage: "doc.text")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .sheet(isPresented: $viewModel.showProgress) {
                ProgressSheet(viewModel: viewModel)
            }
            .sheet(isPresented: $viewModel.showFacts) {
                FactsSheet(viewModel: viewModel)
            }
            .sheet(isPresented: $viewModel.showSummary) {
                SummarySheet(viewModel: viewModel)
            }
        }
        .onAppear {
            if viewModel.messages.isEmpty {
                viewModel.startConversation()
            }
        }
    }

    private func sendMessage() {
        guard !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        let message = inputText
        inputText = ""
        viewModel.sendMessage(message)
    }
}

// MARK: - Progress Header

struct ProgressHeader: View {
    let progress: Int
    let factsCount: Int

    var body: some View {
        VStack(spacing: 4) {
            HStack {
                Text("Fortschritt: \(progress)%")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Spacer()
                Text("\(factsCount) Fakten gelernt")
                    .font(.caption)
                    .foregroundColor(.purple)
            }
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.gray.opacity(0.2))
                    Capsule()
                        .fill(Color.purple)
                        .frame(width: geometry.size.width * CGFloat(progress) / 100)
                        .animation(.easeOut, value: progress)
                }
            }
            .frame(height: 4)
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(Color(.systemBackground))
    }
}

// MARK: - Chat Bubble

struct ChatBubble: View {
    let message: ChatMessage

    var body: some View {
        HStack {
            if message.isUser {
                Spacer(minLength: 60)
            }

            VStack(alignment: message.isUser ? .trailing : .leading, spacing: 4) {
                Text(message.text)
                    .padding(12)
                    .background(message.isUser ? Color.purple : Color(.secondarySystemBackground))
                    .foregroundColor(message.isUser ? .white : .primary)
                    .cornerRadius(16)

                if !message.newFacts.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "sparkle")
                            .font(.caption2)
                        Text("\(message.newFacts.count) neue Erkenntnisse")
                            .font(.caption2)
                    }
                    .foregroundColor(.purple)
                }
            }

            if !message.isUser {
                Spacer(minLength: 60)
            }
        }
    }
}

// MARK: - Typing Indicator

struct TypingIndicator: View {
    @State private var animating = false

    var body: some View {
        HStack {
            HStack(spacing: 4) {
                ForEach(0..<3) { index in
                    Circle()
                        .fill(Color.purple.opacity(0.6))
                        .frame(width: 8, height: 8)
                        .scaleEffect(animating ? 1.0 : 0.5)
                        .animation(
                            Animation.easeInOut(duration: 0.6)
                                .repeatForever()
                                .delay(Double(index) * 0.2),
                            value: animating
                        )
                }
            }
            .padding(12)
            .background(Color(.secondarySystemBackground))
            .cornerRadius(16)

            Spacer()
        }
        .onAppear { animating = true }
    }
}

// MARK: - Input Bar

struct ChatInputBar: View {
    @Binding var text: String
    let isLoading: Bool
    let onSend: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            TextField("Deine Antwort...", text: $text, axis: .vertical)
                .textFieldStyle(.plain)
                .padding(12)
                .background(Color(.secondarySystemBackground))
                .cornerRadius(20)
                .lineLimit(1...5)

            Button(action: onSend) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 32))
                    .foregroundColor(canSend ? .purple : .gray)
            }
            .disabled(!canSend)
        }
        .padding()
        .background(Color(.systemBackground))
    }

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isLoading
    }
}

// MARK: - Progress Sheet

struct ProgressSheet: View {
    @ObservedObject var viewModel: PersonalizationChatViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            List {
                Section {
                    HStack {
                        Text("Gesamtfortschritt")
                        Spacer()
                        Text("\(viewModel.progress)%")
                            .fontWeight(.bold)
                            .foregroundColor(.purple)
                    }
                }

                Section("Themen") {
                    ForEach(viewModel.topics) { topic in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(topic.label)
                                    .font(.subheadline)
                                Text("\(topic.factsLearned) Fakten")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            CircularProgress(progress: topic.completionLevel)
                        }
                    }
                }
            }
            .navigationTitle("Lernfortschritt")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fertig") { dismiss() }
                }
            }
        }
        .onAppear { viewModel.loadProgress() }
    }
}

struct CircularProgress: View {
    let progress: Double

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.gray.opacity(0.2), lineWidth: 3)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(Color.purple, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("\(Int(progress * 100))%")
                .font(.caption2)
        }
        .frame(width: 40, height: 40)
    }
}

// MARK: - Facts Sheet

struct FactsSheet: View {
    @ObservedObject var viewModel: PersonalizationChatViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            List {
                ForEach(Array(viewModel.factsByCategory.keys.sorted()), id: \.self) { category in
                    Section(categoryLabel(category)) {
                        ForEach(viewModel.factsByCategory[category] ?? [], id: \.key) { fact in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(fact.value)
                                    .font(.subheadline)
                                Text(fact.key)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            .swipeActions {
                                Button(role: .destructive) {
                                    viewModel.deleteFact(fact.id)
                                } label: {
                                    Label("Löschen", systemImage: "trash")
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Was ich gelernt habe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fertig") { dismiss() }
                }
            }
        }
        .onAppear { viewModel.loadFacts() }
    }

    private func categoryLabel(_ category: String) -> String {
        let labels: [String: String] = [
            "basic_info": "Grundlegendes",
            "personality": "Persönlichkeit",
            "work_life": "Arbeit & Beruf",
            "goals_dreams": "Ziele & Träume",
            "interests_hobbies": "Interessen & Hobbys",
            "communication_style": "Kommunikation",
            "decision_making": "Entscheidungen",
            "daily_routines": "Tagesablauf",
            "values_beliefs": "Werte",
            "challenges": "Herausforderungen"
        ]
        return labels[category] ?? category
    }
}

// MARK: - Summary Sheet

struct SummarySheet: View {
    @ObservedObject var viewModel: PersonalizationChatViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    Image(systemName: "person.crop.circle.fill")
                        .font(.system(size: 60))
                        .foregroundColor(.purple)

                    if viewModel.isLoadingSummary {
                        ProgressView()
                    } else {
                        Text(viewModel.summary)
                            .font(.body)
                            .multilineTextAlignment(.center)
                            .padding()
                    }

                    Text("\(viewModel.factsCount) Fakten gelernt")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding()
            }
            .navigationTitle("Über dich")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fertig") { dismiss() }
                }
            }
        }
        .onAppear { viewModel.loadSummary() }
    }
}

// MARK: - View Model

@MainActor
class PersonalizationChatViewModel: ObservableObject {
    @Published var messages: [ChatMessage] = []
    @Published var isLoading = false
    @Published var progress = 0
    @Published var factsCount = 0
    @Published var showProgress = false
    @Published var showFacts = false
    @Published var showSummary = false
    @Published var topics: [TopicProgress] = []
    @Published var factsByCategory: [String: [LearnedFact]] = [:]
    @Published var summary = ""
    @Published var isLoadingSummary = false

    private var sessionId: String?
    private let apiService = APIService.shared

    func startConversation() {
        isLoading = true
        Task {
            do {
                let response = try await apiService.startPersonalizationChat()
                sessionId = response.sessionId
                messages.append(ChatMessage(
                    id: UUID().uuidString,
                    text: response.message,
                    isUser: false,
                    newFacts: []
                ))
                await loadProgress()
            } catch {
                messages.append(ChatMessage(
                    id: UUID().uuidString,
                    text: "Hallo! Ich würde dich gerne besser kennenlernen. Erzähl mir etwas über dich!",
                    isUser: false,
                    newFacts: []
                ))
            }
            isLoading = false
        }
    }

    func sendMessage(_ text: String) {
        // Add user message
        messages.append(ChatMessage(
            id: UUID().uuidString,
            text: text,
            isUser: true,
            newFacts: []
        ))

        isLoading = true
        Task {
            do {
                let response = try await apiService.sendPersonalizationMessage(
                    sessionId: sessionId,
                    message: text
                )
                sessionId = response.sessionId

                messages.append(ChatMessage(
                    id: UUID().uuidString,
                    text: response.response,
                    isUser: false,
                    newFacts: response.newFacts
                ))

                factsCount += response.factsLearned
                await loadProgress()
            } catch {
                messages.append(ChatMessage(
                    id: UUID().uuidString,
                    text: "Entschuldigung, da ist etwas schiefgelaufen. Erzähl mir mehr!",
                    isUser: false,
                    newFacts: []
                ))
            }
            isLoading = false
        }
    }

    func loadProgress() async {
        do {
            let progressData = try await apiService.getPersonalizationProgress()
            progress = progressData.overallProgress
            factsCount = progressData.totalFactsLearned
            topics = progressData.topics
        } catch {
            print("Failed to load progress: \(error)")
        }
    }

    func loadProgress() {
        Task { await loadProgress() }
    }

    func loadFacts() {
        Task {
            do {
                let factsData = try await apiService.getPersonalizationFacts()
                factsByCategory = factsData.factsByCategory
            } catch {
                print("Failed to load facts: \(error)")
            }
        }
    }

    func loadSummary() {
        isLoadingSummary = true
        Task {
            do {
                let summaryData = try await apiService.getPersonalizationSummary()
                summary = summaryData.summary
            } catch {
                summary = "Ich lerne dich gerade kennen!"
            }
            isLoadingSummary = false
        }
    }

    func deleteFact(_ id: String) {
        Task {
            do {
                try await apiService.deletePersonalizationFact(id: id)
                await loadProgress()
                loadFacts()
            } catch {
                print("Failed to delete fact: \(error)")
            }
        }
    }
}

// MARK: - Models

struct ChatMessage: Identifiable {
    let id: String
    let text: String
    let isUser: Bool
    let newFacts: [NewFact]
}

struct NewFact: Codable {
    let category: String
    let key: String
    let value: String
}

struct TopicProgress: Identifiable, Codable {
    var id: String { topic }
    let topic: String
    let label: String
    let questionsAsked: Int
    let completionLevel: Double
    let factsLearned: Int
}

struct LearnedFact: Codable {
    let id: String
    let key: String
    let value: String
    let confidence: Double
}

// MARK: - Preview

struct PersonalizationChatView_Previews: PreviewProvider {
    static var previews: some View {
        PersonalizationChatView()
    }
}

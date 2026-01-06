import SwiftUI

// MARK: - Main Content View with Context Support
struct ContentView: View {
    @EnvironmentObject var apiService: APIService
    @StateObject private var contextManager = ContextManager()

    @State private var selectedTab = 0
    @State private var showContextSuggestion = false
    @State private var suggestedContext: AIContext?

    var body: some View {
        TabView(selection: $selectedTab) {
            // Swipe Review
            SwipeCardsView()
                .tabItem {
                    Label("Review", systemImage: "rectangle.stack.fill")
                }
                .tag(0)

            // Ideas List
            IdeasListView()
                .tabItem {
                    Label("Ideen", systemImage: "lightbulb.fill")
                }
                .tag(1)

            // Record (Context-Aware) - Zentraler Tab
            RecordContextView(context: contextManager.currentContext)
                .tabItem {
                    Label("Aufnehmen", systemImage: "mic.circle.fill")
                }
                .tag(2)

            // Stories - Automatisch gruppierte Inhalte
            StoriesView()
                .tabItem {
                    Label("Stories", systemImage: "book.fill")
                }
                .tag(3)

            // Knowledge Graph - Phase 8
            KnowledgeGraphView()
                .tabItem {
                    Label("Graph", systemImage: "network")
                }
                .tag(4)

            // Profile & Settings
            ProfileView()
                .tabItem {
                    Label("Profil", systemImage: "person.circle.fill")
                }
                .tag(5)
        }
        .tint(contextManager.currentContext.color)
        .toolbarBackground(.visible, for: .tabBar)
        .toolbarBackground(Color.zensationSurface, for: .tabBar)
        .toolbarColorScheme(.dark, for: .tabBar)
        .safeAreaInset(edge: .top) {
            VStack(spacing: 0) {
                // Context Switcher
                ContextSwitcherView(contextManager: contextManager)
                    .background(Color(.systemBackground))

                // Context Suggestion Banner
                if showContextSuggestion, let suggested = suggestedContext {
                    ContextSuggestionBanner(
                        suggestedContext: suggested,
                        onAccept: {
                            contextManager.currentContext = suggested
                            showContextSuggestion = false
                        },
                        onDismiss: {
                            showContextSuggestion = false
                        }
                    )
                    .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
        }
        .onAppear {
            checkForContextSuggestion()
        }
        .environmentObject(contextManager)
    }

    private func checkForContextSuggestion() {
        // Check on app launch if we should suggest a different context
        if let suggested = contextManager.suggestContextSwitch() {
            suggestedContext = suggested
            // Show suggestion after a brief delay
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                withAnimation {
                    showContextSuggestion = true
                }
            }
        }
    }
}

// Note: ContextSwitcherView, ContextButton, ContextIndicator and ContextSuggestionBanner are defined in ContextSwitcherView.swift

// MARK: - Media Types (Shared across views)
enum MediaInputTab {
    case audio, photo, video
}

enum MediaType {
    case photo, video
}

// MARK: - Processing State
enum ProcessingState: Equatable {
    case idle
    case recording
    case transcribing
    case analyzing
    case saving
    case completed(ProcessingResult)
    case error(String)

    var isProcessing: Bool {
        switch self {
        case .transcribing, .analyzing, .saving:
            return true
        default:
            return false
        }
    }
}

struct ProcessingResult: Equatable {
    let title: String
    let type: String
    let summary: String?
    let mode: String // "structured" or "incubated"
    let personaMessage: String?

    var icon: String {
        switch type.lowercased() {
        case "idea": return "lightbulb.fill"
        case "task": return "checkmark.circle.fill"
        case "problem": return "exclamationmark.triangle.fill"
        case "question": return "questionmark.circle.fill"
        case "insight": return "eye.fill"
        default: return "doc.fill"
        }
    }
}

// MARK: - Context-Aware Record View
struct RecordContextView: View {
    let context: AIContext
    @EnvironmentObject var apiService: APIService
    @EnvironmentObject var offlineQueueService: OfflineQueueService
    @StateObject private var audioRecorder = AudioRecorderService()

    @State private var recordedText = ""
    @State private var processingState: ProcessingState = .idle
    @State private var showMediaPicker = false
    @State private var showCamera = false
    @State private var mediaType: MediaType = .photo
    @State private var selectedTab: MediaInputTab = .audio
    @State private var showResultCard = false
    @State private var lastResult: ProcessingResult?
    @State private var showQueueDetails = false

    private var isProcessing: Bool {
        processingState.isProcessing
    }

    var body: some View {
        NavigationStack {
            ZStack {
                // Main content
                VStack(spacing: 24) {
                    // Persona Description
                    VStack(spacing: 8) {
                        Text(context.icon)
                            .font(.system(size: 60))

                        Text(context.displayName)
                            .font(.title2.bold())

                        Text(context.personaDescription)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                    .padding(.top, 32)

                    // Connection & Queue Status
                    statusIndicators

                    // Media Input Tabs
                    Picker("Input-Typ", selection: $selectedTab) {
                        Text("🎤 Audio").tag(MediaInputTab.audio)
                        Text("📸 Foto").tag(MediaInputTab.photo)
                        Text("🎥 Video").tag(MediaInputTab.video)
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal)
                    .disabled(isProcessing)

                    Spacer()

                    // Content based on selected tab or processing state
                    if isProcessing {
                        processingView
                    } else {
                        switch selectedTab {
                        case .audio:
                            audioInputView
                        case .photo:
                            mediaInputView(type: .photo, icon: "camera.fill", title: "Foto aufnehmen")
                        case .video:
                            mediaInputView(type: .video, icon: "video.fill", title: "Video aufnehmen")
                        }
                    }

                    // Quick Text Input
                    if !isProcessing {
                        textInputSection
                    }

                    // Error Message
                    if case .error(let message) = processingState {
                        errorView(message: message)
                    }

                    Spacer()
                }
                .navigationTitle("Aufnehmen")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .principal) {
                        ContextIndicator(context: context)
                    }
                }
                .sheet(isPresented: $showMediaPicker) {
                    MediaPickerView(mediaType: mediaType) { data, filename in
                        handleMediaSelected(data: data, filename: filename)
                    }
                }
                .fullScreenCover(isPresented: $showCamera) {
                    CameraView(mediaType: mediaType) { data, filename in
                        handleMediaSelected(data: data, filename: filename)
                    }
                }
                .sheet(isPresented: $showQueueDetails) {
                    OfflineQueueView()
                }

                // Result overlay
                if showResultCard, let result = lastResult {
                    Color.black.opacity(0.4)
                        .ignoresSafeArea()
                        .onTapGesture {
                            dismissResult()
                        }

                    ResultCardView(
                        icon: result.icon,
                        title: result.title,
                        type: result.type,
                        summary: result.summary,
                        context: context,
                        onDismiss: dismissResult
                    )
                    .transition(.scale.combined(with: .opacity))
                }
            }
            .animation(.spring(response: 0.3), value: showResultCard)
        }
    }

    // MARK: - Status Indicators
    private var statusIndicators: some View {
        VStack(spacing: 8) {
            // Offline Status
            if !offlineQueueService.isOnline {
                HStack(spacing: 8) {
                    Image(systemName: "wifi.slash")
                        .foregroundColor(.orange)
                    Text("Offline - Wird später synchronisiert")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color.orange.opacity(0.1))
                .cornerRadius(8)
            }

            // Queue Status (tappable for details)
            if !offlineQueueService.queuedItems.isEmpty {
                Button(action: {
                    showQueueDetails = true
                }) {
                    HStack(spacing: 8) {
                        if offlineQueueService.isProcessing {
                            ProgressView()
                                .scaleEffect(0.6)
                        } else {
                            Image(systemName: "clock.arrow.circlepath")
                                .foregroundColor(.blue)
                        }
                        Text("\(offlineQueueService.queuedItems.count) Einträge warten auf Sync")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Image(systemName: "chevron.right")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.blue.opacity(0.1))
                    .cornerRadius(8)
                }
            }
        }
    }

    // MARK: - Processing View with Stages
    private var processingView: some View {
        VStack(spacing: 24) {
            // Animated brain icon
            AIBrainView(isActive: true, activityType: .thinking, size: 80)

            // Processing stages
            ProcessingStatusView(
                stages: [
                    ProcessingStage("Audio empfangen", subtitle: "✓"),
                    ProcessingStage("Transkribieren", subtitle: "Whisper AI"),
                    ProcessingStage("KI analysiert", subtitle: context == .work ? "Strukturiere Business-Idee..." : "Sammle Gedanken..."),
                    ProcessingStage("Speichern", subtitle: "In \(context.displayName)-Datenbank"),
                ],
                currentStageIndex: currentStageIndex
            )
            .padding(.horizontal)

            // Cancel button
            Button("Abbrechen") {
                // Note: In real implementation, this would cancel the network request
                processingState = .idle
            }
            .foregroundColor(.secondary)
        }
    }

    private var currentStageIndex: Int {
        switch processingState {
        case .transcribing: return 1
        case .analyzing: return 2
        case .saving: return 3
        case .completed: return 4
        default: return 0
        }
    }

    // MARK: - Audio Input View
    private var audioInputView: some View {
        VStack(spacing: 16) {
            // Audio Level Visualizer
            if audioRecorder.isRecording {
                AudioLevelView(level: audioRecorder.audioLevel)
                    .frame(height: 60)
                    .padding(.horizontal, 40)
            }

            // Recording Time
            if audioRecorder.isRecording {
                Text(audioRecorder.formattedTime)
                    .font(.system(size: 48, weight: .light, design: .monospaced))
                    .foregroundColor(.primary)
            }

            // Record Button
            Button(action: {
                if audioRecorder.isRecording {
                    stopRecording()
                } else {
                    startRecording()
                }
            }) {
                VStack(spacing: 12) {
                    Image(systemName: audioRecorder.isRecording ? "stop.circle.fill" : "mic.circle.fill")
                        .font(.system(size: 80))
                        .foregroundColor(audioRecorder.isRecording ? .red : context.color)

                    Text(audioRecorder.isRecording ? "Tippe zum Stoppen" : "Tippe zum Aufnehmen")
                        .font(.headline)
                }
            }
            .disabled(isProcessing)

            // Cancel Button (when recording)
            if audioRecorder.isRecording {
                Button("Abbrechen") {
                    audioRecorder.cancelRecording()
                }
                .foregroundColor(.secondary)
            }
        }
    }

    // MARK: - Media Input View
    private func mediaInputView(type: MediaType, icon: String, title: String) -> some View {
        VStack(spacing: 20) {
            // Camera Button
            Button(action: {
                mediaType = type
                showCamera = true
            }) {
                VStack(spacing: 12) {
                    Image(systemName: icon)
                        .font(.system(size: 60))
                        .foregroundColor(context.color)

                    Text(title)
                        .font(.headline)
                }
            }
            .disabled(isProcessing)

            // Gallery Button
            Button(action: {
                mediaType = type
                showMediaPicker = true
            }) {
                HStack(spacing: 8) {
                    Image(systemName: "photo.on.rectangle")
                        .font(.system(size: 20))
                    Text("Aus Galerie wählen")
                }
                .foregroundColor(context.color)
            }
            .disabled(isProcessing)
        }
    }

    // MARK: - Text Input Section
    private var textInputSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Oder tippe deinen Gedanken:")
                .font(.caption)
                .foregroundColor(.secondary)

            TextField(context.placeholderText, text: $recordedText, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .lineLimit(3...6)

            Button(action: submitText) {
                HStack {
                    Image(systemName: "paperplane.fill")
                    Text("Senden")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(context.color)
            .disabled(recordedText.isEmpty || isProcessing)
        }
        .padding()
    }

    // MARK: - Error View
    private func errorView(message: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundColor(.red)

            VStack(alignment: .leading, spacing: 4) {
                Text("Fehler aufgetreten")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                Text(message)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            Button("Erneut") {
                processingState = .idle
            }
            .buttonStyle(.bordered)
        }
        .padding()
        .background(Color.red.opacity(0.1))
        .cornerRadius(12)
        .padding(.horizontal)
    }

    // MARK: - Actions

    private func startRecording() {
        processingState = .recording
        Task {
            do {
                try await audioRecorder.startRecording()
            } catch {
                processingState = .error(error.localizedDescription)
            }
        }
    }

    private func stopRecording() {
        guard let audioData = audioRecorder.stopRecording() else {
            processingState = .error("Keine Audiodaten aufgenommen")
            return
        }

        processAudio(audioData)
    }

    private func processAudio(_ data: Data) {
        // Start processing with staged feedback
        processingState = .transcribing

        // Haptic feedback
        let generator = UIImpactFeedbackGenerator(style: .medium)
        generator.impactOccurred()

        if offlineQueueService.isOnline {
            // Simulate stage progression for better UX
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                processingState = .analyzing
            }

            apiService.submitVoiceMemo(audioData: data, context: context) { result in
                processingState = .saving

                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    switch result {
                    case .success(let response):
                        handleSuccessResponse(response)
                    case .failure(let error):
                        print("❌ Error: \(error.localizedDescription) - Queueing for later")
                        offlineQueueService.enqueueAudioInput(data, context: context)
                        showOfflineSuccess()
                    }
                }
            }
        } else {
            offlineQueueService.enqueueAudioInput(data, context: context)
            showOfflineSuccess()
        }
    }

    private func handleMediaSelected(data: Data, filename: String) {
        processingState = .analyzing

        let generator = UIImpactFeedbackGenerator(style: .medium)
        generator.impactOccurred()

        if offlineQueueService.isOnline {
            apiService.submitMedia(data: data, filename: filename, context: context) { result in
                processingState = .saving

                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    switch result {
                    case .success(_):
                        // Media doesn't return structured data yet, show generic success
                        lastResult = ProcessingResult(
                            title: "Media hochgeladen",
                            type: filename.contains(".mp4") || filename.contains(".mov") ? "Video" : "Foto",
                            summary: "Wird im Hintergrund verarbeitet",
                            mode: "media",
                            personaMessage: nil
                        )
                        showResultCard = true
                        processingState = .idle

                        // Success haptic
                        let successGenerator = UINotificationFeedbackGenerator()
                        successGenerator.notificationOccurred(.success)

                    case .failure(let error):
                        print("❌ Error: \(error.localizedDescription) - Queueing for later")
                        offlineQueueService.enqueueMediaInput(data, filename: filename, context: context)
                        showOfflineSuccess()
                    }
                }
            }
        } else {
            offlineQueueService.enqueueMediaInput(data, filename: filename, context: context)
            showOfflineSuccess()
        }
    }

    private func submitText() {
        guard !recordedText.isEmpty else { return }

        let textToSend = recordedText
        recordedText = ""

        processingState = .analyzing

        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()

        if offlineQueueService.isOnline {
            apiService.submitVoiceMemo(text: textToSend, context: context) { result in
                processingState = .saving

                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    switch result {
                    case .success(let response):
                        handleSuccessResponse(response)
                    case .failure(let error):
                        print("❌ Error: \(error.localizedDescription) - Queueing for later")
                        offlineQueueService.enqueueTextInput(textToSend, context: context)
                        showOfflineSuccess()
                    }
                }
            }
        } else {
            offlineQueueService.enqueueTextInput(textToSend, context: context)
            showOfflineSuccess()
        }
    }

    private func handleSuccessResponse(_ response: VoiceMemoContextResponse) {
        // Success haptic
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.success)

        if response.mode == "structured", let idea = response.idea {
            lastResult = ProcessingResult(
                title: idea.title,
                type: idea.type.capitalized,
                summary: idea.summary,
                mode: "structured",
                personaMessage: nil
            )
        } else if let thought = response.thought {
            lastResult = ProcessingResult(
                title: "Gedanke notiert",
                type: "Gedanke",
                summary: String(thought.rawInput.prefix(100)) + (thought.rawInput.count > 100 ? "..." : ""),
                mode: "incubated",
                personaMessage: response.message
            )
        } else {
            lastResult = ProcessingResult(
                title: "Erfolgreich gespeichert",
                type: context == .work ? "Business" : "Persönlich",
                summary: nil,
                mode: response.mode,
                personaMessage: response.message
            )
        }

        processingState = .idle
        showResultCard = true
    }

    private func showOfflineSuccess() {
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.success)

        lastResult = ProcessingResult(
            title: "Offline gespeichert",
            type: "Warteschlange",
            summary: "Wird automatisch synchronisiert, sobald du wieder online bist",
            mode: "queued",
            personaMessage: nil
        )
        processingState = .idle
        showResultCard = true
    }

    private func dismissResult() {
        showResultCard = false
        lastResult = nil
    }
}

#Preview {
    let apiService = APIService()
    return ContentView()
        .environmentObject(apiService)
        .environmentObject(OfflineQueueService(apiService: apiService))
}

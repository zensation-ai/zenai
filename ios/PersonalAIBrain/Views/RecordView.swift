import SwiftUI

struct RecordView: View {
    @EnvironmentObject var apiService: APIService
    @ObservedObject var contextManager = ContextManager.shared
    @StateObject private var audioRecorder = AudioRecorderService()

    @State private var isProcessing = false
    @State private var processedIdea: VoiceMemoResponse?
    @State private var errorMessage: String?
    @State private var showResult = false
    @State private var processingPhase = 0
    @State private var processingTimer: Timer?

    // Verarbeitungsphasen mit Icons
    private let processingSteps: [(icon: String, text: String)] = [
        ("waveform", "Audio wird übertragen..."),
        ("text.bubble", "Transkription läuft..."),
        ("brain.head.profile", "KI analysiert..."),
        ("lightbulb.fill", "Idee wird strukturiert..."),
        ("checkmark.circle", "Fast fertig...")
    ]

    var body: some View {
        NavigationStack {
            ZStack {
                Color.zensationBackground.ignoresSafeArea()

                VStack(spacing: 32) {
                Spacer()

                // Status Text
                VStack(spacing: 12) {
                    if audioRecorder.isRecording {
                        RecordingIndicator(time: audioRecorder.formattedTime)
                    } else if isProcessing {
                        ProcessingIndicator(
                            step: processingSteps[processingPhase % processingSteps.count]
                        )
                    } else {
                        IdleIndicator()
                    }
                }

                // Audio Level Visualizer
                if audioRecorder.isRecording {
                    AudioLevelView(level: audioRecorder.audioLevel)
                        .frame(height: 60)
                        .padding(.horizontal, 40)
                }

                // Record Button
                RecordButton(
                    isRecording: audioRecorder.isRecording,
                    isProcessing: isProcessing
                ) {
                    if audioRecorder.isRecording {
                        stopRecording()
                    } else {
                        startRecording()
                    }
                }
                .disabled(isProcessing)

                // Cancel Button (when recording)
                if audioRecorder.isRecording {
                    Button("Abbrechen") {
                        audioRecorder.cancelRecording()
                    }
                    .foregroundColor(.zensationTextMuted)
                }

                // Error Message
                if let error = errorMessage {
                    Text(error)
                        .font(.callout)
                        .foregroundColor(.zensationDanger)
                        .multilineTextAlignment(.center)
                        .padding()
                }

                Spacer()

                // Tips
                if !audioRecorder.isRecording && !isProcessing {
                    VStack(spacing: 8) {
                        Text("Tipps für gute Aufnahmen:")
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundColor(.zensationText)

                        VStack(alignment: .leading, spacing: 4) {
                            TipRow(icon: "speaker.wave.2", text: "Sprich deutlich und nicht zu schnell")
                            TipRow(icon: "bubble.left", text: "Beschreibe deine Idee in 1-2 Sätzen")
                            TipRow(icon: "lightbulb", text: "Nenne Kontext und nächste Schritte")
                        }
                        .font(.caption)
                        .foregroundColor(.zensationTextMuted)
                    }
                    .padding()
                    .background(Color.zensationSurface)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal)
                }
                }
            }
            .padding()
            .navigationTitle("Aufnehmen")
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarBackground(Color.zensationSurface, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    ContextIndicator(context: contextManager.currentContext)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    PersonaMenu(contextManager: contextManager)
                }
            }
            .sheet(isPresented: $showResult) {
                if let result = processedIdea {
                    ProcessedIdeaView(response: result) {
                        showResult = false
                        processedIdea = nil
                    }
                }
            }
            .onDisappear {
                // Clean up timer to prevent memory leak
                stopProcessingAnimation()
                // Stop recording if active
                if audioRecorder.isRecording {
                    audioRecorder.cancelRecording()
                }
            }
        }
    }

    private func startRecording() {
        errorMessage = nil
        Task {
            do {
                try await audioRecorder.startRecording()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func stopRecording() {
        guard let audioData = audioRecorder.stopRecording() else {
            errorMessage = "Keine Audiodaten aufgenommen"
            return
        }

        processAudio(audioData)
    }

    private func processAudio(_ data: Data) {
        isProcessing = true
        errorMessage = nil
        processingPhase = 0

        let context = contextManager.currentContext
        let persona = contextManager.currentPersonaId

        print("🎤 Processing audio data: \(data.count) bytes")
        print("📋 Context: \(context.rawValue), Persona: \(persona)")

        // Timer für Phasenwechsel starten
        startProcessingAnimation()

        print("📤 Sending audio to backend with persona...")
        apiService.submitVoiceMemo(audioData: data, context: context, persona: persona) { result in
            stopProcessingAnimation()

            switch result {
            case .success(let response):
                print("✅ Audio processed successfully")

                // Convert context response to VoiceMemoResponse for display
                if let idea = response.idea {
                    processedIdea = VoiceMemoResponse(
                        success: response.success,
                        ideaId: idea.id,
                        transcript: nil,
                        structured: StructuredIdea(
                            title: idea.title,
                            type: idea.type,
                            category: idea.category,
                            priority: idea.priority,
                            summary: idea.summary,
                            nextSteps: nil,
                            contextNeeded: nil,
                            keywords: nil
                        )
                    )
                    showResult = true
                } else if response.thought != nil {
                    // For incubated thoughts, show a simple message
                    processedIdea = VoiceMemoResponse(
                        success: response.success,
                        ideaId: response.thought?.id ?? "unknown",
                        transcript: nil,
                        structured: StructuredIdea(
                            title: "Gedanke notiert",
                            type: "thought",
                            category: "personal",
                            priority: "medium",
                            summary: response.message ?? "Dein Gedanke wird inkubiert...",
                            nextSteps: nil,
                            contextNeeded: nil,
                            keywords: nil
                        )
                    )
                    showResult = true
                }

                // Haptisches Feedback bei Erfolg
                let generator = UINotificationFeedbackGenerator()
                generator.notificationOccurred(.success)

            case .failure(let error):
                print("❌ Error processing audio: \(error)")
                errorMessage = "Fehler beim Verarbeiten: \(error.localizedDescription)\n\nStelle sicher, dass Backend läuft und erreichbar ist."

                // Haptisches Feedback bei Fehler
                let generator = UINotificationFeedbackGenerator()
                generator.notificationOccurred(.error)
            }

            isProcessing = false
        }
    }

    private func startProcessingAnimation() {
        processingTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { _ in
            withAnimation(.easeInOut(duration: 0.3)) {
                processingPhase += 1
            }
        }
    }

    private func stopProcessingAnimation() {
        processingTimer?.invalidate()
        processingTimer = nil
    }
}

// MARK: - Idle Indicator

struct IdleIndicator: View {
    @State private var isPulsing = false

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "mic.fill")
                .font(.system(size: 32))
                .foregroundColor(.zensationTextMuted)
                .scaleEffect(isPulsing ? 1.1 : 1.0)
                .animation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true), value: isPulsing)

            Text("Tippe zum Aufnehmen")
                .font(.headline)
                .foregroundColor(.zensationTextMuted)
        }
        .onAppear { isPulsing = true }
    }
}

// MARK: - Recording Indicator

struct RecordingIndicator: View {
    let time: String
    @State private var isPulsing = false

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                Circle()
                    .fill(Color.red)
                    .frame(width: 12, height: 12)
                    .scaleEffect(isPulsing ? 1.3 : 1.0)
                    .opacity(isPulsing ? 0.7 : 1.0)
                    .animation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true), value: isPulsing)

                Text("Aufnahme läuft")
                    .font(.headline)
                    .foregroundColor(.red)
            }

            Text(time)
                .font(.system(size: 48, weight: .light, design: .monospaced))
                .foregroundColor(.zensationText)
        }
        .onAppear { isPulsing = true }
    }
}

// MARK: - Processing Indicator

struct ProcessingIndicator: View {
    let step: (icon: String, text: String)

    var body: some View {
        VStack(spacing: 16) {
            // AI Brain als zentrales Element
            AIBrainView(isActive: true, activityType: .transcribing, size: 80)

            Text(step.text)
                .font(.headline)
                .foregroundColor(.zensationText)
                .transition(.opacity)
                .id(step.text)
                .animation(.easeInOut, value: step.text)

            // Fortschritts-Dots
            HStack(spacing: 6) {
                ForEach(0..<5, id: \.self) { index in
                    Circle()
                        .fill(Color.zensationOrange)
                        .frame(width: 8, height: 8)
                        .opacity(stepOpacity(for: index))
                }
            }
        }
    }

    private func stepOpacity(for index: Int) -> Double {
        // Aktueller Schritt voll sichtbar, vorherige auch, nachfolgende gedimmt
        let currentStep = (step.text.hashValue % 5 + 5) % 5
        if index <= currentStep {
            return 1.0
        }
        return 0.3
    }
}

// MARK: - Record Button

struct RecordButton: View {
    let isRecording: Bool
    let isProcessing: Bool
    let action: () -> Void

    @State private var pulseScale: CGFloat = 1.0
    @State private var glowOpacity: Double = 0.0

    var body: some View {
        Button(action: {
            // Haptisches Feedback beim Tippen
            let generator = UIImpactFeedbackGenerator(style: .medium)
            generator.impactOccurred()
            action()
        }) {
            ZStack {
                // Glow-Effekt beim Recording
                if isRecording {
                    Circle()
                        .fill(Color.red.opacity(glowOpacity))
                        .frame(width: 140, height: 140)
                        .blur(radius: 20)
                }

                // Pulsierender äußerer Ring
                Circle()
                    .stroke(buttonColor.opacity(0.3), lineWidth: 2)
                    .frame(width: 120, height: 120)
                    .scaleEffect(pulseScale)

                // Outer ring
                Circle()
                    .stroke(buttonColor, lineWidth: 4)
                    .frame(width: 100, height: 100)

                // Inner circle mit Gradient
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [buttonColor, buttonColor.opacity(0.8)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: innerSize, height: innerSize)
                    .shadow(color: buttonColor.opacity(0.4), radius: isRecording ? 10 : 5)

                // Stop-Icon beim Recording
                if isRecording {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.white)
                        .frame(width: 24, height: 24)
                }

                // Mic-Icon im Idle-Zustand
                if !isRecording && !isProcessing {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 32))
                        .foregroundColor(.white)
                }
            }
            .animation(.easeInOut(duration: 0.2), value: isRecording)
            .animation(.easeInOut(duration: 0.2), value: isProcessing)
        }
        .buttonStyle(.plain)
        .disabled(isProcessing)
        .opacity(isProcessing ? 0.5 : 1.0)
        .onChange(of: isRecording) { _, newValue in
            if newValue {
                startPulseAnimation()
            } else {
                stopPulseAnimation()
            }
        }
    }

    private var buttonColor: Color {
        isRecording ? .red : .zensationOrange
    }

    private var innerSize: CGFloat {
        isRecording ? 40 : 80
    }

    private func startPulseAnimation() {
        withAnimation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true)) {
            pulseScale = 1.15
            glowOpacity = 0.4
        }
    }

    private func stopPulseAnimation() {
        withAnimation(.easeOut(duration: 0.3)) {
            pulseScale = 1.0
            glowOpacity = 0.0
        }
    }
}

// MARK: - Audio Level View

struct AudioLevelView: View {
    let level: Float

    var body: some View {
        GeometryReader { geometry in
            HStack(spacing: 3) {
                ForEach(0..<20, id: \.self) { index in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(barColor(for: index))
                        .frame(width: (geometry.size.width - 57) / 20)
                        .scaleY(barHeight(for: index))
                        .animation(.easeOut(duration: 0.1), value: level)
                }
            }
        }
    }

    private func barHeight(for index: Int) -> CGFloat {
        let threshold = Float(index) / 20.0
        if level > threshold {
            return 0.3 + CGFloat(level - threshold) * 2
        }
        return 0.3
    }

    private func barColor(for index: Int) -> Color {
        let threshold = Float(index) / 20.0
        if level > threshold {
            if index < 12 {
                return .green
            } else if index < 16 {
                return .yellow
            } else {
                return .red
            }
        }
        return Color(.systemGray4)
    }
}

extension View {
    func scaleY(_ scale: CGFloat) -> some View {
        self.scaleEffect(CGSize(width: 1, height: scale), anchor: .bottom)
    }
}

// MARK: - Tip Row

struct TipRow: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .frame(width: 20)
            Text(text)
        }
    }
}

// MARK: - Processed Idea View

struct ProcessedIdeaView: View {
    let response: VoiceMemoResponse
    let onDismiss: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Success Header
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.title)
                            .foregroundColor(.green)
                        Text("Idee gespeichert!")
                            .font(.title2)
                            .fontWeight(.bold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding()

                    // Structured Result
                    VStack(alignment: .leading, spacing: 12) {
                        Text(response.structured.title)
                            .font(.headline)

                        HStack {
                            Label(response.structured.type.capitalized, systemImage: "tag")
                            Spacer()
                            Label(response.structured.category.capitalized, systemImage: "folder")
                            Spacer()
                            Label(response.structured.priority.capitalized, systemImage: "flag")
                        }
                        .font(.caption)
                        .foregroundColor(.zensationTextMuted)

                        if let summary = response.structured.summary {
                            Text(summary)
                                .font(.body)
                        }

                        if let nextSteps = response.structured.nextSteps, !nextSteps.isEmpty {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Nächste Schritte:")
                                    .font(.caption)
                                    .fontWeight(.semibold)

                                ForEach(nextSteps, id: \.self) { step in
                                    HStack(alignment: .top) {
                                        Text("•")
                                        Text(step)
                                    }
                                    .font(.caption)
                                }
                            }
                            .foregroundColor(.zensationTextMuted)
                        }
                    }
                    .padding()
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                    // Transcript
                    if let transcript = response.transcript {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Transkript")
                                .font(.caption)
                                .fontWeight(.semibold)

                            Text(transcript)
                                .font(.callout)
                                .foregroundColor(.zensationTextMuted)
                                .italic()
                        }
                        .padding()
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
                .padding()
            }
            .navigationTitle("Ergebnis")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fertig") {
                        onDismiss()
                    }
                }
            }
        }
    }
}

#Preview {
    RecordView()
        .environmentObject(APIService())
}

import SwiftUI

struct RecordView: View {
    @EnvironmentObject var apiService: APIService
    @StateObject private var audioRecorder = AudioRecorderService()

    @State private var isProcessing = false
    @State private var processedIdea: VoiceMemoResponse?
    @State private var errorMessage: String?
    @State private var showResult = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 32) {
                Spacer()

                // Status Text
                VStack(spacing: 8) {
                    if audioRecorder.isRecording {
                        Text("Aufnahme läuft...")
                            .font(.headline)
                            .foregroundColor(.red)

                        Text(audioRecorder.formattedTime)
                            .font(.system(size: 48, weight: .light, design: .monospaced))
                    } else if isProcessing {
                        Text("Verarbeite...")
                            .font(.headline)
                            .foregroundColor(.blue)
                    } else {
                        Text("Tippe zum Aufnehmen")
                            .font(.headline)
                            .foregroundColor(.secondary)
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
                    .foregroundColor(.secondary)
                }

                // Error Message
                if let error = errorMessage {
                    Text(error)
                        .font(.callout)
                        .foregroundColor(.red)
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

                        VStack(alignment: .leading, spacing: 4) {
                            TipRow(icon: "speaker.wave.2", text: "Sprich deutlich und nicht zu schnell")
                            TipRow(icon: "bubble.left", text: "Beschreibe deine Idee in 1-2 Sätzen")
                            TipRow(icon: "lightbulb", text: "Nenne Kontext und nächste Schritte")
                        }
                        .font(.caption)
                        .foregroundColor(.secondary)
                    }
                    .padding()
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal)
                }
            }
            .padding()
            .navigationTitle("Aufnehmen")
            .sheet(isPresented: $showResult) {
                if let result = processedIdea {
                    ProcessedIdeaView(response: result) {
                        showResult = false
                        processedIdea = nil
                    }
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

        Task {
            do {
                let response = try await apiService.processVoiceMemo(
                    audioData: data,
                    filename: "recording.wav"
                )
                processedIdea = response
                showResult = true
            } catch {
                errorMessage = error.localizedDescription
            }

            isProcessing = false
        }
    }
}

// MARK: - Record Button

struct RecordButton: View {
    let isRecording: Bool
    let isProcessing: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                // Outer ring
                Circle()
                    .stroke(isRecording ? Color.red : Color.blue, lineWidth: 4)
                    .frame(width: 100, height: 100)

                // Inner circle
                Circle()
                    .fill(isRecording ? Color.red : Color.blue)
                    .frame(width: isRecording ? 40 : 80, height: isRecording ? 40 : 80)
                    .animation(.easeInOut(duration: 0.2), value: isRecording)

                // Processing indicator
                if isProcessing {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                }
            }
        }
        .buttonStyle(.plain)
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
                        .foregroundColor(.secondary)

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
                            .foregroundColor(.secondary)
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
                                .foregroundColor(.secondary)
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

import SwiftUI
import AVFoundation

struct CameraView: View {
    let mediaType: MediaType
    let onMediaCaptured: (Data, String) -> Void
    var onMediaWithVoice: ((Data, String, Data?) -> Void)? = nil  // Optional: Media + Voice Memo

    @Environment(\.dismiss) var dismiss
    @StateObject private var camera = CameraService()
    @StateObject private var audioRecorder = AudioRecorderService()
    @State private var isRecording = false
    @State private var showPermissionAlert = false
    @State private var isRecordingVoice = false
    @State private var showVoiceOption = false
    @State private var capturedMediaData: Data?
    @State private var capturedFilename: String?
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            // Camera Preview
            CameraPreviewView(session: camera.session)
                .ignoresSafeArea()

            // Controls Overlay
            VStack {
                // Top Bar
                HStack {
                    Button(action: { dismiss() }) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 32))
                            .foregroundColor(.white)
                            .shadow(radius: 4)
                    }

                    Spacer()

                    // Voice recording indicator
                    if isRecordingVoice {
                        HStack(spacing: 8) {
                            Circle()
                                .fill(Color.red)
                                .frame(width: 12, height: 12)
                            Text(audioRecorder.formattedTime)
                                .font(.system(size: 14, weight: .medium, design: .monospaced))
                                .foregroundColor(.white)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.black.opacity(0.6))
                        .cornerRadius(16)
                    }

                    Spacer()

                    if mediaType == .photo {
                        Button(action: { camera.flipCamera() }) {
                            Image(systemName: "camera.rotate.fill")
                                .font(.system(size: 28))
                                .foregroundColor(.white)
                                .shadow(radius: 4)
                        }
                    }
                }
                .padding()

                Spacer()

                // Capture Button
                VStack(spacing: 16) {
                    if mediaType == .video && isRecording {
                        Text(camera.recordingTime)
                            .font(.system(size: 24, weight: .bold, design: .monospaced))
                            .foregroundColor(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(Color.red)
                            .cornerRadius(8)
                    }

                    HStack(spacing: 32) {
                        // Voice Memo Button (for photos)
                        if mediaType == .photo && onMediaWithVoice != nil {
                            Button(action: toggleVoiceRecording) {
                                VStack(spacing: 4) {
                                    Image(systemName: isRecordingVoice ? "mic.fill" : "mic")
                                        .font(.system(size: 24))
                                        .foregroundColor(isRecordingVoice ? .red : .white)
                                        .frame(width: 48, height: 48)
                                        .background(isRecordingVoice ? Color.white : Color.white.opacity(0.2))
                                        .clipShape(Circle())

                                    Text(isRecordingVoice ? "Stopp" : "Sprache")
                                        .font(.caption2)
                                        .foregroundColor(.white)
                                }
                            }
                        }

                        // Main Capture Button
                        Button(action: captureAction) {
                            ZStack {
                                Circle()
                                    .stroke(Color.white, lineWidth: 4)
                                    .frame(width: 80, height: 80)

                                Circle()
                                    .fill(isRecording ? Color.red : Color.white)
                                    .frame(width: isRecording ? 30 : 64, height: isRecording ? 30 : 64)
                                    .animation(.easeInOut(duration: 0.2), value: isRecording)
                            }
                        }
                        .disabled(camera.isCapturing)

                        // Placeholder for symmetry
                        if mediaType == .photo && onMediaWithVoice != nil {
                            Color.clear
                                .frame(width: 48, height: 48)
                        }
                    }

                    Text(captureButtonText)
                        .foregroundColor(.white)
                        .font(.caption)

                    // Voice memo hint
                    if mediaType == .photo && onMediaWithVoice != nil && !isRecordingVoice {
                        Text("Tippe auf Mic um Kontext zu sprechen")
                            .font(.caption2)
                            .foregroundColor(.white.opacity(0.7))
                    }
                }
                .padding(.bottom, 40)
            }

            // Voice confirmation overlay
            if showVoiceOption {
                VoiceConfirmationOverlay(
                    mediaData: capturedMediaData,
                    filename: capturedFilename,
                    voiceData: audioRecorder.stopRecording(),
                    onConfirm: { mediaData, filename, voiceData in
                        if let onMediaWithVoice = onMediaWithVoice {
                            onMediaWithVoice(mediaData, filename, voiceData)
                        } else {
                            onMediaCaptured(mediaData, filename)
                        }
                        dismiss()
                    },
                    onCancel: {
                        showVoiceOption = false
                        capturedMediaData = nil
                        capturedFilename = nil
                    }
                )
            }
        }
        .onAppear {
            Task {
                await camera.checkPermissions()
                if camera.hasPermission {
                    await camera.start(for: mediaType)
                } else {
                    showPermissionAlert = true
                }
            }
        }
        .onDisappear {
            Task {
                await camera.stop()
            }
        }
        .alert("Kamera-Zugriff benötigt", isPresented: $showPermissionAlert) {
            Button("Einstellungen", action: openSettings)
            Button("Abbrechen", role: .cancel) {
                dismiss()
            }
        } message: {
            Text("Bitte erlaube den Kamera-Zugriff in den Einstellungen.")
        }
        .alert("Fehler", isPresented: .constant(errorMessage != nil)) {
            Button("OK") {
                errorMessage = nil
            }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private var captureButtonText: String {
        if mediaType == .photo {
            return isRecordingVoice ? "Foto + Sprache aufnehmen" : "Foto aufnehmen"
        } else {
            return isRecording ? "Stoppen" : "Video starten"
        }
    }

    private func toggleVoiceRecording() {
        if isRecordingVoice {
            // Stop voice recording
            isRecordingVoice = false
        } else {
            // Start voice recording
            Task {
                do {
                    try await audioRecorder.startRecording()
                    isRecordingVoice = true
                } catch {
                    errorMessage = "Sprachaufnahme konnte nicht gestartet werden: \(error.localizedDescription)"
                }
            }
        }
    }

    private func captureAction() {
        if mediaType == .photo {
            Task {
                if let data = await camera.capturePhoto() {
                    let filename = "photo_\(Date().timeIntervalSince1970).jpg"

                    // If voice recording is active, show confirmation
                    if isRecordingVoice && onMediaWithVoice != nil {
                        capturedMediaData = data
                        capturedFilename = filename
                        isRecordingVoice = false
                        showVoiceOption = true
                    } else {
                        onMediaCaptured(data, filename)
                        dismiss()
                    }
                }
            }
        } else {
            if isRecording {
                Task {
                    if let data = await camera.stopRecording() {
                        let filename = "video_\(Date().timeIntervalSince1970).mov"
                        onMediaCaptured(data, filename)
                        dismiss()
                    }
                    isRecording = false
                }
            } else {
                Task {
                    await camera.startRecording()
                    isRecording = true
                }
            }
        }
    }

    private func openSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }
}

// MARK: - Voice Confirmation Overlay
struct VoiceConfirmationOverlay: View {
    let mediaData: Data?
    let filename: String?
    let voiceData: Data?
    let onConfirm: (Data, String, Data?) -> Void
    let onCancel: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.8)
                .ignoresSafeArea()

            VStack(spacing: 24) {
                // Preview
                if let data = mediaData, let uiImage = UIImage(data: data) {
                    Image(uiImage: uiImage)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(maxHeight: 300)
                        .cornerRadius(12)
                }

                // Voice indicator
                if voiceData != nil {
                    HStack(spacing: 8) {
                        Image(systemName: "waveform")
                            .foregroundColor(.green)
                        Text("Sprachnotiz aufgenommen")
                            .font(.subheadline)
                            .foregroundColor(.white)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Color.green.opacity(0.2))
                    .cornerRadius(20)
                }

                // Buttons
                HStack(spacing: 20) {
                    Button(action: onCancel) {
                        HStack {
                            Image(systemName: "xmark")
                            Text("Verwerfen")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(.red)

                    Button(action: {
                        guard let data = mediaData, let name = filename else { return }
                        onConfirm(data, name, voiceData)
                    }) {
                        HStack {
                            Image(systemName: "checkmark")
                            Text("Senden")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                }
                .padding(.horizontal)
            }
            .padding()
        }
    }
}

// MARK: - Camera Preview
struct CameraPreviewView: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        let previewLayer = AVCaptureVideoPreviewLayer(session: session)
        previewLayer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(previewLayer)

        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        if let layer = uiView.layer.sublayers?.first as? AVCaptureVideoPreviewLayer {
            DispatchQueue.main.async {
                layer.frame = uiView.bounds
            }
        }
    }
}

// MARK: - Camera Service
@MainActor
class CameraService: NSObject, ObservableObject {
    @Published var hasPermission = false
    @Published var isCapturing = false
    @Published var recordingTime = "00:00"

    let session = AVCaptureSession()
    private var photoOutput = AVCapturePhotoOutput()
    private var videoOutput = AVCaptureMovieFileOutput()
    private var currentInput: AVCaptureDeviceInput?
    private var capturedPhotoData: Data?
    private var videoURL: URL?
    private var recordingTimer: Timer?
    private var recordingStartTime: Date?

    func checkPermissions() async {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            hasPermission = true
        case .notDetermined:
            hasPermission = await AVCaptureDevice.requestAccess(for: .video)
        default:
            hasPermission = false
        }
    }

    func start(for mediaType: MediaType) async {
        guard hasPermission else { return }

        session.beginConfiguration()

        // Set session preset
        if mediaType == .photo {
            session.sessionPreset = .photo
        } else {
            session.sessionPreset = .high
        }

        // Add camera input
        if let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
           let input = try? AVCaptureDeviceInput(device: device) {
            if session.canAddInput(input) {
                session.addInput(input)
                currentInput = input
            }
        }

        // Add output
        if mediaType == .photo {
            if session.canAddOutput(photoOutput) {
                session.addOutput(photoOutput)
            }
        } else {
            if session.canAddOutput(videoOutput) {
                session.addOutput(videoOutput)
            }
        }

        session.commitConfiguration()

        session.startRunning()
    }

    func stop() async {
        session.stopRunning()
    }

    func flipCamera() {
        guard let currentInput = currentInput else { return }

        session.beginConfiguration()
        session.removeInput(currentInput)

        let newPosition: AVCaptureDevice.Position = currentInput.device.position == .back ? .front : .back

        if let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: newPosition),
           let input = try? AVCaptureDeviceInput(device: device) {
            if session.canAddInput(input) {
                session.addInput(input)
                self.currentInput = input
            }
        }

        session.commitConfiguration()
    }

    func capturePhoto() async -> Data? {
        isCapturing = true
        defer { isCapturing = false }

        let settings = AVCapturePhotoSettings()
        photoOutput.capturePhoto(with: settings, delegate: self)

        // Wait for capture to complete
        for _ in 0..<50 {
            if let data = capturedPhotoData {
                capturedPhotoData = nil
                return data
            }
            try? await Task.sleep(nanoseconds: 100_000_000) // 100ms
        }

        return nil
    }

    func startRecording() async {
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("video_\(Date().timeIntervalSince1970).mov")
        videoURL = tempURL
        videoOutput.startRecording(to: tempURL, recordingDelegate: self)

        recordingStartTime = Date()
        startRecordingTimer()
    }

    func stopRecording() async -> Data? {
        videoOutput.stopRecording()
        stopRecordingTimer()

        // Wait for recording to finish
        for _ in 0..<50 {
            if let url = videoURL, FileManager.default.fileExists(atPath: url.path) {
                if let data = try? Data(contentsOf: url) {
                    try? FileManager.default.removeItem(at: url)
                    videoURL = nil
                    return data
                }
            }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }

        return nil
    }

    private func startRecordingTimer() {
        recordingTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.updateRecordingTime()
            }
        }
    }

    private func stopRecordingTimer() {
        recordingTimer?.invalidate()
        recordingTimer = nil
        recordingTime = "00:00"
    }

    private func updateRecordingTime() {
        guard let startTime = recordingStartTime else { return }
        let elapsed = Date().timeIntervalSince(startTime)
        let minutes = Int(elapsed) / 60
        let seconds = Int(elapsed) % 60
        recordingTime = String(format: "%02d:%02d", minutes, seconds)
    }
}

// MARK: - Photo Capture Delegate
extension CameraService: AVCapturePhotoCaptureDelegate {
    nonisolated func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        if let data = photo.fileDataRepresentation() {
            Task { @MainActor in
                self.capturedPhotoData = data
            }
        }
    }
}

// MARK: - Video Capture Delegate
extension CameraService: AVCaptureFileOutputRecordingDelegate {
    nonisolated func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        if let error = error {
            print("❌ Video recording error: \(error)")
        }
    }
}

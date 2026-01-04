import AVFoundation
import Foundation

@MainActor
class AudioRecorderService: NSObject, ObservableObject {
    @Published var isRecording = false
    @Published var recordingTime: TimeInterval = 0
    @Published var audioLevel: Float = 0

    private var audioRecorder: AVAudioRecorder?
    private var recordingURL: URL?
    private var timer: Timer?
    private var levelTimer: Timer?

    override init() {
        super.init()
    }

    // MARK: - Recording

    func startRecording() async throws {
        // Request microphone permission
        let permission = await AVAudioApplication.requestRecordPermission()
        guard permission else {
            throw AudioError.permissionDenied
        }

        // Configure audio session
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
        try session.setActive(true)

        // Create recording URL
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let filename = "recording_\(Date().timeIntervalSince1970).wav"
        recordingURL = documentsPath.appendingPathComponent(filename)

        guard let url = recordingURL else {
            throw AudioError.fileError
        }

        // Recording settings for WAV format
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatLinearPCM),
            AVSampleRateKey: 16000.0,  // 16kHz for Whisper
            AVNumberOfChannelsKey: 1,   // Mono
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsBigEndianKey: false,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]

        // Create and start recorder
        audioRecorder = try AVAudioRecorder(url: url, settings: settings)
        audioRecorder?.isMeteringEnabled = true
        audioRecorder?.record()

        isRecording = true
        recordingTime = 0

        // Start timers
        startTimers()
    }

    func stopRecording() -> Data? {
        guard isRecording, let recorder = audioRecorder else { return nil }

        recorder.stop()
        isRecording = false
        stopTimers()

        // Deactivate audio session
        try? AVAudioSession.sharedInstance().setActive(false)

        // Read recorded data
        guard let url = recordingURL else { return nil }

        do {
            let data = try Data(contentsOf: url)
            // Clean up file
            try? FileManager.default.removeItem(at: url)
            return data
        } catch {
            print("Error reading audio file: \(error)")
            return nil
        }
    }

    func cancelRecording() {
        audioRecorder?.stop()
        isRecording = false
        stopTimers()

        // Clean up file
        if let url = recordingURL {
            try? FileManager.default.removeItem(at: url)
        }

        try? AVAudioSession.sharedInstance().setActive(false)
    }

    // MARK: - Timers

    private func startTimers() {
        // Recording time timer
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.recordingTime += 0.1
            }
        }

        // Audio level timer
        levelTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.updateAudioLevel()
            }
        }
    }

    private func stopTimers() {
        timer?.invalidate()
        timer = nil
        levelTimer?.invalidate()
        levelTimer = nil
        audioLevel = 0
    }

    private func updateAudioLevel() {
        guard let recorder = audioRecorder, isRecording else { return }

        recorder.updateMeters()
        let level = recorder.averagePower(forChannel: 0)
        // Normalize from dB (-160 to 0) to 0-1
        let normalizedLevel = max(0, (level + 60) / 60)
        audioLevel = normalizedLevel
    }

    // MARK: - Formatting

    var formattedTime: String {
        let minutes = Int(recordingTime) / 60
        let seconds = Int(recordingTime) % 60
        let tenths = Int((recordingTime.truncatingRemainder(dividingBy: 1)) * 10)
        return String(format: "%02d:%02d.%d", minutes, seconds, tenths)
    }
}

// MARK: - Errors

enum AudioError: LocalizedError {
    case permissionDenied
    case fileError
    case recordingFailed

    var errorDescription: String? {
        switch self {
        case .permissionDenied:
            return "Mikrofon-Zugriff verweigert. Bitte erlaube den Zugriff in den Einstellungen."
        case .fileError:
            return "Fehler beim Erstellen der Audio-Datei"
        case .recordingFailed:
            return "Aufnahme fehlgeschlagen"
        }
    }
}

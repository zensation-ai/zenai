import Foundation
import Combine

// MARK: - Queue Item Types
enum QueueItemType: String, Codable {
    case textInput
    case voiceMemo
    case swipeAction
}

// MARK: - Queue Item
struct QueueItem: Identifiable, Codable {
    let id: UUID
    let type: QueueItemType
    let payload: Data
    let createdAt: Date
    var retryCount: Int
    var lastError: String?

    init(type: QueueItemType, payload: Data) {
        self.id = UUID()
        self.type = type
        self.payload = payload
        self.createdAt = Date()
        self.retryCount = 0
        self.lastError = nil
    }
}

// MARK: - Text Input Payload
struct TextInputPayload: Codable {
    let text: String
}

// MARK: - Voice Memo Payload
struct VoiceMemoPayload: Codable {
    let audioFileName: String
    let audioData: Data
}

// MARK: - Swipe Action Payload
struct SwipeActionPayload: Codable {
    let ideaId: String
    let action: String // "priority", "later", "archive"
}

// MARK: - Offline Queue Service
@MainActor
class OfflineQueueService: ObservableObject {
    static let shared = OfflineQueueService()

    @Published var queuedItems: [QueueItem] = []
    @Published var isProcessing = false
    @Published var isOnline = true

    private let queueKey = "offline_queue"
    private let maxRetries = 3
    private var processTimer: Timer?

    private init() {
        loadQueue()
        startMonitoring()
    }

    // MARK: - Queue Management

    func enqueue(type: QueueItemType, payload: Codable) {
        do {
            let data = try JSONEncoder().encode(payload)
            let item = QueueItem(type: type, payload: data)
            queuedItems.append(item)
            saveQueue()

            // Try to process immediately if online
            if isOnline {
                Task {
                    await processQueue()
                }
            }
        } catch {
            print("Failed to enqueue item: \(error)")
        }
    }

    func enqueueTextInput(_ text: String) {
        let payload = TextInputPayload(text: text)
        enqueue(type: .textInput, payload: payload)
    }

    func enqueueVoiceMemo(fileName: String, audioData: Data) {
        let payload = VoiceMemoPayload(audioFileName: fileName, audioData: audioData)
        enqueue(type: .voiceMemo, payload: payload)
    }

    func enqueueSwipeAction(ideaId: String, action: SwipeAction) {
        let payload = SwipeActionPayload(ideaId: ideaId, action: action.rawValue)
        enqueue(type: .swipeAction, payload: payload)
    }

    func removeItem(_ item: QueueItem) {
        queuedItems.removeAll { $0.id == item.id }
        saveQueue()
    }

    func clearQueue() {
        queuedItems.removeAll()
        saveQueue()
    }

    // MARK: - Processing

    func processQueue() async {
        guard !isProcessing && !queuedItems.isEmpty && isOnline else { return }

        isProcessing = true

        for index in queuedItems.indices {
            guard index < queuedItems.count else { break }

            var item = queuedItems[index]

            if item.retryCount >= maxRetries {
                continue // Skip items that have exceeded max retries
            }

            let success = await processItem(item)

            if success {
                // Remove successful item
                queuedItems.removeAll { $0.id == item.id }
                saveQueue()
            } else {
                // Increment retry count
                item.retryCount += 1
                if let idx = queuedItems.firstIndex(where: { $0.id == item.id }) {
                    queuedItems[idx] = item
                }
                saveQueue()
            }
        }

        isProcessing = false
    }

    private func processItem(_ item: QueueItem) async -> Bool {
        let apiService = APIService()

        do {
            switch item.type {
            case .textInput:
                let payload = try JSONDecoder().decode(TextInputPayload.self, from: item.payload)
                _ = try await apiService.processText(payload.text)
                return true

            case .voiceMemo:
                let payload = try JSONDecoder().decode(VoiceMemoPayload.self, from: item.payload)
                _ = try await apiService.processVoiceMemo(audioData: payload.audioData, filename: payload.audioFileName)
                return true

            case .swipeAction:
                // For now, swipe actions are stored locally
                // TODO: Implement backend sync for swipe actions
                return true
            }
        } catch {
            print("Failed to process queue item: \(error)")
            if var updatedItem = queuedItems.first(where: { $0.id == item.id }) {
                updatedItem.lastError = error.localizedDescription
                if let idx = queuedItems.firstIndex(where: { $0.id == item.id }) {
                    queuedItems[idx] = updatedItem
                }
            }
            return false
        }
    }

    // MARK: - Persistence

    private func saveQueue() {
        do {
            let data = try JSONEncoder().encode(queuedItems)
            UserDefaults.standard.set(data, forKey: queueKey)
        } catch {
            print("Failed to save queue: \(error)")
        }
    }

    private func loadQueue() {
        guard let data = UserDefaults.standard.data(forKey: queueKey) else { return }

        do {
            queuedItems = try JSONDecoder().decode([QueueItem].self, from: data)
        } catch {
            print("Failed to load queue: \(error)")
            queuedItems = []
        }
    }

    // MARK: - Network Monitoring

    private func startMonitoring() {
        // Simple connectivity check using timer
        processTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { @MainActor in
                await self?.checkConnectivity()
            }
        }

        // Initial check
        Task {
            await checkConnectivity()
        }
    }

    private func checkConnectivity() async {
        let apiService = APIService()
        let wasOnline = isOnline
        isOnline = await apiService.checkHealth()

        // If we just came online and have queued items, process them
        if isOnline && !wasOnline && !queuedItems.isEmpty {
            await processQueue()
        }
    }

    deinit {
        processTimer?.invalidate()
    }
}

// MARK: - SwipeAction Extension for Codable
extension SwipeAction {
    var rawValue: String {
        switch self {
        case .later: return "later"
        case .archive: return "archive"
        case .priority: return "priority"
        case .detail: return "detail"
        }
    }

    init?(rawValue: String) {
        switch rawValue {
        case "later": self = .later
        case "archive": self = .archive
        case "priority": self = .priority
        case "detail": self = .detail
        default: return nil
        }
    }
}

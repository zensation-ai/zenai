import Foundation
import Combine

/// Handles cross-device synchronization for the AI Brain app
@MainActor
class SyncService: ObservableObject {
    static let shared = SyncService()

    @Published var syncStatus: SyncStatus = .idle
    @Published var lastSyncTime: Date?
    @Published var pendingChangesCount: Int = 0
    @Published var isSyncing: Bool = false

    private let apiService = APIService.shared
    private var syncTimer: Timer?
    private var cancellables = Set<AnyCancellable>()

    /// Sync interval in seconds
    private let syncInterval: TimeInterval = 30

    enum SyncStatus: Equatable {
        case idle
        case syncing
        case success
        case error(String)

        var displayText: String {
            switch self {
            case .idle: return "Bereit"
            case .syncing: return "Synchronisiere..."
            case .success: return "Synchronisiert"
            case .error(let message): return "Fehler: \(message)"
            }
        }

        var icon: String {
            switch self {
            case .idle: return "arrow.triangle.2.circlepath"
            case .syncing: return "arrow.triangle.2.circlepath.circle"
            case .success: return "checkmark.circle.fill"
            case .error: return "exclamationmark.triangle.fill"
            }
        }
    }

    private init() {
        setupObservers()
    }

    // MARK: - Setup

    private func setupObservers() {
        // Observe app becoming active
        NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)
            .sink { [weak self] _ in
                Task {
                    await self?.triggerSync()
                }
            }
            .store(in: &cancellables)

        // Observe context changes
        ContextManager.shared.$currentContext
            .dropFirst()
            .sink { [weak self] _ in
                Task {
                    await self?.triggerSync()
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Sync Control

    /// Start automatic background sync
    func startAutoSync() {
        stopAutoSync()

        syncTimer = Timer.scheduledTimer(withTimeInterval: syncInterval, repeats: true) { [weak self] _ in
            Task { @MainActor in
                await self?.triggerSync()
            }
        }

        // Trigger initial sync
        Task {
            await triggerSync()
        }

        print("🔄 SyncService: Auto sync started (interval: \(syncInterval)s)")
    }

    /// Stop automatic background sync
    func stopAutoSync() {
        syncTimer?.invalidate()
        syncTimer = nil
        print("🔄 SyncService: Auto sync stopped")
    }

    /// Manually trigger a sync
    func triggerSync() async {
        guard !isSyncing else {
            print("🔄 SyncService: Sync already in progress, skipping")
            return
        }

        isSyncing = true
        syncStatus = .syncing

        do {
            // 1. Push any pending local changes
            await pushPendingChanges()

            // 2. Fetch latest data from server
            await pullLatestData()

            // 3. Update sync status
            lastSyncTime = Date()
            syncStatus = .success

            // Reset to idle after a short delay
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            if case .success = syncStatus {
                syncStatus = .idle
            }

        } catch {
            syncStatus = .error(error.localizedDescription)
            print("🔄 SyncService: Sync failed - \(error)")
        }

        isSyncing = false
    }

    // MARK: - Push Changes

    private func pushPendingChanges() async {
        // Use the existing OfflineQueueService to process queued items
        let queuedItems = OfflineQueueService.shared.queuedItems
        pendingChangesCount = queuedItems.count

        guard !queuedItems.isEmpty else { return }

        print("🔄 SyncService: Found \(queuedItems.count) queued items - triggering OfflineQueueService")

        // OfflineQueueService handles its own queue processing
        await OfflineQueueService.shared.processQueue()

        // Update count after processing
        pendingChangesCount = OfflineQueueService.shared.queuedItems.count
    }

    // MARK: - Pull Data

    private func pullLatestData() async {
        // Notify observers that fresh data is available
        // The individual views will refresh their data through their own API calls

        // Post notification for views to refresh
        NotificationCenter.default.post(name: .syncDataUpdated, object: nil)

        print("🔄 SyncService: Pull completed - notifying views to refresh")
    }

    // MARK: - Sync Status

    func getSyncStatusInfo() -> SyncStatusInfo {
        SyncStatusInfo(
            status: syncStatus,
            lastSync: lastSyncTime,
            pendingChanges: pendingChangesCount,
            isSyncing: isSyncing
        )
    }
}

// MARK: - Models

struct SyncStatusInfo {
    let status: SyncService.SyncStatus
    let lastSync: Date?
    let pendingChanges: Int
    let isSyncing: Bool

    var formattedLastSync: String {
        guard let lastSync = lastSync else {
            return "Noch nie"
        }

        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: lastSync, relativeTo: Date())
    }
}

// MARK: - Notifications

extension Notification.Name {
    static let syncDataUpdated = Notification.Name("syncDataUpdated")
    static let syncStatusChanged = Notification.Name("syncStatusChanged")
}

import Foundation
import UserNotifications
import UIKit

/// Notification Service for Push and Local Notifications
@MainActor
class NotificationService: NSObject, ObservableObject {
    static let shared = NotificationService()

    @Published var isAuthorized = false
    @Published var pendingNotifications: [UNNotificationRequest] = []

    private let center = UNUserNotificationCenter.current()

    override init() {
        super.init()
        center.delegate = self
        checkAuthorizationStatus()
    }

    // MARK: - Authorization

    /// Check current authorization status
    func checkAuthorizationStatus() {
        center.getNotificationSettings { [weak self] settings in
            Task { @MainActor in
                self?.isAuthorized = settings.authorizationStatus == .authorized
            }
        }
    }

    /// Request notification permission
    func requestAuthorization() async -> Bool {
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
            await MainActor.run {
                self.isAuthorized = granted
            }

            if granted {
                await registerForRemoteNotifications()
            }

            return granted
        } catch {
            print("❌ Notification authorization failed: \(error)")
            return false
        }
    }

    /// Register for remote push notifications
    private func registerForRemoteNotifications() async {
        await MainActor.run {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    // MARK: - Push Token Registration

    /// Register push token with backend
    func registerPushToken(_ token: Data, context: AIContext = .personal) async {
        let tokenString = token.map { String(format: "%02.2hhx", $0) }.joined()
        print("📱 Push Token: \(tokenString)")

        let apiService = APIService.shared

        do {
            try await apiService.registerPushToken(
                token: tokenString,
                platform: "ios",
                deviceId: UIDevice.current.identifierForVendor?.uuidString,
                deviceName: UIDevice.current.name
            )
            print("✅ Push token registered with backend")
        } catch {
            print("❌ Failed to register push token: \(error)")
        }
    }

    // MARK: - Local Notifications

    /// Schedule a local notification for a ready cluster
    func scheduleClusterReadyNotification(clusterId: String, title: String, maturityScore: Double) {
        let content = UNMutableNotificationContent()
        content.title = "Gedanken-Cluster bereit!"
        content.body = "\"\(title)\" ist bereit zur Konsolidierung (\(Int(maturityScore * 100))% reif)"
        content.sound = .default
        content.badge = 1
        content.userInfo = [
            "type": "cluster_ready",
            "clusterId": clusterId,
        ]

        // Schedule for immediate delivery
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        let request = UNNotificationRequest(
            identifier: "cluster-\(clusterId)",
            content: content,
            trigger: trigger
        )

        center.add(request) { error in
            if let error = error {
                print("❌ Failed to schedule notification: \(error)")
            } else {
                print("✅ Cluster notification scheduled")
            }
        }
    }

    /// Schedule a daily reminder notification
    func scheduleDailyReminder(hour: Int = 9, minute: Int = 0) {
        let content = UNMutableNotificationContent()
        content.title = "Zeit für deine Gedanken"
        content.body = "Was beschäftigt dich heute? Nimm dir einen Moment zum Reflektieren."
        content.sound = .default
        content.userInfo = ["type": "daily_reminder"]

        var dateComponents = DateComponents()
        dateComponents.hour = hour
        dateComponents.minute = minute

        let trigger = UNCalendarNotificationTrigger(dateMatching: dateComponents, repeats: true)
        let request = UNNotificationRequest(
            identifier: "daily-reminder",
            content: content,
            trigger: trigger
        )

        center.add(request) { error in
            if let error = error {
                print("❌ Failed to schedule daily reminder: \(error)")
            } else {
                print("✅ Daily reminder scheduled for \(hour):\(minute)")
            }
        }
    }

    /// Schedule a priority reminder for high-priority ideas
    func schedulePriorityReminder(ideaId: String, title: String, delay: TimeInterval = 3600) {
        let content = UNMutableNotificationContent()
        content.title = "Hohe Priorität"
        content.body = "Vergiss nicht: \(title)"
        content.sound = .default
        content.userInfo = [
            "type": "priority_reminder",
            "ideaId": ideaId,
        ]

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: delay, repeats: false)
        let request = UNNotificationRequest(
            identifier: "priority-\(ideaId)",
            content: content,
            trigger: trigger
        )

        center.add(request) { error in
            if let error = error {
                print("❌ Failed to schedule priority reminder: \(error)")
            }
        }
    }

    /// Cancel a specific notification
    func cancelNotification(identifier: String) {
        center.removePendingNotificationRequests(withIdentifiers: [identifier])
    }

    /// Cancel all pending notifications
    func cancelAllNotifications() {
        center.removeAllPendingNotificationRequests()
    }

    /// Get pending notifications
    func getPendingNotifications() async -> [UNNotificationRequest] {
        return await center.pendingNotificationRequests()
    }

    // MARK: - Badge Management

    /// Set app badge count
    func setBadgeCount(_ count: Int) {
        center.setBadgeCount(count) { error in
            if let error = error {
                print("❌ Failed to set badge count: \(error)")
            }
        }
    }

    /// Clear app badge
    func clearBadge() {
        setBadgeCount(0)
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension NotificationService: UNUserNotificationCenterDelegate {
    /// Handle notification when app is in foreground
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Show notification even when app is in foreground
        completionHandler([.banner, .badge, .sound])
    }

    /// Handle notification tap
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo

        if let type = userInfo["type"] as? String {
            Task { @MainActor in
                switch type {
                case "cluster_ready":
                    // Navigate to incubator with specific cluster
                    // clusterId available in userInfo if needed for deep linking
                    DeepLinkManager.shared.selectedTab = 2

                case "draft_ready":
                    // Navigate to idea detail with draft
                    if let draftId = userInfo["draftId"] as? String {
                        DeepLinkManager.shared.selectedTab = 1
                        DeepLinkManager.shared.pendingDraftId = draftId
                        // Record notification opened
                        Task {
                            await self.recordNotificationOpened(notificationId: response.notification.request.identifier)
                        }
                    }

                case "feedback_reminder":
                    // Navigate to draft for feedback
                    if let draftId = userInfo["draftId"] as? String {
                        DeepLinkManager.shared.selectedTab = 1
                        DeepLinkManager.shared.pendingDraftId = draftId
                    }

                case "idea_connection":
                    // Navigate to idea
                    if let ideaId = userInfo["ideaId"] as? String {
                        DeepLinkManager.shared.selectedTab = 1
                        DeepLinkManager.shared.selectedIdeaId = ideaId
                    }

                case "priority_reminder":
                    if let ideaId = userInfo["ideaId"] as? String {
                        // Navigate to idea detail
                        DeepLinkManager.shared.selectedTab = 1
                        DeepLinkManager.shared.selectedIdeaId = ideaId
                    }

                case "daily_reminder":
                    // Navigate to record view
                    DeepLinkManager.shared.selectedTab = 2

                default:
                    break
                }
            }
        }

        completionHandler()
    }

    // MARK: - Notification Tracking

    /// Record that a notification was opened
    func recordNotificationOpened(notificationId: String) async {
        do {
            try await APIService.shared.recordNotificationOpened(notificationId: notificationId)
        } catch {
            print("❌ Failed to record notification opened: \(error)")
        }
    }
}

// MARK: - APIService Extension for Push Notifications

extension APIService {
    /// Register push token with backend (new context-aware API)
    func registerPushToken(token: String, platform: String, deviceId: String?, deviceName: String?) async throws {
        // Try new context-aware endpoint first, fallback to legacy
        let context = ContextManager.shared.currentContext.rawValue
        let deviceModel = UIDevice.current.model
        let osVersion = UIDevice.current.systemVersion
        let appVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"

        guard let url = URL(string: "\(baseURL)/api/\(context)/notifications/device") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let apiKey = APIKeyManager.shared.getAPIKey() {
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }

        var body: [String: Any] = [
            "deviceToken": token,
            "deviceId": deviceId ?? UUID().uuidString,
            "deviceName": deviceName ?? UIDevice.current.name,
            "deviceModel": deviceModel,
            "osVersion": osVersion,
            "appVersion": appVersion,
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 || httpResponse.statusCode == 201 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }
    }

    /// Get notification preferences for current device
    func getNotificationPreferences() async throws -> PushNotificationPreferences {
        let context = ContextManager.shared.currentContext.rawValue
        let deviceId = UIDevice.current.identifierForVendor?.uuidString ?? "unknown"

        guard let url = URL(string: "\(baseURL)/api/\(context)/notifications/preferences/\(deviceId)") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        if let apiKey = APIKeyManager.shared.getAPIKey() {
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        struct APIResponse: Codable {
            let success: Bool
            let preferences: PushNotificationPreferences
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let apiResponse = try decoder.decode(APIResponse.self, from: data)
        return apiResponse.preferences
    }

    /// Update notification preferences
    func updateNotificationPreferences(_ preferences: PushNotificationPreferences) async throws {
        let context = ContextManager.shared.currentContext.rawValue
        let deviceId = UIDevice.current.identifierForVendor?.uuidString ?? "unknown"

        guard let url = URL(string: "\(baseURL)/api/\(context)/notifications/preferences/\(deviceId)") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let apiKey = APIKeyManager.shared.getAPIKey() {
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }

        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        request.httpBody = try encoder.encode(preferences)

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }
    }

    /// Record that a notification was opened
    func recordNotificationOpened(notificationId: String) async throws {
        let context = ContextManager.shared.currentContext.rawValue

        guard let url = URL(string: "\(baseURL)/api/\(context)/notifications/\(notificationId)/opened") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        if let apiKey = APIKeyManager.shared.getAPIKey() {
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }
    }
}

// MARK: - Push Notification Preferences Model

struct PushNotificationPreferences: Codable {
    var draftReady: Bool
    var draftFeedbackReminder: Bool
    var ideaConnections: Bool
    var learningSuggestions: Bool
    var weeklySummary: Bool
    var quietHoursEnabled: Bool
    var quietHoursStart: String?
    var quietHoursEnd: String?
    var timezone: String
    var maxNotificationsPerHour: Int
    var maxNotificationsPerDay: Int

    static let `default` = PushNotificationPreferences(
        draftReady: true,
        draftFeedbackReminder: true,
        ideaConnections: true,
        learningSuggestions: true,
        weeklySummary: false,
        quietHoursEnabled: false,
        quietHoursStart: "22:00",
        quietHoursEnd: "08:00",
        timezone: "Europe/Berlin",
        maxNotificationsPerHour: 10,
        maxNotificationsPerDay: 50
    )
}

// MARK: - Legacy Notification Preferences (for backward compatibility)

struct NotificationPreferences: Codable {
    var clusterReady: Bool
    var dailyDigest: Bool
    var weeklyInsights: Bool
    var priorityReminders: Bool
    var quietHoursStart: String?
    var quietHoursEnd: String?

    static let `default` = NotificationPreferences(
        clusterReady: true,
        dailyDigest: false,
        weeklyInsights: true,
        priorityReminders: true,
        quietHoursStart: "22:00",
        quietHoursEnd: "08:00"
    )
}

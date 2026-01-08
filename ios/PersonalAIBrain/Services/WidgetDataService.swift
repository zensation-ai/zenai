import Foundation
import WidgetKit

/// Phase 13.2: Widget Data Service
/// Shares data between the main app and widgets via App Groups
final class WidgetDataService {
    static let shared = WidgetDataService()

    private let appGroupID = "group.com.personalai.brain"
    private let recentIdeasKey = "recentIdeas"
    private let totalIdeasKey = "totalIdeas"

    private var sharedDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroupID)
    }

    private init() {}

    // MARK: - Data Structure

    struct WidgetIdeaData: Codable {
        let id: String
        let title: String
        let type: String
        let category: String
        let createdAt: Date
    }

    // MARK: - Public API

    /// Update widget data with recent ideas
    func updateWidgetData(ideas: [Idea], totalCount: Int) {
        guard let defaults = sharedDefaults else {
            print("Widget: App Group not available")
            return
        }

        // Convert ideas to widget-friendly format
        let widgetIdeas = ideas.prefix(5).map { idea in
            WidgetIdeaData(
                id: idea.id,
                title: idea.title,
                type: idea.type.rawValue,
                category: idea.category.rawValue,
                createdAt: idea.createdAt
            )
        }

        // Store data
        if let encoded = try? JSONEncoder().encode(widgetIdeas) {
            defaults.set(encoded, forKey: recentIdeasKey)
        }
        defaults.set(totalCount, forKey: totalIdeasKey)

        // Trigger widget refresh
        refreshWidgets()
    }

    /// Update total ideas count only
    func updateTotalCount(_ count: Int) {
        sharedDefaults?.set(count, forKey: totalIdeasKey)
        refreshWidgets()
    }

    /// Clear all widget data
    func clearWidgetData() {
        sharedDefaults?.removeObject(forKey: recentIdeasKey)
        sharedDefaults?.removeObject(forKey: totalIdeasKey)
        refreshWidgets()
    }

    /// Trigger widget timeline refresh
    func refreshWidgets() {
        WidgetCenter.shared.reloadAllTimelines()
    }

    /// Reload specific widget kind
    func refreshWidget(kind: String) {
        WidgetCenter.shared.reloadTimelines(ofKind: kind)
    }
}

// MARK: - Integration with LocalStorageService

extension LocalStorageService {
    /// Update widgets after data changes
    func updateWidgets() {
        let ideas = localIdeas
        let totalCount = ideas.count
        WidgetDataService.shared.updateWidgetData(ideas: Array(ideas.prefix(5)), totalCount: totalCount)
    }
}

import Foundation
import WidgetKit

/// Phase 13.2 + Phase 20: Widget Data Service
/// Shares data between the main app and widgets via App Groups
final class WidgetDataService {
    static let shared = WidgetDataService()

    private let appGroupID = "group.com.personalai.brain"
    private let recentIdeasKey = "recentIdeas"
    private let totalIdeasKey = "totalIdeas"
    private let productivityScoreKey = "productivityScore"
    private let todayCountKey = "todayCount"
    private let weekCountKey = "weekCount"
    private let streakKey = "streak"

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

    /// Phase 20: Update productivity data for widgets
    func updateProductivityData(score: Int, todayCount: Int, weekCount: Int, streak: Int) {
        guard let defaults = sharedDefaults else {
            print("Widget: App Group not available")
            return
        }

        defaults.set(score, forKey: productivityScoreKey)
        defaults.set(todayCount, forKey: todayCountKey)
        defaults.set(weekCount, forKey: weekCountKey)
        defaults.set(streak, forKey: streakKey)

        refreshWidget(kind: "ProductivityWidget")
    }

    /// Phase 20: Update all widget data at once
    func updateAllWidgetData(
        ideas: [Idea],
        totalCount: Int,
        productivityScore: Int,
        todayCount: Int,
        weekCount: Int,
        streak: Int
    ) {
        guard let defaults = sharedDefaults else {
            print("Widget: App Group not available")
            return
        }

        // Ideas data
        let widgetIdeas = ideas.prefix(5).map { idea in
            WidgetIdeaData(
                id: idea.id,
                title: idea.title,
                type: idea.type.rawValue,
                category: idea.category.rawValue,
                createdAt: idea.createdAt
            )
        }

        if let encoded = try? JSONEncoder().encode(widgetIdeas) {
            defaults.set(encoded, forKey: recentIdeasKey)
        }
        defaults.set(totalCount, forKey: totalIdeasKey)

        // Productivity data
        defaults.set(productivityScore, forKey: productivityScoreKey)
        defaults.set(todayCount, forKey: todayCountKey)
        defaults.set(weekCount, forKey: weekCountKey)
        defaults.set(streak, forKey: streakKey)

        refreshWidgets()
    }

    /// Clear all widget data
    func clearWidgetData() {
        sharedDefaults?.removeObject(forKey: recentIdeasKey)
        sharedDefaults?.removeObject(forKey: totalIdeasKey)
        sharedDefaults?.removeObject(forKey: productivityScoreKey)
        sharedDefaults?.removeObject(forKey: todayCountKey)
        sharedDefaults?.removeObject(forKey: weekCountKey)
        sharedDefaults?.removeObject(forKey: streakKey)
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

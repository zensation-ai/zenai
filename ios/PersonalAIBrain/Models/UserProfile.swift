import Foundation

struct UserProfile: Codable {
    let totalIdeas: Int
    let totalMeetings: Int
    let avgIdeasPerDay: Double
    let topCategories: [CategoryCount]
    let topTypes: [TypeCount]
    let topTopics: [TopicCount]
    let autoPriorityEnabled: Bool

    enum CodingKeys: String, CodingKey {
        case totalIdeas = "total_ideas"
        case totalMeetings = "total_meetings"
        case avgIdeasPerDay = "avg_ideas_per_day"
        case topCategories = "top_categories"
        case topTypes = "top_types"
        case topTopics = "top_topics"
        case autoPriorityEnabled = "auto_priority_enabled"
    }
}

struct ProfileStats: Codable {
    let totalIdeas: Int
    let totalMeetings: Int
    let avgIdeasPerDay: Double
    let topCategories: [CategoryCount]
    let topTypes: [TypeCount]
    let topTopics: [TopicCount]
    let autoPriorityEnabled: Bool

    enum CodingKeys: String, CodingKey {
        case totalIdeas = "total_ideas"
        case totalMeetings = "total_meetings"
        case avgIdeasPerDay = "avg_ideas_per_day"
        case topCategories = "top_categories"
        case topTypes = "top_types"
        case topTopics = "top_topics"
        case autoPriorityEnabled = "auto_priority_enabled"
    }
}

struct CategoryCount: Codable {
    let name: String
    let count: Int
}

struct TypeCount: Codable {
    let name: String
    let count: Int
}

struct TopicCount: Codable {
    let name: String
    let count: Int
}

struct Recommendations: Codable {
    let suggestedTopics: [String]
    let optimalHours: [Int]
    let focusCategories: [String]
    let insights: [String]

    enum CodingKeys: String, CodingKey {
        case suggestedTopics = "suggested_topics"
        case optimalHours = "optimal_hours"
        case focusCategories = "focus_categories"
        case insights
    }
}

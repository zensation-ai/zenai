import Foundation

struct UserProfile: Codable {
    let totalIdeas: Int
    let totalMeetings: Int
    let avgIdeasPerDay: Double
    let topCategories: [[Any]]  // [String, Int] pairs
    let topTypes: [[Any]]
    let topTopics: [[Any]]
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

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        totalIdeas = try container.decode(Int.self, forKey: .totalIdeas)
        totalMeetings = try container.decode(Int.self, forKey: .totalMeetings)
        avgIdeasPerDay = try container.decode(Double.self, forKey: .avgIdeasPerDay)
        autoPriorityEnabled = try container.decode(Bool.self, forKey: .autoPriorityEnabled)

        // Decode tuples as arrays
        topCategories = (try? container.decode([[Any]].self, forKey: .topCategories)) ?? []
        topTypes = (try? container.decode([[Any]].self, forKey: .topTypes)) ?? []
        topTopics = (try? container.decode([[Any]].self, forKey: .topTopics)) ?? []
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(totalIdeas, forKey: .totalIdeas)
        try container.encode(totalMeetings, forKey: .totalMeetings)
        try container.encode(avgIdeasPerDay, forKey: .avgIdeasPerDay)
        try container.encode(autoPriorityEnabled, forKey: .autoPriorityEnabled)
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

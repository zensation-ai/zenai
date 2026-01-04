import Foundation

struct Meeting: Identifiable, Codable {
    let id: String
    let companyId: String
    let title: String
    let date: Date
    let durationMinutes: Int?
    let participants: [String]
    let location: String?
    let meetingType: MeetingType
    let status: MeetingStatus
    let createdAt: Date
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, title, date, participants, location, status
        case companyId = "company_id"
        case durationMinutes = "duration_minutes"
        case meetingType = "meeting_type"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

enum MeetingType: String, Codable, CaseIterable {
    case `internal`
    case external
    case oneOnOne = "one_on_one"
    case team
    case client
    case other

    var displayName: String {
        switch self {
        case .internal: return "Intern"
        case .external: return "Extern"
        case .oneOnOne: return "1:1"
        case .team: return "Team"
        case .client: return "Kunde"
        case .other: return "Sonstiges"
        }
    }

    var icon: String {
        switch self {
        case .internal: return "building.2"
        case .external: return "globe"
        case .oneOnOne: return "person.2"
        case .team: return "person.3"
        case .client: return "handshake"
        case .other: return "calendar"
        }
    }
}

enum MeetingStatus: String, Codable, CaseIterable {
    case scheduled
    case inProgress = "in_progress"
    case completed
    case cancelled

    var displayName: String {
        switch self {
        case .scheduled: return "Geplant"
        case .inProgress: return "Läuft"
        case .completed: return "Abgeschlossen"
        case .cancelled: return "Abgesagt"
        }
    }

    var color: String {
        switch self {
        case .scheduled: return "blue"
        case .inProgress: return "orange"
        case .completed: return "green"
        case .cancelled: return "gray"
        }
    }
}

struct MeetingNotes: Codable {
    let id: String
    let meetingId: String
    let rawTranscript: String
    let structuredSummary: String
    let keyDecisions: [String]
    let actionItems: [ActionItem]
    let topicsDiscussed: [String]
    let followUps: [FollowUp]
    let sentiment: Sentiment
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case meetingId = "meeting_id"
        case rawTranscript = "raw_transcript"
        case structuredSummary = "structured_summary"
        case keyDecisions = "key_decisions"
        case actionItems = "action_items"
        case topicsDiscussed = "topics_discussed"
        case followUps = "follow_ups"
        case sentiment
        case createdAt = "created_at"
    }
}

struct ActionItem: Codable {
    let task: String
    let assignee: String?
    let dueDate: String?
    let priority: String
    let completed: Bool

    enum CodingKeys: String, CodingKey {
        case task, assignee, priority, completed
        case dueDate = "due_date"
    }
}

struct FollowUp: Codable {
    let topic: String
    let responsible: String?
    let deadline: String?
}

enum Sentiment: String, Codable {
    case positive
    case neutral
    case negative
    case mixed

    var icon: String {
        switch self {
        case .positive: return "face.smiling"
        case .neutral: return "face.dashed"
        case .negative: return "face.dashed.fill"
        case .mixed: return "questionmark.circle"
        }
    }
}

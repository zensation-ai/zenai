import Foundation

// MARK: - Draft Model

/// Represents a proactively generated draft for an idea/task
struct Draft: Codable, Identifiable {
    let id: String
    let ideaId: String
    let draftType: DraftType
    let content: String
    let wordCount: Int
    let status: DraftStatus

    enum CodingKeys: String, CodingKey {
        case id
        case ideaId = "ideaId"
        case draftType = "draftType"
        case content
        case wordCount = "wordCount"
        case status
    }
}

// MARK: - Draft Type

enum DraftType: String, Codable {
    case email
    case article
    case proposal
    case document
    case generic

    var displayName: String {
        switch self {
        case .email: return "E-Mail"
        case .article: return "Artikel"
        case .proposal: return "Angebot"
        case .document: return "Dokument"
        case .generic: return "Text"
        }
    }

    var icon: String {
        switch self {
        case .email: return "envelope"
        case .article: return "doc.richtext"
        case .proposal: return "doc.badge.plus"
        case .document: return "doc.text"
        case .generic: return "doc"
        }
    }
}

// MARK: - Draft Status

enum DraftStatus: String, Codable {
    case generating
    case ready
    case viewed
    case used
    case edited
    case discarded

    var displayName: String {
        switch self {
        case .generating: return "Wird erstellt..."
        case .ready: return "Bereit"
        case .viewed: return "Angesehen"
        case .used: return "Verwendet"
        case .edited: return "Bearbeitet"
        case .discarded: return "Verworfen"
        }
    }
}

// MARK: - Draft Response

struct DraftResponse: Codable {
    let success: Bool
    let draft: Draft?
    let message: String?
}

// MARK: - Draft Snippet (for list views)

struct DraftSnippet: Codable, Identifiable {
    let id: String
    let ideaId: String
    let draftType: DraftType
    let snippet: String
    let wordCount: Int
    let status: DraftStatus

    enum CodingKeys: String, CodingKey {
        case id
        case ideaId = "ideaId"
        case draftType = "draftType"
        case snippet
        case wordCount = "wordCount"
        case status
    }
}

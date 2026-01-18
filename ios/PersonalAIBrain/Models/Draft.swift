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
    let generationTimeMs: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case ideaId = "ideaId"
        case draftType = "draftType"
        case content
        case wordCount = "wordCount"
        case status
        case generationTimeMs = "generationTimeMs"
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

// MARK: - Phase 5: Draft Feedback

/// Edit categories for feedback
enum DraftEditCategory: String, Codable, CaseIterable {
    case tone
    case length
    case content
    case structure
    case formatting
    case accuracy

    var displayName: String {
        switch self {
        case .tone: return "Tonalität"
        case .length: return "Länge"
        case .content: return "Inhalt"
        case .structure: return "Struktur"
        case .formatting: return "Formatierung"
        case .accuracy: return "Genauigkeit"
        }
    }

    var icon: String {
        switch self {
        case .tone: return "theatermasks"
        case .length: return "ruler"
        case .content: return "doc.text"
        case .structure: return "building.2"
        case .formatting: return "sparkles"
        case .accuracy: return "target"
        }
    }
}

/// Quality aspects for detailed feedback
struct DraftQualityAspects: Codable {
    var accuracy: Int?
    var tone: Int?
    var completeness: Int?
    var relevance: Int?
    var structure: Int?
}

/// Detailed feedback request payload
struct DraftFeedbackRequest: Codable {
    let rating: Int
    var feedbackText: String?
    var contentReusedPercent: Int?
    var editsDescription: String?
    var editCategories: [String]?
    var wasHelpful: Bool?
    var wouldUseAgain: Bool?
    var qualityAspects: DraftQualityAspects?
    var feedbackSource: String = "manual"
}

/// Quick feedback request
struct QuickFeedbackRequest: Codable {
    let isPositive: Bool
}

/// Feedback response
struct FeedbackResponse: Codable {
    let success: Bool
    let feedbackId: String?
    let message: String?
}

/// Copy recorded response
struct CopyRecordedResponse: Codable {
    let success: Bool
    let message: String?
}

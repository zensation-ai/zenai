import SwiftUI

// MARK: - Training Item
struct TrainingItem: Identifiable, Codable {
    let id: String
    let ideaId: String
    let context: String
    let trainingType: TrainingType
    let originalValue: String?
    let correctedValue: String?
    let correctedCategory: IdeaCategory?
    let correctedPriority: Priority?
    let correctedType: IdeaType?
    let toneFeedback: ToneFeedback?
    let feedback: String?
    let weight: Int
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case ideaId = "idea_id"
        case context
        case trainingType = "training_type"
        case originalValue = "original_value"
        case correctedValue = "corrected_value"
        case correctedCategory = "corrected_category"
        case correctedPriority = "corrected_priority"
        case correctedType = "corrected_type"
        case toneFeedback = "tone_feedback"
        case feedback
        case weight
        case createdAt = "created_at"
    }
}

// MARK: - Training Type
enum TrainingType: String, Codable, CaseIterable, Identifiable {
    case category
    case priority
    case type
    case tone
    case general

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .category: return "Kategorie"
        case .priority: return "Prioritat"
        case .type: return "Typ"
        case .tone: return "Tonalitat"
        case .general: return "Allgemein"
        }
    }

    var icon: String {
        switch self {
        case .category: return "folder.fill"
        case .priority: return "star.fill"
        case .type: return "tag.fill"
        case .tone: return "waveform"
        case .general: return "text.bubble.fill"
        }
    }

    var color: Color {
        switch self {
        case .category: return .blue
        case .priority: return .yellow
        case .type: return .green
        case .tone: return .purple
        case .general: return .orange
        }
    }
}

// MARK: - Tone Feedback
enum ToneFeedback: String, Codable, CaseIterable {
    case morePersonal = "more_personal"
    case moreProfessional = "more_professional"
    case moreConcise = "more_concise"
    case moreDetailed = "more_detailed"
    case moreEncouraging = "more_encouraging"
    case moreNeutral = "more_neutral"

    var displayName: String {
        switch self {
        case .morePersonal: return "Personlicher"
        case .moreProfessional: return "Professioneller"
        case .moreConcise: return "Kurzer"
        case .moreDetailed: return "Detaillierter"
        case .moreEncouraging: return "Ermutigender"
        case .moreNeutral: return "Neutraler"
        }
    }

    var description: String {
        switch self {
        case .morePersonal: return "Freundlicher, warmerer Ton"
        case .moreProfessional: return "Geschaftlicher, formeller"
        case .moreConcise: return "Auf den Punkt, weniger Text"
        case .moreDetailed: return "Mehr Erklarungen und Kontext"
        case .moreEncouraging: return "Motivierender, positiver"
        case .moreNeutral: return "Sachlicher, ohne Wertung"
        }
    }

    var icon: String {
        switch self {
        case .morePersonal: return "heart.fill"
        case .moreProfessional: return "briefcase.fill"
        case .moreConcise: return "text.alignleft"
        case .moreDetailed: return "doc.text.fill"
        case .moreEncouraging: return "hand.thumbsup.fill"
        case .moreNeutral: return "circle.fill"
        }
    }

    var color: Color {
        switch self {
        case .morePersonal: return .pink
        case .moreProfessional: return .blue
        case .moreConcise: return .orange
        case .moreDetailed: return .green
        case .moreEncouraging: return .yellow
        case .moreNeutral: return .gray
        }
    }
}

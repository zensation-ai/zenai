import Foundation

struct Idea: Identifiable, Codable, Hashable {
    let id: String
    let title: String
    let type: IdeaType
    let category: IdeaCategory
    let priority: Priority
    let summary: String?
    let nextSteps: [String]?
    let contextNeeded: [String]?
    let keywords: [String]?
    let rawTranscript: String?
    let createdAt: Date
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, title, type, category, priority, summary
        case nextSteps = "next_steps"
        case contextNeeded = "context_needed"
        case keywords
        case rawTranscript = "raw_transcript"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

enum IdeaType: String, Codable, CaseIterable {
    case idea
    case task
    case insight
    case problem
    case question

    var icon: String {
        switch self {
        case .idea: return "lightbulb.fill"
        case .task: return "checkmark.circle.fill"
        case .insight: return "eye.fill"
        case .problem: return "exclamationmark.triangle.fill"
        case .question: return "questionmark.circle.fill"
        }
    }

    var color: String {
        switch self {
        case .idea: return "yellow"
        case .task: return "blue"
        case .insight: return "purple"
        case .problem: return "red"
        case .question: return "orange"
        }
    }

    var displayName: String {
        switch self {
        case .idea: return "Idee"
        case .task: return "Aufgabe"
        case .insight: return "Erkenntnis"
        case .problem: return "Problem"
        case .question: return "Frage"
        }
    }
}

enum IdeaCategory: String, Codable, CaseIterable {
    case business
    case technical
    case personal
    case learning

    var displayName: String {
        switch self {
        case .business: return "Business"
        case .technical: return "Technik"
        case .personal: return "Persönlich"
        case .learning: return "Lernen"
        }
    }
}

enum Priority: String, Codable, CaseIterable {
    case low
    case medium
    case high

    var displayName: String {
        switch self {
        case .low: return "Niedrig"
        case .medium: return "Mittel"
        case .high: return "Hoch"
        }
    }

    var color: String {
        switch self {
        case .low: return "gray"
        case .medium: return "orange"
        case .high: return "red"
        }
    }
}

// MARK: - Sample Data
extension Idea {
    static let sampleData: [Idea] = [
        Idea(
            id: "1",
            title: "RAG-System für PV-Branche",
            type: .idea,
            category: .business,
            priority: .high,
            summary: "Entwurf eines RAG-Systems zur Überwachung von Projekten in der Photovoltaikbranche.",
            nextSteps: ["Forschung zu bestehenden Lösungen", "Identifizierung von spezifischen Bedürfnissen"],
            contextNeeded: ["Kenntnisse über RAG-Systeme"],
            keywords: ["RAG", "Photovoltaik", "KI"],
            rawTranscript: "Ich habe eine Idee für ein RAG System...",
            createdAt: Date(),
            updatedAt: Date()
        )
    ]
}

// Note: AIContext and ContextManager are defined in AIContext.swift

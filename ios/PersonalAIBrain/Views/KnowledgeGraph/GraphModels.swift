//
//  GraphModels.swift
//  PersonalAIBrain
//
//  Phase 8: Knowledge Graph Data Models
//

import SwiftUI

// MARK: - Graph Data Response
struct GraphDataResponse: Codable {
    let success: Bool
    let nodes: [GraphNode]
    let edges: [GraphEdge]
    let topics: [Topic]
    let stats: GraphStats
    let processingTime: Int?
}

// MARK: - Graph Node
struct GraphNode: Codable, Identifiable {
    let id: String
    let title: String
    let type: String
    let category: String
    let priority: String
    let topicId: String?
    let topicName: String?
    let topicColor: String?
    var position: Position?

    struct Position: Codable {
        var x: Double
        var y: Double
    }

    // Computed properties for SwiftUI
    var color: Color {
        if let topicColor = topicColor {
            return Color(hex: topicColor)
        }
        return typeColor
    }

    var typeColor: Color {
        switch type {
        case "idea": return .blue
        case "task": return .green
        case "insight": return .purple
        case "problem": return .red
        case "question": return .yellow
        default: return .gray
        }
    }

    var priorityColor: Color {
        switch priority {
        case "high": return .red
        case "medium": return .yellow
        case "low": return .green
        default: return .gray
        }
    }
}

// MARK: - Graph Edge
struct GraphEdge: Codable, Identifiable {
    let id: String
    let sourceId: String
    let targetId: String
    let relationType: String
    let strength: Double
    let reason: String?

    var color: Color {
        switch relationType {
        case "similar_to": return .blue
        case "builds_on": return .green
        case "contradicts": return .red
        case "supports": return .purple
        case "enables": return .yellow
        case "part_of": return .pink
        case "related_tech": return .cyan
        default: return .gray
        }
    }

    var displayName: String {
        switch relationType {
        case "similar_to": return "Aehnlich"
        case "builds_on": return "Baut auf"
        case "contradicts": return "Widerspricht"
        case "supports": return "Unterstuetzt"
        case "enables": return "Ermoeglicht"
        case "part_of": return "Teil von"
        case "related_tech": return "Verwandte Tech"
        default: return relationType
        }
    }
}

// MARK: - Topic
struct Topic: Codable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let color: String
    let icon: String
    let ideaCount: Int
    let ideaIds: [String]
    let confidenceScore: Double?

    var swiftUIColor: Color {
        Color(hex: color)
    }
}

// MARK: - Graph Stats
struct GraphStats: Codable {
    let nodeCount: Int
    let edgeCount: Int
    let topicCount: Int
}

// MARK: - Topic Generation Response
struct TopicGenerationResponse: Codable {
    let success: Bool
    let topicsCreated: Int
    let topicsUpdated: Int
    let ideasAssigned: Int
    let processingTime: Int
}

// MARK: - Discovery Response
struct DiscoveryResponse: Codable {
    let success: Bool
    let newRelationships: Int
    let processed: Int
    let processingTime: Int
}

// Note: Color(hex:) extension is defined in AppTheme.swift

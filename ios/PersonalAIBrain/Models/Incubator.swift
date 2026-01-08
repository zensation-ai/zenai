import Foundation

// MARK: - Loose Thought

struct LooseThought: Identifiable, Codable {
    let id: String
    let text: String
    let source: String
    let tags: [String]
    let createdAt: Date
    var processed: Bool
    var clusterId: String?

    enum CodingKeys: String, CodingKey {
        case id
        case text
        case source
        case tags
        case createdAt = "created_at"
        case processed
        case clusterId = "cluster_id"
    }
}

// MARK: - Thought Cluster

struct ThoughtCluster: Identifiable, Codable {
    let id: String
    let thoughts: [LooseThought]
    let theme: String?
    let summary: String?
    let readyForConsolidation: Bool
    let status: ClusterStatus
    let createdAt: Date
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case thoughts
        case theme
        case summary
        case readyForConsolidation = "ready_for_consolidation"
        case status
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    var thoughtCount: Int {
        thoughts.count
    }
}

enum ClusterStatus: String, Codable {
    case incubating
    case ready
    case consolidated
    case dismissed
}

// MARK: - Incubator Stats

struct IncubatorStats: Codable {
    let totalThoughts: Int
    let unprocessedThoughts: Int
    let totalClusters: Int
    let readyClusters: Int
    let consolidatedToday: Int

    enum CodingKeys: String, CodingKey {
        case totalThoughts = "total_thoughts"
        case unprocessedThoughts = "unprocessed_thoughts"
        case totalClusters = "total_clusters"
        case readyClusters = "ready_clusters"
        case consolidatedToday = "consolidated_today"
    }
}

// MARK: - API Responses

struct ThoughtsResponse: Codable {
    let thoughts: [LooseThought]
    let context: String
}

struct ClustersResponse: Codable {
    let clusters: [ThoughtCluster]
    let context: String
}

struct StatsResponse: Codable {
    let stats: IncubatorStats
    let context: String
}

struct ConsolidateResponse: Codable {
    let success: Bool
    let ideaId: String?
    let message: String

    enum CodingKeys: String, CodingKey {
        case success
        case ideaId = "idea_id"
        case message
    }
}

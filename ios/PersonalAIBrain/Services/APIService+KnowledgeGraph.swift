//
//  APIService+KnowledgeGraph.swift
//  PersonalAIBrain
//
//  Phase 8: Knowledge Graph API Extensions
//

import Foundation

// MARK: - Knowledge Graph API Methods
extension APIService {

    /// Fetch the full knowledge graph for visualization
    func fetchKnowledgeGraph(context: String) async throws -> GraphDataResponse {
        guard let url = URL(string: "\(baseURL)/api/knowledge-graph/full?context=\(context)") else {
            throw APIError.invalidURL
        }

        print("[KnowledgeGraph] Fetching full graph for context: \(context)")

        let request = try createAuthenticatedRequest(url: url, method: "GET")
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let decoder = JSONDecoder()
        let graphData = try decoder.decode(GraphDataResponse.self, from: data)

        print("[KnowledgeGraph] Loaded \(graphData.nodes.count) nodes, \(graphData.edges.count) edges, \(graphData.topics.count) topics")

        return graphData
    }

    /// Fetch subgraph around a specific idea
    func fetchSubgraph(ideaId: String, context: String, depth: Int = 2) async throws -> GraphDataResponse {
        guard let url = URL(string: "\(baseURL)/api/knowledge-graph/subgraph/\(ideaId)?context=\(context)&depth=\(depth)") else {
            throw APIError.invalidURL
        }

        print("[KnowledgeGraph] Fetching subgraph for idea: \(ideaId), depth: \(depth)")

        let request = try createAuthenticatedRequest(url: url, method: "GET")
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        return try JSONDecoder().decode(GraphDataResponse.self, from: data)
    }

    /// Generate topics using K-Means clustering
    func generateTopics(context: String) async throws -> TopicGenerationResponse {
        guard let url = URL(string: "\(baseURL)/api/knowledge-graph/topics/generate") else {
            throw APIError.invalidURL
        }

        let body: [String: Any] = [
            "context": context,
            "minClusterSize": 2,
            "maxClusters": 10
        ]
        let bodyData = try JSONSerialization.data(withJSONObject: body)
        var request = try createAuthenticatedRequest(url: url, method: "POST", body: bodyData)
        request.timeoutInterval = 120 // 2 minutes for clustering

        print("[KnowledgeGraph] Generating topics for context: \(context)")

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let result = try JSONDecoder().decode(TopicGenerationResponse.self, from: data)

        print("[KnowledgeGraph] Generated \(result.topicsCreated) topics, assigned \(result.ideasAssigned) ideas")

        return result
    }

    /// Discover relationships between ideas
    func discoverRelationships(context: String) async throws -> DiscoveryResponse {
        guard let url = URL(string: "\(baseURL)/api/knowledge-graph/discover") else {
            throw APIError.invalidURL
        }

        let body: [String: Any] = [
            "context": context,
            "force": false
        ]
        let bodyData = try JSONSerialization.data(withJSONObject: body)
        var request = try createAuthenticatedRequest(url: url, method: "POST", body: bodyData)
        request.timeoutInterval = 300 // 5 minutes for analysis

        print("[KnowledgeGraph] Discovering relationships for context: \(context)")

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let result = try JSONDecoder().decode(DiscoveryResponse.self, from: data)

        print("[KnowledgeGraph] Discovered \(result.newRelationships) new relationships from \(result.processed) ideas")

        return result
    }

    /// Get all topics for a context
    func fetchTopics(context: String) async throws -> [Topic] {
        guard let url = URL(string: "\(baseURL)/api/knowledge-graph/topics?context=\(context)") else {
            throw APIError.invalidURL
        }

        let request = try createAuthenticatedRequest(url: url, method: "GET")
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        struct TopicsResponse: Codable {
            let success: Bool
            let topics: [Topic]
            let count: Int
        }

        let result = try JSONDecoder().decode(TopicsResponse.self, from: data)
        return result.topics
    }

    /// Get relationships for a specific idea
    func fetchRelationships(ideaId: String) async throws -> [GraphEdge] {
        guard let url = URL(string: "\(baseURL)/api/knowledge-graph/relations/\(ideaId)") else {
            throw APIError.invalidURL
        }

        let request = try createAuthenticatedRequest(url: url, method: "GET")
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        struct RelationsResponse: Codable {
            let ideaId: String
            let relationships: [GraphEdge]
            let count: Int
        }

        let result = try JSONDecoder().decode(RelationsResponse.self, from: data)
        return result.relationships
    }

    /// Analyze relationships for a single idea
    func analyzeRelationships(ideaId: String) async throws {
        guard let url = URL(string: "\(baseURL)/api/knowledge-graph/analyze/\(ideaId)") else {
            throw APIError.invalidURL
        }

        var request = try createAuthenticatedRequest(url: url, method: "POST")
        request.timeoutInterval = 60

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }
    }
}

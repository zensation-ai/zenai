import Foundation

// Note: Response types are defined in Models/Incubator.swift

/// Service for interacting with the Thought Incubator API
final class IncubatorService {
    static let shared = IncubatorService()

    private init() {}

    // MARK: - Thoughts

    /// Add a new loose thought to the incubator
    func addThought(_ text: String, source: String = "app", tags: [String] = []) async throws -> LooseThought {
        let context = ContextManager.shared.currentContext
        let url = URL(string: "\(AppEnvironment.apiBaseURL)/incubator/thought?context=\(context.rawValue)")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = AppEnvironment.Timeouts.standard

        let body: [String: Any] = [
            "text": text,
            "source": source,
            "tags": tags,
            "context": context.rawValue
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 201 else {
            throw IncubatorError.serverError("Failed to add thought")
        }

        struct Response: Codable {
            let success: Bool
            let thought: LooseThought
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let result = try decoder.decode(Response.self, from: data)
        return result.thought
    }

    /// Get all loose thoughts
    func getThoughts(limit: Int = 50, includeProcessed: Bool = false) async throws -> [LooseThought] {
        let context = ContextManager.shared.currentContext
        let url = URL(string: "\(AppEnvironment.apiBaseURL)/incubator/thoughts?context=\(context.rawValue)&limit=\(limit)&includeProcessed=\(includeProcessed)")!

        var request = URLRequest(url: url)
        request.timeoutInterval = AppEnvironment.Timeouts.standard

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw IncubatorError.serverError("Failed to fetch thoughts")
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let result = try decoder.decode(ThoughtsResponse.self, from: data)
        return result.thoughts
    }

    // MARK: - Clusters

    /// Get all thought clusters
    func getClusters() async throws -> [ThoughtCluster] {
        let context = ContextManager.shared.currentContext
        let url = URL(string: "\(AppEnvironment.apiBaseURL)/incubator/clusters?context=\(context.rawValue)")!

        var request = URLRequest(url: url)
        request.timeoutInterval = AppEnvironment.Timeouts.standard

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw IncubatorError.serverError("Failed to fetch clusters")
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let result = try decoder.decode(ClustersResponse.self, from: data)
        return result.clusters
    }

    /// Get clusters ready for consolidation
    func getReadyClusters() async throws -> [ThoughtCluster] {
        let context = ContextManager.shared.currentContext
        let url = URL(string: "\(AppEnvironment.apiBaseURL)/incubator/clusters/ready?context=\(context.rawValue)")!

        var request = URLRequest(url: url)
        request.timeoutInterval = AppEnvironment.Timeouts.standard

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw IncubatorError.serverError("Failed to fetch ready clusters")
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let result = try decoder.decode(ClustersResponse.self, from: data)
        return result.clusters
    }

    /// Consolidate a cluster into a structured idea
    func consolidateCluster(_ clusterId: String) async throws -> ConsolidateResponse {
        let context = ContextManager.shared.currentContext
        let url = URL(string: "\(AppEnvironment.apiBaseURL)/incubator/clusters/\(clusterId)/consolidate?context=\(context.rawValue)")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = AppEnvironment.Timeouts.aiProcessing

        let body = ["context": context.rawValue]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw IncubatorError.serverError("Failed to consolidate cluster")
        }

        let decoder = JSONDecoder()
        return try decoder.decode(ConsolidateResponse.self, from: data)
    }

    /// Dismiss a cluster
    func dismissCluster(_ clusterId: String) async throws {
        let context = ContextManager.shared.currentContext
        let url = URL(string: "\(AppEnvironment.apiBaseURL)/incubator/clusters/\(clusterId)/dismiss?context=\(context.rawValue)")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = AppEnvironment.Timeouts.standard

        let body = ["context": context.rawValue]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw IncubatorError.serverError("Failed to dismiss cluster")
        }
    }

    // MARK: - Stats

    /// Get incubator statistics
    func getStats() async throws -> IncubatorStats {
        let context = ContextManager.shared.currentContext
        let url = URL(string: "\(AppEnvironment.apiBaseURL)/incubator/stats?context=\(context.rawValue)")!

        var request = URLRequest(url: url)
        request.timeoutInterval = AppEnvironment.Timeouts.standard

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw IncubatorError.serverError("Failed to fetch stats")
        }

        let decoder = JSONDecoder()
        let result = try decoder.decode(StatsResponse.self, from: data)
        return result.stats
    }

    // MARK: - Batch Operations

    /// Trigger batch analysis to find new clusters
    func runBatchAnalysis() async throws {
        let context = ContextManager.shared.currentContext
        let url = URL(string: "\(AppEnvironment.apiBaseURL)/incubator/analyze?context=\(context.rawValue)")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = AppEnvironment.Timeouts.aiProcessing

        let body = ["context": context.rawValue]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw IncubatorError.serverError("Failed to run batch analysis")
        }
    }
}

// MARK: - Incubator Error

enum IncubatorError: LocalizedError {
    case serverError(String)
    case networkError(Error)
    case decodingError(Error)

    var errorDescription: String? {
        switch self {
        case .serverError(let message):
            return message
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .decodingError(let error):
            return "Decoding error: \(error.localizedDescription)"
        }
    }
}

import Foundation

// MARK: - Phase 21: Personalization Chat API

extension APIService {

    // MARK: - Start Conversation

    /// Start a new personalization chat session
    func startPersonalizationChat() async throws -> PersonalizationStartResponse {
        guard let url = URL(string: "\(baseURL)/api/personalization/start") else {
            throw APIError.invalidURL
        }

        let (data, response) = try await URLSession.shared.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let result = try JSONDecoder().decode(PersonalizationStartAPIResponse.self, from: data)
        return result.data
    }

    // MARK: - Send Message

    /// Send a message in the personalization chat
    func sendPersonalizationMessage(sessionId: String?, message: String) async throws -> PersonalizationChatResponse {
        guard let url = URL(string: "\(baseURL)/api/personalization/chat") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 60

        let body: [String: Any] = [
            "sessionId": sessionId as Any,
            "message": message
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let result = try JSONDecoder().decode(PersonalizationChatAPIResponse.self, from: data)
        return result.data
    }

    // MARK: - Get Progress

    /// Get personalization learning progress
    func getPersonalizationProgress() async throws -> PersonalizationProgressResponse {
        guard let url = URL(string: "\(baseURL)/api/personalization/progress") else {
            throw APIError.invalidURL
        }

        let (data, response) = try await URLSession.shared.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let result = try JSONDecoder().decode(PersonalizationProgressAPIResponse.self, from: data)
        return result.data
    }

    // MARK: - Get Facts

    /// Get all learned facts
    func getPersonalizationFacts() async throws -> PersonalizationFactsResponse {
        guard let url = URL(string: "\(baseURL)/api/personalization/facts") else {
            throw APIError.invalidURL
        }

        let (data, response) = try await URLSession.shared.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let result = try JSONDecoder().decode(PersonalizationFactsAPIResponse.self, from: data)
        return result.data
    }

    // MARK: - Get Summary

    /// Get AI-generated summary of learned facts
    func getPersonalizationSummary() async throws -> PersonalizationSummaryResponse {
        guard let url = URL(string: "\(baseURL)/api/personalization/summary") else {
            throw APIError.invalidURL
        }

        let (data, response) = try await URLSession.shared.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let result = try JSONDecoder().decode(PersonalizationSummaryAPIResponse.self, from: data)
        return result.data
    }

    // MARK: - Delete Fact

    /// Delete a specific learned fact
    func deletePersonalizationFact(id: String) async throws {
        guard let url = URL(string: "\(baseURL)/api/personalization/facts/\(id)") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }
    }
}

// MARK: - Response Types

struct PersonalizationStartAPIResponse: Codable {
    let success: Bool
    let data: PersonalizationStartResponse
}

struct PersonalizationStartResponse: Codable {
    let sessionId: String
    let message: String
    let currentTopic: String
}

struct PersonalizationChatAPIResponse: Codable {
    let success: Bool
    let data: PersonalizationChatResponse
}

struct PersonalizationChatResponse: Codable {
    let sessionId: String
    let response: String
    let factsLearned: Int
    let newFacts: [NewFact]
}

struct PersonalizationProgressAPIResponse: Codable {
    let success: Bool
    let data: PersonalizationProgressResponse
}

struct PersonalizationProgressResponse: Codable {
    let topics: [TopicProgress]
    let overallProgress: Int
    let totalFactsLearned: Int
}

struct PersonalizationFactsAPIResponse: Codable {
    let success: Bool
    let data: PersonalizationFactsResponse
}

struct PersonalizationFactsResponse: Codable {
    let factsByCategory: [String: [LearnedFact]]
    let totalFacts: Int
}

struct PersonalizationSummaryAPIResponse: Codable {
    let success: Bool
    let data: PersonalizationSummaryResponse
}

struct PersonalizationSummaryResponse: Codable {
    let summary: String
    let factCount: Int
}

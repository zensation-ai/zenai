import Foundation

// MARK: - Phase 20: Digest & Advanced Analytics API

extension APIService {

    // MARK: - Digest APIs

    /// Generate a daily or weekly digest
    func generateDigest(type: String, context: AIContext = .personal) async throws -> Digest {
        let endpoint = type == "daily" ? "daily" : "weekly"
        guard let url = URL(string: "\(baseURL)/api/\(context.rawValue)/digest/generate/\(endpoint)") else {
            throw APIError.invalidURL
        }

        let bodyData = "{}".data(using: .utf8)!
        var request = try createAuthenticatedRequest(url: url, method: "POST", body: bodyData)
        request.timeoutInterval = 60 // AI generation can take time

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let digestResponse = try Self.createDigestDecoder().decode(DigestResponse.self, from: data)

        guard let digest = digestResponse.data else {
            throw APIError.serverMessage(digestResponse.message ?? "No digest available")
        }

        return digest
    }

    /// Get the latest digest of a specific type
    func getLatestDigest(type: String, context: AIContext = .personal) async throws -> Digest? {
        var urlString = "\(baseURL)/api/\(context.rawValue)/digest/latest"
        if !type.isEmpty {
            urlString += "?type=\(type)"
        }

        guard let url = URL(string: urlString) else {
            throw APIError.invalidURL
        }

        let request = try createAuthenticatedRequest(url: url, method: "GET")
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let digestResponse = try Self.createDigestDecoder().decode(DigestResponse.self, from: data)
        return digestResponse.data
    }

    /// Get digest history
    func getDigestHistory(type: String? = nil, limit: Int = 10, context: AIContext = .personal) async throws -> [Digest] {
        var urlString = "\(baseURL)/api/\(context.rawValue)/digest/history?limit=\(limit)"
        if let type = type {
            urlString += "&type=\(type)"
        }

        guard let url = URL(string: urlString) else {
            throw APIError.invalidURL
        }

        let request = try createAuthenticatedRequest(url: url, method: "GET")
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let historyResponse = try Self.createDigestDecoder().decode(DigestHistoryResponse.self, from: data)
        return historyResponse.data
    }

    /// Get productivity goals
    func getProductivityGoals(context: AIContext = .personal) async throws -> ProductivityGoals {
        guard let url = URL(string: "\(baseURL)/api/\(context.rawValue)/digest/goals") else {
            throw APIError.invalidURL
        }

        let request = try createAuthenticatedRequest(url: url, method: "GET")
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let goalsResponse = try JSONDecoder().decode(ProductivityGoalsResponse.self, from: data)
        return goalsResponse.data
    }

    /// Update productivity goals
    func updateProductivityGoals(_ goals: ProductivityGoals, context: AIContext = .personal) async throws {
        guard let url = URL(string: "\(baseURL)/api/\(context.rawValue)/digest/goals") else {
            throw APIError.invalidURL
        }

        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        let bodyData = try encoder.encode(goals)
        let request = try createAuthenticatedRequest(url: url, method: "PUT", body: bodyData)

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }
    }

    // MARK: - Advanced Analytics APIs

    /// Get comprehensive analytics dashboard
    func getAnalyticsDashboard(context: AIContext = .personal) async throws -> AnalyticsDashboard {
        guard let url = URL(string: "\(baseURL)/api/\(context.rawValue)/analytics/dashboard") else {
            throw APIError.invalidURL
        }

        let request = try createAuthenticatedRequest(url: url, method: "GET")
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let dashboardResponse = try Self.createAnalyticsDecoder().decode(AnalyticsDashboardResponse.self, from: data)
        return dashboardResponse.data
    }

    /// Get productivity score with breakdown
    func getProductivityScore(context: AIContext = .personal) async throws -> ProductivityScoreData {
        guard let url = URL(string: "\(baseURL)/api/\(context.rawValue)/analytics/productivity-score") else {
            throw APIError.invalidURL
        }

        let request = try createAuthenticatedRequest(url: url, method: "GET")
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let scoreResponse = try JSONDecoder().decode(ProductivityScoreResponse.self, from: data)
        return scoreResponse.data
    }

    /// Get pattern analysis
    func getPatterns(context: AIContext = .personal) async throws -> PatternsData {
        guard let url = URL(string: "\(baseURL)/api/\(context.rawValue)/analytics/patterns") else {
            throw APIError.invalidURL
        }

        let request = try createAuthenticatedRequest(url: url, method: "GET")
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let patternsResponse = try JSONDecoder().decode(PatternsResponse.self, from: data)
        return patternsResponse.data
    }

    /// Get period comparison
    func getComparison(period: String = "week", context: AIContext = .personal) async throws -> ComparisonData {
        guard let url = URL(string: "\(baseURL)/api/\(context.rawValue)/analytics/comparison?period=\(period)") else {
            throw APIError.invalidURL
        }

        let request = try createAuthenticatedRequest(url: url, method: "GET")
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let comparisonResponse = try JSONDecoder().decode(ComparisonResponse.self, from: data)
        return comparisonResponse.data
    }

    // MARK: - Private Helpers

    private static func createDigestDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)

            // Try date-only format first
            if let date = dateFormatter.date(from: dateString) {
                return date
            }

            // Try ISO8601 with fractional seconds
            let isoFormatter = ISO8601DateFormatter()
            isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = isoFormatter.date(from: dateString) {
                return date
            }

            // Try ISO8601 without fractional seconds
            isoFormatter.formatOptions = [.withInternetDateTime]
            if let date = isoFormatter.date(from: dateString) {
                return date
            }

            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateString)")
        }
        return decoder
    }

    private static func createAnalyticsDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)
            if let date = isoFormatter.date(from: dateString) {
                return date
            }
            isoFormatter.formatOptions = [.withInternetDateTime]
            if let date = isoFormatter.date(from: dateString) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateString)")
        }
        return decoder
    }
}

// MARK: - Response Types

struct DigestResponse: Codable {
    let success: Bool
    let data: Digest?
    let message: String?
    let cached: Bool?
}

struct DigestHistoryResponse: Codable {
    let success: Bool
    let data: [Digest]
}

struct ProductivityGoals: Codable {
    var dailyIdeasTarget: Int
    var weeklyIdeasTarget: Int
    var focusCategories: [String]
    var enabledInsights: Bool
    var digestTime: String
}

struct ProductivityGoalsResponse: Codable {
    let success: Bool
    let data: ProductivityGoals
}

struct AnalyticsDashboardResponse: Codable {
    let success: Bool
    let data: AnalyticsDashboard
}

struct AnalyticsDashboard: Codable {
    let summary: AnalyticsSummary
    let goals: GoalsData
    let streaks: StreakData
    let trends: TrendsData
    let activity: ActivityData
    let highlights: [AnalyticsHighlight]
    let generatedAt: String
}

struct TrendsData: Codable {
    let weekly: [WeeklyTrendItem]
    let monthly: [MonthlyTrendItem]
}

struct MonthlyTrendItem: Codable {
    let month: Date
    let count: Int
}

struct ActivityData: Codable {
    let byHour: [HourlyActivity]
}

struct AnalyticsHighlight: Codable {
    let id: String
    let title: String
    let type: String
    let category: String
    let priority: String
    let createdAt: Date
}

struct ProductivityScoreResponse: Codable {
    let success: Bool
    let data: ProductivityScoreData
}

struct PatternsResponse: Codable {
    let success: Bool
    let data: PatternsData
}

struct ComparisonResponse: Codable {
    let success: Bool
    let data: ComparisonData
}

// MARK: - AppIntents Extensions for Digest

extension APIService {
    /// Process text and create an idea (for Siri Shortcuts)
    func processText(_ text: String, context: String) async throws -> Idea {
        let aiContext: AIContext = context == "work" ? .work : .personal

        guard let url = URL(string: "\(baseURL)/api/\(aiContext.rawValue)/voice-memo") else {
            throw APIError.invalidURL
        }

        let body = ["text": text]
        let bodyData = try JSONEncoder().encode(body)
        var request = try createAuthenticatedRequest(url: url, method: "POST", body: bodyData)
        request.timeoutInterval = 60

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        // Parse the response
        struct TextIdeaResponse: Codable {
            let success: Bool
            let idea: IdeaData?

            struct IdeaData: Codable {
                let id: String
                let title: String
                let type: String
                let category: String
                let priority: String
                let summary: String
            }
        }

        let ideaResponse = try JSONDecoder().decode(TextIdeaResponse.self, from: data)

        guard let ideaData = ideaResponse.idea else {
            throw APIError.serverMessage("Failed to create idea")
        }

        return Idea(
            id: ideaData.id,
            title: ideaData.title,
            type: IdeaType(rawValue: ideaData.type) ?? .idea,
            category: IdeaCategory(rawValue: ideaData.category) ?? .personal,
            priority: Priority(rawValue: ideaData.priority) ?? .medium,
            summary: ideaData.summary,
            nextSteps: [],
            contextNeeded: [],
            keywords: [],
            rawTranscript: text,
            createdAt: Date(),
            updatedAt: Date()
        )
    }

    /// Search ideas with query (for Siri Shortcuts)
    func searchIdeas(query: String, context: String) async throws -> [Idea] {
        let aiContext: AIContext = context == "work" ? .work : .personal
        return try await searchIdeasInContext(query: query, context: aiContext)
    }

    /// Fetch ideas with optional limit (for Siri Shortcuts)
    func fetchIdeas(context: String, limit: Int = 10) async throws -> [Idea] {
        let aiContext: AIContext = context == "work" ? .work : .personal

        guard let url = URL(string: "\(baseURL)/api/\(aiContext.rawValue)/ideas?limit=\(limit)") else {
            throw APIError.invalidURL
        }

        let request = try createAuthenticatedRequest(url: url, method: "GET")
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let ideasResponse = try Self.createIdeasDecoder().decode(IdeasContextResponse.self, from: data)
        return ideasResponse.ideas
    }

    private static func createIdeasDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)
            if let date = dateFormatter.date(from: dateString) {
                return date
            }
            dateFormatter.formatOptions = [.withInternetDateTime]
            if let date = dateFormatter.date(from: dateString) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateString)")
        }
        return decoder
    }
}

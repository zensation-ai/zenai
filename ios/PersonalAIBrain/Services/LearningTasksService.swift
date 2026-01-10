import Foundation

/// Service for interacting with the Learning Tasks API
/// Enables users to assign topics for the AI to study and deepen knowledge in
final class LearningTasksService {
    static let shared = LearningTasksService()

    private init() {}

    // MARK: - URL Building

    private func buildURL(path: String, queryItems: [URLQueryItem] = []) throws -> URL {
        let context = ContextManager.shared.currentContext
        var components = URLComponents(string: AppEnvironment.apiBaseURL)
        components?.path += "/api/\(context.rawValue)\(path)"
        if !queryItems.isEmpty {
            components?.queryItems = queryItems
        }
        guard let url = components?.url else {
            throw LearningTasksError.serverError("Invalid URL: \(path)")
        }
        return url
    }

    private func addAuthHeader(to request: inout URLRequest) {
        if let apiKey = APIKeyManager.shared.getAPIKey() {
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }
    }

    // MARK: - Learning Tasks

    /// Get all learning tasks
    func getTasks(status: String? = nil, category: String? = nil) async throws -> [LearningTask] {
        var queryItems: [URLQueryItem] = []
        if let status = status {
            queryItems.append(URLQueryItem(name: "status", value: status))
        }
        if let category = category {
            queryItems.append(URLQueryItem(name: "category", value: category))
        }

        let url = try buildURL(path: "/learning-tasks", queryItems: queryItems)

        var request = URLRequest(url: url)
        request.timeoutInterval = AppEnvironment.Timeouts.standard
        addAuthHeader(to: &request)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw LearningTasksError.serverError("Failed to fetch learning tasks")
        }

        struct Response: Codable {
            let success: Bool
            let tasks: [LearningTask]
            let total: Int
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let result = try decoder.decode(Response.self, from: data)
        return result.tasks
    }

    /// Create a new learning task
    func createTask(
        topic: String,
        description: String? = nil,
        category: String? = nil,
        priority: String = "medium",
        generateOutline: Bool = false
    ) async throws -> LearningTask {
        let url = try buildURL(path: "/learning-tasks")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = generateOutline ? AppEnvironment.Timeouts.aiProcessing : AppEnvironment.Timeouts.standard
        addAuthHeader(to: &request)

        var body: [String: Any] = [
            "topic": topic,
            "priority": priority,
            "generate_outline": generateOutline
        ]
        if let description = description {
            body["description"] = description
        }
        if let category = category {
            body["category"] = category
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 201 else {
            throw LearningTasksError.serverError("Failed to create learning task")
        }

        struct Response: Codable {
            let success: Bool
            let task: LearningTask
            let message: String
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let result = try decoder.decode(Response.self, from: data)
        return result.task
    }

    /// Get a specific learning task with sessions
    func getTask(id: String) async throws -> (task: LearningTask, sessions: [LearningSession]) {
        let url = try buildURL(path: "/learning-tasks/\(id)")

        var request = URLRequest(url: url)
        request.timeoutInterval = AppEnvironment.Timeouts.standard
        addAuthHeader(to: &request)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw LearningTasksError.serverError("Failed to fetch learning task")
        }

        struct Response: Codable {
            let success: Bool
            let task: LearningTask
            let sessions: [LearningSession]
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let result = try decoder.decode(Response.self, from: data)
        return (result.task, result.sessions)
    }

    /// Update a learning task
    func updateTask(id: String, updates: [String: Any]) async throws -> LearningTask {
        let url = try buildURL(path: "/learning-tasks/\(id)")

        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = AppEnvironment.Timeouts.standard
        addAuthHeader(to: &request)

        request.httpBody = try JSONSerialization.data(withJSONObject: updates)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw LearningTasksError.serverError("Failed to update learning task")
        }

        struct Response: Codable {
            let success: Bool
            let task: LearningTask
            let message: String
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let result = try decoder.decode(Response.self, from: data)
        return result.task
    }

    /// Delete (archive) a learning task
    func deleteTask(id: String) async throws {
        let url = try buildURL(path: "/learning-tasks/\(id)")

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.timeoutInterval = AppEnvironment.Timeouts.standard
        addAuthHeader(to: &request)

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw LearningTasksError.serverError("Failed to delete learning task")
        }
    }

    // MARK: - Study Sessions

    /// Log a study session for a task
    func logSession(
        taskId: String,
        sessionType: String = "study",
        durationMinutes: Int? = nil,
        notes: String? = nil,
        keyLearnings: [String]? = nil,
        understandingLevel: Int? = nil
    ) async throws -> LearningSession {
        let url = try buildURL(path: "/learning-tasks/\(taskId)/session")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = AppEnvironment.Timeouts.standard
        addAuthHeader(to: &request)

        var body: [String: Any] = ["session_type": sessionType]
        if let duration = durationMinutes {
            body["duration_minutes"] = duration
        }
        if let notes = notes {
            body["notes"] = notes
        }
        if let learnings = keyLearnings {
            body["key_learnings"] = learnings
        }
        if let level = understandingLevel {
            body["understanding_level"] = level
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 201 else {
            throw LearningTasksError.serverError("Failed to log study session")
        }

        struct Response: Codable {
            let success: Bool
            let session: LearningSession
            let progress: Int
            let message: String
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let result = try decoder.decode(Response.self, from: data)
        return result.session
    }

    // MARK: - Statistics

    /// Get learning statistics
    func getStats() async throws -> LearningStats {
        let url = try buildURL(path: "/learning-stats")

        var request = URLRequest(url: url)
        request.timeoutInterval = AppEnvironment.Timeouts.standard
        addAuthHeader(to: &request)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw LearningTasksError.serverError("Failed to fetch learning stats")
        }

        struct Response: Codable {
            let success: Bool
            let stats: LearningStats
        }

        let decoder = JSONDecoder()
        let result = try decoder.decode(Response.self, from: data)
        return result.stats
    }

    /// Get daily learning summary
    func getDailySummary() async throws -> DailyLearningSummary {
        let url = try buildURL(path: "/learning-daily-summary")

        var request = URLRequest(url: url)
        request.timeoutInterval = AppEnvironment.Timeouts.standard
        addAuthHeader(to: &request)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw LearningTasksError.serverError("Failed to fetch daily summary")
        }

        struct Response: Codable {
            let success: Bool
            let summary: DailyLearningSummary
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let result = try decoder.decode(Response.self, from: data)
        return result.summary
    }

    // MARK: - AI Features

    /// Generate a learning outline for a task
    func generateOutline(taskId: String) async throws -> String {
        let url = try buildURL(path: "/learning-tasks/\(taskId)/generate-outline")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = AppEnvironment.Timeouts.aiProcessing
        addAuthHeader(to: &request)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw LearningTasksError.serverError("Failed to generate outline")
        }

        struct Response: Codable {
            let success: Bool
            let outline: String
            let message: String
        }

        let decoder = JSONDecoder()
        let result = try decoder.decode(Response.self, from: data)
        return result.outline
    }

    /// Get available learning categories
    func getCategories() async throws -> [String] {
        let url = try buildURL(path: "/learning-categories")

        var request = URLRequest(url: url)
        request.timeoutInterval = AppEnvironment.Timeouts.standard
        addAuthHeader(to: &request)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw LearningTasksError.serverError("Failed to fetch categories")
        }

        struct Response: Codable {
            let success: Bool
            let categories: [String]
        }

        let decoder = JSONDecoder()
        let result = try decoder.decode(Response.self, from: data)
        return result.categories
    }
}

// MARK: - Models

struct LearningTask: Codable, Identifiable {
    let id: String
    let userId: String?
    let context: String?
    let topic: String
    let description: String?
    let category: String?
    let priority: String
    let status: String
    let startDate: Date?
    let targetCompletionDate: Date?
    let completedDate: Date?
    let lastStudyDate: Date?
    let studyCount: Int
    let totalStudyMinutes: Int
    let progressPercent: Int
    let learningOutline: String?
    let keyConcepts: [String]?
    let summary: String?
    let createdAt: Date?
    let updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case context
        case topic
        case description
        case category
        case priority
        case status
        case startDate = "start_date"
        case targetCompletionDate = "target_completion_date"
        case completedDate = "completed_date"
        case lastStudyDate = "last_study_date"
        case studyCount = "study_count"
        case totalStudyMinutes = "total_study_minutes"
        case progressPercent = "progress_percent"
        case learningOutline = "learning_outline"
        case keyConcepts = "key_concepts"
        case summary
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    // Computed properties for UI
    var priorityColor: String {
        switch priority {
        case "high": return "red"
        case "medium": return "orange"
        case "low": return "green"
        default: return "gray"
        }
    }

    var statusLabel: String {
        switch status {
        case "active": return "Aktiv"
        case "paused": return "Pausiert"
        case "completed": return "Abgeschlossen"
        case "archived": return "Archiviert"
        default: return status.capitalized
        }
    }

    var categoryLabel: String {
        switch category {
        case "leadership": return "Führung"
        case "technology": return "Technologie"
        case "business": return "Business"
        case "personal_development": return "Persönliche Entwicklung"
        case "communication": return "Kommunikation"
        case "creativity": return "Kreativität"
        case "productivity": return "Produktivität"
        case "health": return "Gesundheit"
        case "finance": return "Finanzen"
        default: return category?.capitalized ?? "Sonstiges"
        }
    }
}

struct LearningSession: Codable, Identifiable {
    let id: String
    let taskId: String
    let userId: String?
    let sessionType: String
    let durationMinutes: Int?
    let notes: String?
    let keyLearnings: [String]?
    let questions: [String]?
    let aiSummary: String?
    let aiFeedback: String?
    let understandingLevel: Int?
    let createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case taskId = "task_id"
        case userId = "user_id"
        case sessionType = "session_type"
        case durationMinutes = "duration_minutes"
        case notes
        case keyLearnings = "key_learnings"
        case questions
        case aiSummary = "ai_summary"
        case aiFeedback = "ai_feedback"
        case understandingLevel = "understanding_level"
        case createdAt = "created_at"
    }

    var sessionTypeLabel: String {
        switch sessionType {
        case "study": return "Lernen"
        case "practice": return "Übung"
        case "review": return "Wiederholung"
        case "quiz": return "Quiz"
        case "reflection": return "Reflexion"
        default: return sessionType.capitalized
        }
    }
}

struct LearningStats: Codable {
    let totalTasks: Int
    let activeTasks: Int
    let completedTasks: Int
    let totalStudyMinutes: Int
    let totalSessions: Int
    let categories: [String: Int]
    let avgProgress: Int
    let insightsCount: Int

    enum CodingKeys: String, CodingKey {
        case totalTasks = "total_tasks"
        case activeTasks = "active_tasks"
        case completedTasks = "completed_tasks"
        case totalStudyMinutes = "total_study_minutes"
        case totalSessions = "total_sessions"
        case categories
        case avgProgress = "avg_progress"
        case insightsCount = "insights_count"
    }

    var formattedStudyTime: String {
        let hours = totalStudyMinutes / 60
        let minutes = totalStudyMinutes % 60
        if hours > 0 {
            return "\(hours)h \(minutes)m"
        }
        return "\(minutes)m"
    }
}

struct DailyLearningSummary: Codable {
    let tasksStudiedToday: Int
    let minutesToday: Int
    let sessionsToday: Int
    let streakDays: Int
    let nextRecommendedTask: LearningTask?

    enum CodingKeys: String, CodingKey {
        case tasksStudiedToday = "tasks_studied_today"
        case minutesToday = "minutes_today"
        case sessionsToday = "sessions_today"
        case streakDays = "streak_days"
        case nextRecommendedTask = "next_recommended_task"
    }
}

// MARK: - Error

enum LearningTasksError: LocalizedError {
    case serverError(String)
    case networkError(Error)
    case decodingError(Error)

    var errorDescription: String? {
        switch self {
        case .serverError(let message):
            return message
        case .networkError(let error):
            return "Netzwerkfehler: \(error.localizedDescription)"
        case .decodingError(let error):
            return "Dekodierungsfehler: \(error.localizedDescription)"
        }
    }
}

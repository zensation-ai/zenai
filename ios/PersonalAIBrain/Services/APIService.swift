import Foundation

@MainActor
class APIService: ObservableObject {
    // API URL is now configured via Environment.swift
    // - Simulator: Uses localhost automatically
    // - Real Device: Configure via Info.plist (DevelopmentIP key) or environment variable
    let baseURL: String

    @Published var isLoading = false
    @Published var error: String?

    /// Shared decoder configured for PostgreSQL timestamps
    private static func createDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        configureDecoderDateStrategy(decoder)
        return decoder
    }

    /// Shared decoder with snake_case key conversion (for models without CodingKeys)
    private static func createSnakeCaseDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        configureDecoderDateStrategy(decoder)
        return decoder
    }

    /// Configure decoder for PostgreSQL timestamps with optional milliseconds
    private static func configureDecoderDateStrategy(_ decoder: JSONDecoder) {
        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)
            // Try with milliseconds first (PostgreSQL format)
            if let date = dateFormatter.date(from: dateString) {
                return date
            }
            // Fall back to without milliseconds
            dateFormatter.formatOptions = [.withInternetDateTime]
            if let date = dateFormatter.date(from: dateString) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date format: \(dateString)")
        }
    }

    init() {
        self.baseURL = AppEnvironment.apiBaseURL
        print("📱 APIService: Using \(self.baseURL) (\(AppEnvironment.isSimulator ? "Simulator" : "Real Device"))")
    }

    // MARK: - Health Check

    func checkHealth() async -> Bool {
        guard let url = URL(string: "\(baseURL)/api/health") else { return false }

        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                return false
            }

            let healthResponse = try JSONDecoder().decode(HealthResponse.self, from: data)
            return healthResponse.status == "healthy"
        } catch {
            print("Health check failed: \(error)")
            return false
        }
    }

    // MARK: - Ideas

    func fetchIdeas() async throws -> [Idea] {
        isLoading = true
        defer { isLoading = false }

        guard let url = URL(string: "\(baseURL)/api/ideas") else {
            print("❌ Invalid URL: \(baseURL)/api/ideas")
            throw APIError.invalidURL
        }

        print("🌐 Fetching from: \(url.absoluteString)")

        do {
            let (data, response) = try await URLSession.shared.data(from: url)

            guard let httpResponse = response as? HTTPURLResponse else {
                print("❌ Invalid response type")
                throw APIError.invalidResponse
            }

            print("📡 Response status: \(httpResponse.statusCode)")

            guard httpResponse.statusCode == 200 else {
                print("❌ Server error: \(httpResponse.statusCode)")
                throw APIError.serverError(statusCode: httpResponse.statusCode)
            }

            let ideasResponse = try Self.createDecoder().decode(IdeasResponse.self, from: data)
            print("✅ Decoded \(ideasResponse.ideas.count) ideas")
            return ideasResponse.ideas
        } catch let error as URLError {
            print("❌ Network error: \(error.localizedDescription) (code: \(error.code.rawValue))")
            throw error
        } catch {
            print("❌ Unexpected error: \(error)")
            throw error
        }
    }

    func searchIdeas(query: String) async throws -> [Idea] {
        isLoading = true
        defer { isLoading = false }

        guard let url = URL(string: "\(baseURL)/api/ideas/search") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body = ["query": query, "limit": 10] as [String: Any]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let searchResponse = try Self.createDecoder().decode(SearchResponse.self, from: data)
        return searchResponse.ideas
    }

    /// Context-aware search for ideas
    func searchIdeasInContext(query: String, context: AIContext) async throws -> [Idea] {
        isLoading = true
        defer { isLoading = false }

        guard let url = URL(string: "\(baseURL)/api/\(context.rawValue)/ideas/search") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body = ["query": query, "limit": 20] as [String: Any]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        // Fall back to general search if context endpoint doesn't exist
        if httpResponse.statusCode == 404 {
            return try await searchIdeas(query: query)
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: httpResponse.statusCode)
        }

        // Use createDecoder() - Idea model has its own CodingKeys
        let searchResponse = try Self.createDecoder().decode(SearchContextResponse.self, from: data)
        return searchResponse.ideas
    }

    // MARK: - Voice Memo Processing

    func processVoiceMemo(audioData: Data, filename: String) async throws -> VoiceMemoResponse {
        isLoading = true
        defer { isLoading = false }

        guard let url = URL(string: "\(baseURL)/api/voice-memo") else {
            throw APIError.invalidURL
        }

        // Create multipart form data
        let boundary = UUID().uuidString
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 120 // 2 minutes for transcription

        var body = Data()

        // Add audio file
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"audio\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: audio/wav\r\n\r\n".data(using: .utf8)!)
        body.append(audioData)
        body.append("\r\n".data(using: .utf8)!)
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            if let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data) {
                throw APIError.serverMessage(errorResponse.error)
            }
            throw APIError.serverError(statusCode: httpResponse.statusCode)
        }

        return try Self.createDecoder().decode(VoiceMemoResponse.self, from: data)
    }

    func processText(_ text: String) async throws -> VoiceMemoResponse {
        isLoading = true
        defer { isLoading = false }

        guard let url = URL(string: "\(baseURL)/api/voice-memo/text") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 60

        let body = ["text": text]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        return try Self.createDecoder().decode(VoiceMemoResponse.self, from: data)
    }

    // MARK: - Meetings

    func fetchMeetings() async throws -> [Meeting] {
        isLoading = true
        defer { isLoading = false }

        guard let url = URL(string: "\(baseURL)/api/meetings") else {
            throw APIError.invalidURL
        }

        let (data, response) = try await URLSession.shared.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let meetingsResponse = try Self.createDecoder().decode(MeetingsResponse.self, from: data)
        return meetingsResponse.meetings
    }

    func createMeeting(title: String, date: Date, meetingType: MeetingType, participants: [String], location: String?) async throws -> Meeting {
        isLoading = true
        defer { isLoading = false }

        guard let url = URL(string: "\(baseURL)/api/meetings") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let dateFormatter = ISO8601DateFormatter()
        let body: [String: Any] = [
            "title": title,
            "date": dateFormatter.string(from: date),
            "meeting_type": meetingType.rawValue,
            "participants": participants,
            "location": location ?? ""
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 201 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let createResponse = try Self.createDecoder().decode(CreateMeetingResponse.self, from: data)
        return createResponse.meeting
    }

    func getMeetingNotes(meetingId: String) async throws -> MeetingNotes? {
        guard let url = URL(string: "\(baseURL)/api/meetings/\(meetingId)/notes") else {
            throw APIError.invalidURL
        }

        let (data, response) = try await URLSession.shared.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 404 {
            return nil
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: httpResponse.statusCode)
        }

        let notesResponse = try Self.createDecoder().decode(MeetingNotesResponse.self, from: data)
        return notesResponse.notes
    }

    func addMeetingNotes(meetingId: String, transcript: String) async throws -> MeetingNotes {
        isLoading = true
        defer { isLoading = false }

        guard let url = URL(string: "\(baseURL)/api/meetings/\(meetingId)/notes") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 120

        let body = ["transcript": transcript]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let notesResponse = try Self.createDecoder().decode(AddNotesResponse.self, from: data)
        return notesResponse.notes
    }

    // MARK: - Profile

    func getProfileStats() async throws -> ProfileStatsResponse {
        guard let url = URL(string: "\(baseURL)/api/profile/stats") else {
            throw APIError.invalidURL
        }

        let (data, response) = try await URLSession.shared.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        return try JSONDecoder().decode(ProfileStatsResponse.self, from: data)
    }

    func getRecommendations() async throws -> Recommendations {
        guard let url = URL(string: "\(baseURL)/api/profile/recommendations") else {
            throw APIError.invalidURL
        }

        let (data, response) = try await URLSession.shared.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let recommendationsResponse = try JSONDecoder().decode(RecommendationsResponse.self, from: data)
        return recommendationsResponse.recommendations
    }

    func setAutoPriority(enabled: Bool) async throws {
        guard let url = URL(string: "\(baseURL)/api/profile/auto-priority") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body = ["enabled": enabled]
        request.httpBody = try JSONEncoder().encode(body)

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }
    }

    func trackInteraction(ideaId: String?, interactionType: String) async {
        guard let url = URL(string: "\(baseURL)/api/profile/track") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var body: [String: Any] = ["interaction_type": interactionType]
        if let ideaId = ideaId {
            body["idea_id"] = ideaId
        }

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let _ = try await URLSession.shared.data(for: request)
        } catch {
            print("Track interaction failed: \(error)")
        }
    }

    // MARK: - Swipe Actions

    func sendSwipeAction(ideaId: String, action: String) async throws {
        guard let url = URL(string: "\(baseURL)/api/ideas/\(ideaId)/swipe") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body = ["action": action]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            if let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data) {
                throw APIError.serverMessage(errorResponse.error)
            }
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }
    }

    func archiveIdea(ideaId: String) async throws {
        guard let url = URL(string: "\(baseURL)/api/ideas/\(ideaId)/archive") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "PUT"

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            if let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data) {
                throw APIError.serverMessage(errorResponse.error)
            }
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }
    }

    func deleteIdea(id: String) async throws {
        guard let url = URL(string: "\(baseURL)/api/ideas/\(id)") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            if let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data) {
                throw APIError.serverMessage(errorResponse.error)
            }
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }
    }

    // MARK: - Phase 17: Archive

    /// Archive an idea (context-aware)
    func archiveIdea(id: String, context: AIContext) async throws {
        guard let url = URL(string: "\(baseURL)/api/\(context.rawValue)/ideas/\(id)/archive") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "PUT"

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            if let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data) {
                throw APIError.serverMessage(errorResponse.error)
            }
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }
    }

    /// Restore an archived idea (context-aware)
    func restoreIdea(id: String, context: AIContext) async throws {
        guard let url = URL(string: "\(baseURL)/api/\(context.rawValue)/ideas/\(id)/restore") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "PUT"

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            if let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data) {
                throw APIError.serverMessage(errorResponse.error)
            }
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }
    }

    /// Fetch archived ideas for a context
    func fetchArchivedIdeas(context: AIContext) async throws -> [Idea] {
        isLoading = true
        defer { isLoading = false }

        guard let url = URL(string: "\(baseURL)/api/\(context.rawValue)/ideas/archived") else {
            throw APIError.invalidURL
        }

        let (data, response) = try await URLSession.shared.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let ideasResponse = try Self.createDecoder().decode(IdeasResponse.self, from: data)
        return ideasResponse.ideas
    }

    // MARK: - Phase 4: Integrations

    func getIntegrations() async throws -> [Integration] {
        guard let url = URL(string: "\(baseURL)/api/integrations") else {
            throw APIError.invalidURL
        }

        let (data, response) = try await URLSession.shared.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let integrationsResponse = try JSONDecoder().decode(IntegrationsResponse.self, from: data)
        return integrationsResponse.integrations
    }

    func syncIntegration(provider: String) async throws -> SyncResult {
        guard let url = URL(string: "\(baseURL)/api/integrations/\(provider)/sync") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 60

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        return try JSONDecoder().decode(SyncResult.self, from: data)
    }

    func getUpcomingCalendarEvents(hours: Int = 24) async throws -> [CalendarEvent] {
        guard let url = URL(string: "\(baseURL)/api/integrations/microsoft/events?hours=\(hours)") else {
            throw APIError.invalidURL
        }

        let (data, response) = try await URLSession.shared.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let eventsResponse = try Self.createDecoder().decode(CalendarEventsResponse.self, from: data)
        return eventsResponse.events
    }
}

// MARK: - Response Models

struct HealthResponse: Codable {
    let status: String
}

struct IdeasResponse: Codable {
    let ideas: [Idea]
    let pagination: IdeasPagination?
}

struct IdeasPagination: Codable {
    let total: Int
    let limit: Int
    let offset: Int
    let hasMore: Bool
}

struct SearchResponse: Codable {
    let ideas: [Idea]
}

struct SearchContextResponse: Codable {
    let ideas: [Idea]
    let query: String?
    let context: String?
    let total: Int?
}

struct VoiceMemoResponse: Codable {
    let success: Bool
    let ideaId: String
    let transcript: String?
    let structured: StructuredIdea

    enum CodingKeys: String, CodingKey {
        case success
        case ideaId = "ideaId"
        case transcript
        case structured
    }
}

struct StructuredIdea: Codable {
    let title: String
    let type: String
    let category: String
    let priority: String
    let summary: String?
    let nextSteps: [String]?
    let contextNeeded: [String]?
    let keywords: [String]?

    enum CodingKeys: String, CodingKey {
        case title, type, category, priority, summary
        case nextSteps = "next_steps"
        case contextNeeded = "context_needed"
        case keywords
    }
}

struct ErrorResponse: Codable {
    let error: String
}

struct MeetingsResponse: Codable {
    let meetings: [Meeting]
}

struct CreateMeetingResponse: Codable {
    let success: Bool
    let meeting: Meeting
}

struct MeetingNotesResponse: Codable {
    let notes: MeetingNotes?
}

struct AddNotesResponse: Codable {
    let success: Bool
    let notes: MeetingNotes
}

struct ProfileStatsResponse: Codable {
    let totalIdeas: Int
    let totalMeetings: Int
    let avgIdeasPerDay: Double
    let autoPriorityEnabled: Bool

    enum CodingKeys: String, CodingKey {
        case totalIdeas = "total_ideas"
        case totalMeetings = "total_meetings"
        case avgIdeasPerDay = "avg_ideas_per_day"
        case autoPriorityEnabled = "auto_priority_enabled"
    }
}

struct RecommendationsResponse: Codable {
    let recommendations: Recommendations
}

// Phase 4: Integration Models

struct IntegrationsResponse: Codable {
    let integrations: [Integration]
}

struct Integration: Codable, Identifiable {
    let id: String
    let provider: String
    let name: String
    let isEnabled: Bool
    let isConnected: Bool
    let features: [String]?
    let lastSyncAt: Date?
    let syncStatus: String

    enum CodingKeys: String, CodingKey {
        case id, provider, name, features
        case isEnabled = "isEnabled"
        case isConnected = "isConnected"
        case lastSyncAt = "lastSyncAt"
        case syncStatus = "syncStatus"
    }
}

struct SyncResult: Codable {
    let success: Bool
    let message: String?
    let synced: Int?
    let created: Int?
    let updated: Int?
}

struct CalendarEventsResponse: Codable {
    let events: [CalendarEvent]
}

struct CalendarEvent: Codable, Identifiable {
    let id: String
    let title: String
    let description: String?
    let startTime: Date
    let endTime: Date
    let location: String?
    let isOnline: Bool
    let onlineMeetingUrl: String?

    enum CodingKeys: String, CodingKey {
        case id, title, description, location
        case startTime = "startTime"
        case endTime = "endTime"
        case isOnline = "isOnline"
        case onlineMeetingUrl = "onlineMeetingUrl"
    }
}

// MARK: - API Errors

enum APIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case serverError(statusCode: Int)
    case serverMessage(String)
    case encodingError

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Ungültige URL"
        case .invalidResponse:
            return "Ungültige Server-Antwort"
        case .serverError(let code):
            return "Server-Fehler (Code: \(code))"
        case .serverMessage(let message):
            return message
        case .encodingError:
            return "Fehler beim Kodieren der Daten"
        }
    }
}

// MARK: - Context-Aware API Extension (Phase 6)

extension APIService {
    /// Submit voice memo with audio data
    /// - Parameters:
    ///   - audioData: Audio data to transcribe
    ///   - context: The AI context (personal/work)
    ///   - persona: Optional persona ID (e.g., "companion", "coach", "coordinator")
    func submitVoiceMemo(
        audioData: Data,
        context: AIContext,
        persona: String? = nil,
        completion: @escaping (Result<VoiceMemoContextResponse, Error>) -> Void
    ) {
        guard let url = URL(string: "\(baseURL)/api/\(context.rawValue)/voice-memo") else {
            completion(.failure(APIError.invalidURL))
            return
        }

        // Create multipart form data
        let boundary = UUID().uuidString
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 120

        var body = Data()

        // Add audio file
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"audio\"; filename=\"recording.wav\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: audio/wav\r\n\r\n".data(using: .utf8)!)
        body.append(audioData)
        body.append("\r\n".data(using: .utf8)!)

        // Add persona if specified
        if let persona = persona {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"persona\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(persona)\r\n".data(using: .utf8)!)
        }

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    completion(.failure(error))
                    return
                }

                guard let data = data,
                      let httpResponse = response as? HTTPURLResponse else {
                    completion(.failure(APIError.invalidResponse))
                    return
                }

                guard httpResponse.statusCode == 200 else {
                    completion(.failure(APIError.serverError(statusCode: httpResponse.statusCode)))
                    return
                }

                do {
                    let response = try Self.createSnakeCaseDecoder().decode(VoiceMemoContextResponse.self, from: data)
                    completion(.success(response))
                } catch {
                    completion(.failure(error))
                }
            }
        }.resume()
    }

    /// Submit voice memo as text
    /// - Parameters:
    ///   - text: The text to process
    ///   - context: The AI context (personal/work)
    ///   - persona: Optional persona ID (e.g., "companion", "coach", "coordinator")
    func submitVoiceMemo(
        text: String,
        context: AIContext,
        persona: String? = nil,
        completion: @escaping (Result<VoiceMemoContextResponse, Error>) -> Void
    ) {
        guard let url = URL(string: "\(baseURL)/api/\(context.rawValue)/voice-memo") else {
            completion(.failure(APIError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 60

        var body: [String: Any] = ["text": text]
        if let persona = persona {
            body["persona"] = persona
        }

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } catch {
            completion(.failure(error))
            return
        }

        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    completion(.failure(error))
                    return
                }

                guard let data = data,
                      let httpResponse = response as? HTTPURLResponse else {
                    completion(.failure(APIError.invalidResponse))
                    return
                }

                guard httpResponse.statusCode == 200 else {
                    completion(.failure(APIError.serverError(statusCode: httpResponse.statusCode)))
                    return
                }

                do {
                    let response = try Self.createSnakeCaseDecoder().decode(VoiceMemoContextResponse.self, from: data)
                    completion(.success(response))
                } catch {
                    completion(.failure(error))
                }
            }
        }.resume()
    }

    /// Submit media (photo or video)
    func submitMedia(
        data: Data,
        filename: String,
        context: AIContext,
        completion: @escaping (Result<MediaUploadResponse, Error>) -> Void
    ) {
        guard let url = URL(string: "\(baseURL)/api/\(context.rawValue)/media") else {
            completion(.failure(APIError.invalidURL))
            return
        }

        // Create multipart form data
        let boundary = UUID().uuidString
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 180 // 3 minutes for video uploads

        var body = Data()

        // Determine content type
        let contentType: String
        if filename.hasSuffix(".jpg") || filename.hasSuffix(".jpeg") {
            contentType = "image/jpeg"
        } else if filename.hasSuffix(".png") {
            contentType = "image/png"
        } else if filename.hasSuffix(".mov") || filename.hasSuffix(".mp4") {
            contentType = "video/quicktime"
        } else {
            contentType = "application/octet-stream"
        }

        // Add media file
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"media\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(contentType)\r\n\r\n".data(using: .utf8)!)
        body.append(data)
        body.append("\r\n".data(using: .utf8)!)
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

        URLSession.shared.dataTask(with: request) { responseData, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    completion(.failure(error))
                    return
                }

                guard let responseData = responseData,
                      let httpResponse = response as? HTTPURLResponse else {
                    completion(.failure(APIError.invalidResponse))
                    return
                }

                guard httpResponse.statusCode == 200 else {
                    completion(.failure(APIError.serverError(statusCode: httpResponse.statusCode)))
                    return
                }

                do {
                    let response = try Self.createSnakeCaseDecoder().decode(MediaUploadResponse.self, from: responseData)
                    completion(.success(response))
                } catch {
                    completion(.failure(error))
                }
            }
        }.resume()
    }

    /// Submit media (photo or video) with optional voice context
    func submitMediaWithVoice(
        mediaData: Data,
        mediaFilename: String,
        voiceData: Data?,
        context: AIContext,
        completion: @escaping (Result<MediaUploadResponse, Error>) -> Void
    ) {
        guard let url = URL(string: "\(baseURL)/api/\(context.rawValue)/media-with-voice") else {
            completion(.failure(APIError.invalidURL))
            return
        }

        // Create multipart form data
        let boundary = UUID().uuidString
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 180 // 3 minutes for uploads

        var body = Data()

        // Determine content type for media
        let contentType: String
        if mediaFilename.hasSuffix(".jpg") || mediaFilename.hasSuffix(".jpeg") {
            contentType = "image/jpeg"
        } else if mediaFilename.hasSuffix(".png") {
            contentType = "image/png"
        } else if mediaFilename.hasSuffix(".mov") || mediaFilename.hasSuffix(".mp4") {
            contentType = "video/quicktime"
        } else {
            contentType = "application/octet-stream"
        }

        // Add media file
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"media\"; filename=\"\(mediaFilename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(contentType)\r\n\r\n".data(using: .utf8)!)
        body.append(mediaData)
        body.append("\r\n".data(using: .utf8)!)

        // Add voice file if present
        if let voice = voiceData {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"voice\"; filename=\"voice.m4a\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: audio/m4a\r\n\r\n".data(using: .utf8)!)
            body.append(voice)
            body.append("\r\n".data(using: .utf8)!)
        }

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

        URLSession.shared.dataTask(with: request) { responseData, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    completion(.failure(error))
                    return
                }

                guard let responseData = responseData,
                      let httpResponse = response as? HTTPURLResponse else {
                    completion(.failure(APIError.invalidResponse))
                    return
                }

                guard httpResponse.statusCode == 200 else {
                    completion(.failure(APIError.serverError(statusCode: httpResponse.statusCode)))
                    return
                }

                do {
                    let response = try Self.createSnakeCaseDecoder().decode(MediaUploadResponse.self, from: responseData)
                    completion(.success(response))
                } catch {
                    completion(.failure(error))
                }
            }
        }.resume()
    }

    /// Fetch stories (grouped related content)
    func fetchStories(
        query: String? = nil,
        completion: @escaping (Result<[Story], Error>) -> Void
    ) {
        var urlString = "\(baseURL)/api/stories"
        if let query = query {
            urlString += "?query=\(query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"
        }

        guard let url = URL(string: urlString) else {
            completion(.failure(APIError.invalidURL))
            return
        }

        URLSession.shared.dataTask(with: url) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    completion(.failure(error))
                    return
                }

                guard let data = data,
                      let httpResponse = response as? HTTPURLResponse else {
                    completion(.failure(APIError.invalidResponse))
                    return
                }

                guard httpResponse.statusCode == 200 else {
                    completion(.failure(APIError.serverError(statusCode: httpResponse.statusCode)))
                    return
                }

                do {
                    let response = try Self.createDecoder().decode(StoriesResponse.self, from: data)
                    completion(.success(response.stories))
                } catch {
                    completion(.failure(error))
                }
            }
        }.resume()
    }

    /// Fetch ideas from specific context (callback version)
    func fetchIdeas(
        context: AIContext,
        completion: @escaping (Result<[Idea], Error>) -> Void
    ) {
        guard let url = URL(string: "\(baseURL)/api/\(context.rawValue)/ideas") else {
            completion(.failure(NSError(domain: "Invalid URL", code: -1)))
            return
        }

        URLSession.shared.dataTask(with: url) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    completion(.failure(error))
                    return
                }

                guard let data = data else {
                    completion(.failure(NSError(domain: "No data", code: -1)))
                    return
                }

                do {
                    // Use createDecoder() - Idea model has its own CodingKeys
                    let response = try Self.createDecoder().decode(IdeasContextResponse.self, from: data)
                    completion(.success(response.ideas))
                } catch {
                    completion(.failure(error))
                }
            }
        }.resume()
    }

    /// Fetch ideas for a specific context (async version)
    func fetchIdeasForContext(context: AIContext) async throws -> [Idea] {
        print("🔍 fetchIdeasForContext called for context: \(context.rawValue)")

        // Try context-specific endpoint first
        guard let url = URL(string: "\(baseURL)/api/\(context.rawValue)/ideas") else {
            print("❌ Invalid URL for context endpoint")
            throw APIError.invalidURL
        }

        print("🌐 Trying context endpoint: \(url.absoluteString)")

        do {
            let (data, response) = try await URLSession.shared.data(from: url)

            guard let httpResponse = response as? HTTPURLResponse else {
                print("❌ Invalid HTTP response")
                throw APIError.invalidResponse
            }

            print("📡 Context endpoint response: \(httpResponse.statusCode)")

            // If context-specific endpoint doesn't exist, fall back to general endpoint
            if httpResponse.statusCode == 404 {
                print("⚠️ Context endpoint returned 404, falling back to general endpoint")
                return try await fetchIdeas()
            }

            guard httpResponse.statusCode == 200 else {
                print("❌ Context endpoint error: \(httpResponse.statusCode)")
                throw APIError.serverError(statusCode: httpResponse.statusCode)
            }

            // Use createDecoder() - Idea model has its own CodingKeys
            do {
                let ideasResponse = try Self.createDecoder().decode(IdeasContextResponse.self, from: data)
                print("✅ Decoded \(ideasResponse.ideas.count) ideas for context '\(context.rawValue)'")
                return ideasResponse.ideas
            } catch {
                print("❌ Decoding IdeasContextResponse failed: \(error)")
                // Try to print raw JSON for debugging
                if let jsonString = String(data: data, encoding: .utf8) {
                    print("📄 Raw JSON (first 500 chars): \(String(jsonString.prefix(500)))")
                }
                throw error
            }
        } catch let error as URLError where error.code == .cannotConnectToHost {
            // Fall back to general endpoint if context endpoint fails
            print("⚠️ Cannot connect to context endpoint, falling back to general endpoint")
            return try await fetchIdeas()
        } catch {
            print("❌ fetchIdeasForContext error: \(error)")
            throw error
        }
    }

    /// Fetch context-specific statistics
    func fetchContextStats(
        context: AIContext,
        completion: @escaping (Result<ContextStatsResponse, Error>) -> Void
    ) {
        guard let url = URL(string: "\(baseURL)/api/\(context.rawValue)/stats") else {
            completion(.failure(NSError(domain: "Invalid URL", code: -1)))
            return
        }

        URLSession.shared.dataTask(with: url) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    completion(.failure(error))
                    return
                }

                guard let data = data else {
                    completion(.failure(NSError(domain: "No data", code: -1)))
                    return
                }

                do {
                    let stats = try Self.createSnakeCaseDecoder().decode(ContextStatsResponse.self, from: data)
                    completion(.success(stats))
                } catch {
                    completion(.failure(error))
                }
            }
        }.resume()
    }
}

// MARK: - Context Response Types

struct VoiceMemoContextResponse: Codable {
    let success: Bool
    let context: String
    let persona: String
    let mode: String
    let idea: IdeaContextResponse?
    let thought: ThoughtContextResponse?
    let message: String?
    let processingTime: Int
}

struct IdeaContextResponse: Codable {
    let id: String
    let title: String
    let type: String
    let category: String
    let priority: String
    let summary: String
}

struct ThoughtContextResponse: Codable {
    let id: String
    let rawInput: String
}

struct ContextStatsResponse: Codable {
    let context: String
    let persona: PersonaContextInfo
    let stats: StatsContextInfo
}

struct PersonaContextInfo: Codable {
    let name: String
    let icon: String
}

struct StatsContextInfo: Codable {
    let totalIdeas: Int
    let looseThoughts: Int
    let readyClusters: Int
}

struct IdeasContextResponse: Codable {
    let ideas: [Idea]
}

// MARK: - Media Upload Response Types

struct MediaUploadResponse: Codable {
    let success: Bool
    let mediaId: String
    let mediaType: String
    let url: String?
    let processingStatus: String
    let message: String?
}

// MARK: - Story Response Types

struct StoriesResponse: Codable {
    let stories: [Story]
    let total: Int
}

struct Story: Codable, Identifiable {
    let id: String
    let title: String
    let description: String?
    let items: [StoryItem]
    let createdAt: Date
    let updatedAt: Date
    let itemCount: Int

    enum CodingKeys: String, CodingKey {
        case id, title, description, items
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case itemCount = "item_count"
    }
}

struct StoryItem: Codable, Identifiable {
    let id: String
    let type: StoryItemType
    let content: String
    let mediaUrl: String?
    let timestamp: Date

    enum CodingKeys: String, CodingKey {
        case id, type, content, timestamp
        case mediaUrl = "media_url"
    }
}

enum StoryItemType: String, Codable {
    case text
    case audio
    case photo
    case video
    case idea
}

// MARK: - Training API Extension (Phase 6)

extension APIService {
    /// Fetch training history for a context
    func fetchTrainingHistory(context: AIContext) async throws -> [TrainingItem] {
        guard let url = URL(string: "\(baseURL)/api/\(context.rawValue)/training") else {
            throw APIError.invalidURL
        }

        let (data, response) = try await URLSession.shared.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let trainingResponse = try Self.createSnakeCaseDecoder().decode(TrainingHistoryResponse.self, from: data)
        return trainingResponse.trainings
    }

    /// Submit a new training correction
    func submitTraining(
        ideaId: String,
        context: AIContext,
        trainingType: TrainingType,
        correctedCategory: IdeaCategory?,
        correctedPriority: Priority?,
        correctedType: IdeaType?,
        toneFeedback: ToneFeedback?,
        feedback: String?
    ) async throws -> TrainingItem {
        guard let url = URL(string: "\(baseURL)/api/\(context.rawValue)/training") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 30

        var body: [String: Any] = [
            "idea_id": ideaId,
            "training_type": trainingType.rawValue
        ]

        if let correctedCategory = correctedCategory {
            body["corrected_category"] = correctedCategory.rawValue
        }
        if let correctedPriority = correctedPriority {
            body["corrected_priority"] = correctedPriority.rawValue
        }
        if let correctedType = correctedType {
            body["corrected_type"] = correctedType.rawValue
        }
        if let toneFeedback = toneFeedback {
            body["tone_feedback"] = toneFeedback.rawValue
        }
        if let feedback = feedback {
            body["feedback"] = feedback
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 || httpResponse.statusCode == 201 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let trainingResponse = try Self.createSnakeCaseDecoder().decode(TrainingSubmitResponse.self, from: data)
        return trainingResponse.training
    }
}

// MARK: - Training Response Types

struct TrainingHistoryResponse: Codable {
    let trainings: [TrainingItem]
    let total: Int
}

struct TrainingSubmitResponse: Codable {
    let success: Bool
    let training: TrainingItem
    let message: String?
}

// MARK: - Export

extension APIService {
    enum ExportFormat: String, CaseIterable {
        case pdf = "pdf"
        case markdown = "markdown"
        case csv = "csv"
        case json = "json"
        case backup = "backup"

        var displayName: String {
            switch self {
            case .pdf: return "PDF Report"
            case .markdown: return "Markdown"
            case .csv: return "CSV / Excel"
            case .json: return "JSON"
            case .backup: return "Vollst. Backup"
            }
        }

        var icon: String {
            switch self {
            case .pdf: return "doc.fill"
            case .markdown: return "doc.text"
            case .csv: return "tablecells"
            case .json: return "curlybraces"
            case .backup: return "externaldrive.fill"
            }
        }

        var description: String {
            switch self {
            case .pdf: return "Professioneller Bericht"
            case .markdown: return "Obsidian, Notion kompatibel"
            case .csv: return "Tabellenkalkulation"
            case .json: return "Strukturiertes Format"
            case .backup: return "Alle Daten inkl. Meetings"
            }
        }

        var mimeType: String {
            switch self {
            case .pdf: return "application/pdf"
            case .markdown: return "text/markdown"
            case .csv: return "text/csv"
            case .json, .backup: return "application/json"
            }
        }

        var fileExtension: String {
            switch self {
            case .pdf: return "pdf"
            case .markdown: return "md"
            case .csv: return "csv"
            case .json, .backup: return "json"
            }
        }
    }

    /// Export ideas in specified format
    func exportIdeas(format: ExportFormat, context: AIContext = .personal, includeArchived: Bool = false) async throws -> URL {
        let endpoint: String
        switch format {
        case .backup:
            endpoint = "\(baseURL)/api/export/backup"
        default:
            endpoint = "\(baseURL)/api/export/ideas/\(format.rawValue)"
        }

        var components = URLComponents(string: endpoint)!
        components.queryItems = [
            URLQueryItem(name: "context", value: context.rawValue)
        ]
        if includeArchived && format != .backup {
            components.queryItems?.append(URLQueryItem(name: "includeArchived", value: "true"))
        }

        guard let url = components.url else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.setValue(context.rawValue, forHTTPHeaderField: "X-AI-Context")

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        // Save to temporary file
        let timestamp = ISO8601DateFormatter().string(from: Date()).prefix(10)
        let filename: String
        if format == .backup {
            filename = "brain-backup-\(context.rawValue)-\(timestamp).\(format.fileExtension)"
        } else {
            filename = "ideas-\(context.rawValue)-\(timestamp).\(format.fileExtension)"
        }

        let tempDir = FileManager.default.temporaryDirectory
        let fileURL = tempDir.appendingPathComponent(filename)

        try data.write(to: fileURL)

        return fileURL
    }

    /// Export single idea
    func exportIdea(ideaId: String, format: ExportFormat, context: AIContext = .personal) async throws -> URL {
        guard format == .pdf || format == .markdown else {
            throw APIError.serverError(statusCode: 400)
        }

        let endpoint = "\(baseURL)/api/export/ideas/\(ideaId)/\(format.rawValue)"

        guard var components = URLComponents(string: endpoint) else {
            throw APIError.invalidURL
        }
        components.queryItems = [
            URLQueryItem(name: "context", value: context.rawValue)
        ]

        guard let url = components.url else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.setValue(context.rawValue, forHTTPHeaderField: "X-AI-Context")

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let filename = "idea-\(ideaId.prefix(8)).\(format.fileExtension)"
        let tempDir = FileManager.default.temporaryDirectory
        let fileURL = tempDir.appendingPathComponent(filename)

        try data.write(to: fileURL)

        return fileURL
    }

    /// Export meetings
    func exportMeetings(format: ExportFormat, context: AIContext = .personal) async throws -> URL {
        guard format == .pdf || format == .csv else {
            throw APIError.serverError(statusCode: 400)
        }

        let endpoint = "\(baseURL)/api/export/meetings/\(format.rawValue)"

        guard var components = URLComponents(string: endpoint) else {
            throw APIError.invalidURL
        }
        components.queryItems = [
            URLQueryItem(name: "context", value: context.rawValue)
        ]

        guard let url = components.url else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.setValue(context.rawValue, forHTTPHeaderField: "X-AI-Context")

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let timestamp = ISO8601DateFormatter().string(from: Date()).prefix(10)
        let filename = "meetings-\(context.rawValue)-\(timestamp).\(format.fileExtension)"
        let tempDir = FileManager.default.temporaryDirectory
        let fileURL = tempDir.appendingPathComponent(filename)

        try data.write(to: fileURL)

        return fileURL
    }

    /// Export incubator (thought clusters)
    func exportIncubator(context: AIContext = .personal) async throws -> URL {
        let endpoint = "\(baseURL)/api/export/incubator/markdown"

        guard var components = URLComponents(string: endpoint) else {
            throw APIError.invalidURL
        }
        components.queryItems = [
            URLQueryItem(name: "context", value: context.rawValue)
        ]

        guard let url = components.url else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.setValue(context.rawValue, forHTTPHeaderField: "X-AI-Context")

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let timestamp = ISO8601DateFormatter().string(from: Date()).prefix(10)
        let filename = "incubator-\(context.rawValue)-\(timestamp).md"
        let tempDir = FileManager.default.temporaryDirectory
        let fileURL = tempDir.appendingPathComponent(filename)

        try data.write(to: fileURL)

        return fileURL
    }
}

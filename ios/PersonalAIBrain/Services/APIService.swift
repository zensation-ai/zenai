import Foundation

@MainActor
class APIService: ObservableObject {
    // Configure your backend URL here
    // For local development on simulator: use localhost
    // For device testing: use your Mac's IP address
    private let baseURL: String

    // WICHTIG: Trage hier deine Mac IP-Adresse ein für iPhone-Nutzung
    private static let macIPAddress = "192.168.212.104"

    @Published var isLoading = false
    @Published var error: String?

    init() {
        #if targetEnvironment(simulator)
        // Simulator kann localhost verwenden
        self.baseURL = "http://localhost:3000"
        #else
        // Echtes Gerät braucht die Mac IP-Adresse
        self.baseURL = "http://\(APIService.macIPAddress):3000"
        #endif
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
            throw APIError.invalidURL
        }

        let (data, response) = try await URLSession.shared.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(statusCode: httpResponse.statusCode)
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let ideasResponse = try decoder.decode(IdeasResponse.self, from: data)
        return ideasResponse.ideas
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

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let searchResponse = try decoder.decode(SearchResponse.self, from: data)
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

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        return try decoder.decode(VoiceMemoResponse.self, from: data)
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

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        return try decoder.decode(VoiceMemoResponse.self, from: data)
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

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let meetingsResponse = try decoder.decode(MeetingsResponse.self, from: data)
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

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let createResponse = try decoder.decode(CreateMeetingResponse.self, from: data)
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

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let notesResponse = try decoder.decode(MeetingNotesResponse.self, from: data)
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

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let notesResponse = try decoder.decode(AddNotesResponse.self, from: data)
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

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let eventsResponse = try decoder.decode(CalendarEventsResponse.self, from: data)
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

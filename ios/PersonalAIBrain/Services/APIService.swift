import Foundation

@MainActor
class APIService: ObservableObject {
    // Configure your backend URL here
    // For local development on simulator: use localhost
    // For device testing: use your Mac's IP address
    private let baseURL: String

    @Published var isLoading = false
    @Published var error: String?

    init() {
        // Default to localhost for simulator
        // Change to your Mac's IP for device testing (e.g., "http://192.168.1.100:3000")
        self.baseURL = "http://localhost:3000"
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
}

// MARK: - Response Models

struct HealthResponse: Codable {
    let status: String
}

struct IdeasResponse: Codable {
    let ideas: [Idea]
    let count: Int
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

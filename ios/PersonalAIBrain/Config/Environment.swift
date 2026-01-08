import Foundation

/// Environment configuration for the app
/// Allows configuring API URL without hardcoding IP addresses
/// Named AppEnvironment to avoid conflict with SwiftUI's @Environment
enum AppEnvironment {

    // MARK: - API Configuration

    /// The base URL for the API backend
    /// - For Simulator: Uses localhost
    /// - For Device: Uses configured IP or defaults to localhost
    static var apiBaseURL: String {
        #if targetEnvironment(simulator)
        return "http://localhost:3000"
        #else
        // Check for custom API URL in environment or Info.plist
        if let customURL = ProcessInfo.processInfo.environment["API_BASE_URL"] {
            return customURL
        }

        if let plistURL = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String,
           !plistURL.isEmpty {
            return plistURL
        }

        // Default: Use the configured development IP
        return "http://\(developmentIP):3000"
        #endif
    }

    /// Development IP address for real device testing
    /// Change this to your Mac's IP address when testing on device
    private static var developmentIP: String {
        // Try to read from Info.plist first
        if let ip = Bundle.main.object(forInfoDictionaryKey: "DevelopmentIP") as? String,
           !ip.isEmpty {
            return ip
        }
        // Fallback to default
        return "192.168.212.104"
    }

    // MARK: - Environment Detection

    static var isDebug: Bool {
        #if DEBUG
        return true
        #else
        return false
        #endif
    }

    static var isSimulator: Bool {
        #if targetEnvironment(simulator)
        return true
        #else
        return false
        #endif
    }

    // MARK: - Timeouts

    /// Default timeout for API requests in seconds
    static let defaultTimeout: TimeInterval = 30

    /// Extended timeout for voice memo processing
    static let voiceMemoTimeout: TimeInterval = 120

    /// Extended timeout for media uploads
    static let mediaUploadTimeout: TimeInterval = 180

    /// Structured timeouts for different operations
    enum Timeouts {
        static let standard: TimeInterval = 30
        static let aiProcessing: TimeInterval = 120
        static let upload: TimeInterval = 180
    }
}

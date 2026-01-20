import Foundation
import os.log

/// Centralized logging service for PersonalAIBrain
///
/// Usage:
///   Logger.debug("Processing started")
///   Logger.info("User logged in", category: .auth)
///   Logger.error("Network failed", error: error, category: .network)
///
/// In production builds, debug logs are suppressed.
final class Logger {

    // MARK: - Log Categories

    enum Category: String {
        case general = "General"
        case network = "Network"
        case auth = "Auth"
        case sync = "Sync"
        case audio = "Audio"
        case graph = "KnowledgeGraph"
        case ui = "UI"
        case storage = "Storage"
        case notification = "Notification"
    }

    // MARK: - Log Levels

    enum Level: String {
        case debug = "DEBUG"
        case info = "INFO"
        case warning = "WARN"
        case error = "ERROR"

        var emoji: String {
            switch self {
            case .debug: return "🔍"
            case .info: return "ℹ️"
            case .warning: return "⚠️"
            case .error: return "❌"
            }
        }

        var osLogType: OSLogType {
            switch self {
            case .debug: return .debug
            case .info: return .info
            case .warning: return .default
            case .error: return .error
            }
        }
    }

    // MARK: - Configuration

    #if DEBUG
    static let isDebugEnabled = true
    #else
    static let isDebugEnabled = false
    #endif

    private static let subsystem = Bundle.main.bundleIdentifier ?? "com.personalai.brain"

    // MARK: - Private Logging

    private static func log(
        _ message: String,
        level: Level,
        category: Category,
        error: Error? = nil,
        file: String = #file,
        function: String = #function,
        line: Int = #line
    ) {
        // Skip debug logs in production
        if level == .debug && !isDebugEnabled {
            return
        }

        let osLog = OSLog(subsystem: subsystem, category: category.rawValue)
        let fileName = (file as NSString).lastPathComponent

        var logMessage = "\(level.emoji) [\(category.rawValue)] \(message)"

        if let error = error {
            logMessage += " | Error: \(error.localizedDescription)"
        }

        #if DEBUG
        logMessage += " (\(fileName):\(line))"
        #endif

        os_log("%{public}@", log: osLog, type: level.osLogType, logMessage)

        #if DEBUG
        // Also print to console in debug builds for Xcode visibility
        print(logMessage)
        #endif
    }

    // MARK: - Public API

    /// Log a debug message (suppressed in production)
    static func debug(
        _ message: String,
        category: Category = .general,
        file: String = #file,
        function: String = #function,
        line: Int = #line
    ) {
        log(message, level: .debug, category: category, file: file, function: function, line: line)
    }

    /// Log an info message
    static func info(
        _ message: String,
        category: Category = .general,
        file: String = #file,
        function: String = #function,
        line: Int = #line
    ) {
        log(message, level: .info, category: category, file: file, function: function, line: line)
    }

    /// Log a warning message
    static func warning(
        _ message: String,
        category: Category = .general,
        file: String = #file,
        function: String = #function,
        line: Int = #line
    ) {
        log(message, level: .warning, category: category, file: file, function: function, line: line)
    }

    /// Log an error message
    static func error(
        _ message: String,
        error: Error? = nil,
        category: Category = .general,
        file: String = #file,
        function: String = #function,
        line: Int = #line
    ) {
        log(message, level: .error, category: category, error: error, file: file, function: function, line: line)
    }

    // MARK: - Convenience Methods

    /// Log network request
    static func networkRequest(_ url: String, method: String = "GET") {
        debug("[\(method)] \(url)", category: .network)
    }

    /// Log network response
    static func networkResponse(_ url: String, statusCode: Int) {
        if statusCode >= 200 && statusCode < 300 {
            debug("Response \(statusCode) from \(url)", category: .network)
        } else if statusCode >= 400 {
            warning("Response \(statusCode) from \(url)", category: .network)
        }
    }

    /// Log network error
    static func networkError(_ message: String, error: Error) {
        self.error(message, error: error, category: .network)
    }
}

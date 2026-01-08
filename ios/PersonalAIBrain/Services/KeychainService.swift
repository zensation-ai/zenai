import Foundation
import Security

/// Phase 9: Secure Keychain Service for sensitive data storage
/// Replaces UserDefaults for API keys and other secrets
///
/// Features:
/// - Secure storage using iOS Keychain
/// - Data protection with kSecAttrAccessibleWhenUnlockedThisDeviceOnly
/// - Type-safe key management
/// - Error handling with descriptive errors
///
/// Usage:
/// ```swift
/// // Store API key
/// try KeychainService.shared.set("ab_live_xxx", for: .apiKey)
///
/// // Retrieve API key
/// let apiKey = try KeychainService.shared.get(.apiKey)
///
/// // Delete API key
/// try KeychainService.shared.delete(.apiKey)
/// ```
final class KeychainService {

    // MARK: - Singleton

    static let shared = KeychainService()

    private init() {}

    // MARK: - Keys

    /// Predefined keys for secure storage
    enum Key: String {
        case apiKey = "com.personalai.apiKey"
        case refreshToken = "com.personalai.refreshToken"
        case userSecret = "com.personalai.userSecret"
        case encryptionKey = "com.personalai.encryptionKey"

        /// Service name for Keychain queries
        var service: String { "PersonalAIBrain" }
    }

    // MARK: - Errors

    enum KeychainError: LocalizedError {
        case itemNotFound
        case duplicateItem
        case unexpectedStatus(OSStatus)
        case invalidData
        case encodingFailed

        var errorDescription: String? {
            switch self {
            case .itemNotFound:
                return "Item not found in Keychain"
            case .duplicateItem:
                return "Item already exists in Keychain"
            case .unexpectedStatus(let status):
                return "Keychain error: \(status)"
            case .invalidData:
                return "Invalid data format in Keychain"
            case .encodingFailed:
                return "Failed to encode data for Keychain"
            }
        }
    }

    // MARK: - Public Methods

    /// Store a string value securely in Keychain
    /// - Parameters:
    ///   - value: The string to store
    ///   - key: The key to store under
    func set(_ value: String, for key: Key) throws {
        guard let data = value.data(using: .utf8) else {
            throw KeychainError.encodingFailed
        }
        try set(data, for: key)
    }

    /// Store data securely in Keychain
    /// - Parameters:
    ///   - data: The data to store
    ///   - key: The key to store under
    func set(_ data: Data, for key: Key) throws {
        // First, try to delete any existing item
        try? delete(key)

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: key.service,
            kSecAttrAccount as String: key.rawValue,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]

        let status = SecItemAdd(query as CFDictionary, nil)

        guard status == errSecSuccess else {
            if status == errSecDuplicateItem {
                throw KeychainError.duplicateItem
            }
            throw KeychainError.unexpectedStatus(status)
        }
    }

    /// Retrieve a string value from Keychain
    /// - Parameter key: The key to retrieve
    /// - Returns: The stored string, or nil if not found
    func get(_ key: Key) throws -> String? {
        guard let data = try getData(key) else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    /// Retrieve data from Keychain
    /// - Parameter key: The key to retrieve
    /// - Returns: The stored data, or nil if not found
    func getData(_ key: Key) throws -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: key.service,
            kSecAttrAccount as String: key.rawValue,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        if status == errSecItemNotFound {
            return nil
        }

        guard status == errSecSuccess else {
            throw KeychainError.unexpectedStatus(status)
        }

        guard let data = result as? Data else {
            throw KeychainError.invalidData
        }

        return data
    }

    /// Delete an item from Keychain
    /// - Parameter key: The key to delete
    func delete(_ key: Key) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: key.service,
            kSecAttrAccount as String: key.rawValue
        ]

        let status = SecItemDelete(query as CFDictionary)

        if status != errSecSuccess && status != errSecItemNotFound {
            throw KeychainError.unexpectedStatus(status)
        }
    }

    /// Check if an item exists in Keychain
    /// - Parameter key: The key to check
    /// - Returns: true if the item exists
    func exists(_ key: Key) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: key.service,
            kSecAttrAccount as String: key.rawValue,
            kSecReturnData as String: false
        ]

        let status = SecItemCopyMatching(query as CFDictionary, nil)
        return status == errSecSuccess
    }

    /// Delete all items for this service
    func deleteAll() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Key.apiKey.service
        ]

        let status = SecItemDelete(query as CFDictionary)

        if status != errSecSuccess && status != errSecItemNotFound {
            throw KeychainError.unexpectedStatus(status)
        }
    }

    // MARK: - Convenience Methods

    /// Store an API key
    func setAPIKey(_ key: String) throws {
        try set(key, for: .apiKey)
    }

    /// Get the stored API key
    func getAPIKey() -> String? {
        try? get(.apiKey)
    }

    /// Check if an API key is stored
    var hasAPIKey: Bool {
        exists(.apiKey)
    }

    /// Delete the stored API key
    func deleteAPIKey() throws {
        try delete(.apiKey)
    }
}

// MARK: - Codable Support

extension KeychainService {
    /// Store a Codable object in Keychain
    func set<T: Encodable>(_ object: T, for key: Key) throws {
        let encoder = JSONEncoder()
        let data = try encoder.encode(object)
        try set(data, for: key)
    }

    /// Retrieve a Codable object from Keychain
    func get<T: Decodable>(_ type: T.Type, for key: Key) throws -> T? {
        guard let data = try getData(key) else {
            return nil
        }
        let decoder = JSONDecoder()
        return try decoder.decode(T.self, from: data)
    }
}

// MARK: - Debug Support

#if DEBUG
extension KeychainService {
    /// Print all stored keys (debug only)
    func debugPrintAllKeys() {
        print("🔐 Keychain Contents:")
        for key in [Key.apiKey, .refreshToken, .userSecret, .encryptionKey] {
            let status = exists(key) ? "✅" : "❌"
            print("  \(status) \(key.rawValue)")
        }
    }
}
#endif

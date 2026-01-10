import Foundation
import Security

/// Manages secure storage and retrieval of API keys using iOS Keychain
///
/// Usage:
/// ```swift
/// let manager = APIKeyManager.shared
/// manager.saveAPIKey("ab_live_xxxxxxxxxxxxxxxx")
/// if let key = manager.getAPIKey() {
///     // Use key for API requests
/// }
/// ```
class APIKeyManager {
    static let shared = APIKeyManager()

    private let keychainService = "com.personalai.brain"
    private let keychainAccount = "api-key"

    /// Default API key for development - automatically used if no key is stored
    private let defaultAPIKey = "ab_live_769e7bd8640e652650241410f1f7c0bd0b4a5be7e0560f1c"

    private init() {
        // Automatically save default key on first launch if none exists
        if getStoredAPIKey() == nil {
            print("📱 APIKeyManager: No API key found, setting default key")
            saveAPIKey(defaultAPIKey)
        }
    }

    /// Save API key securely to Keychain
    /// - Parameter key: The API key to store (format: "ab_live_xxxxx")
    /// - Returns: True if successful, false otherwise
    @discardableResult
    func saveAPIKey(_ key: String) -> Bool {
        guard let data = key.data(using: .utf8) else {
            print("❌ APIKeyManager: Failed to encode API key")
            return false
        }

        // Delete existing key first
        deleteAPIKey()

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]

        let status = SecItemAdd(query as CFDictionary, nil)

        if status == errSecSuccess {
            print("✅ APIKeyManager: API key saved successfully")
            return true
        } else {
            print("❌ APIKeyManager: Failed to save API key, status: \(status)")
            return false
        }
    }

    /// Retrieve API key from Keychain (internal use, no default fallback)
    private func getStoredAPIKey() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess,
              let data = result as? Data,
              let key = String(data: data, encoding: .utf8) else {
            if status != errSecItemNotFound {
                print("❌ APIKeyManager: Failed to retrieve API key, status: \(status)")
            }
            return nil
        }

        return key
    }

    /// Retrieve API key from Keychain, falls back to default if not found
    /// - Returns: The stored API key, or default key if not found
    func getAPIKey() -> String? {
        return getStoredAPIKey() ?? defaultAPIKey
    }

    /// Delete API key from Keychain
    /// - Returns: True if successful or key didn't exist, false on error
    @discardableResult
    func deleteAPIKey() -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount
        ]

        let status = SecItemDelete(query as CFDictionary)

        if status == errSecSuccess || status == errSecItemNotFound {
            return true
        } else {
            print("❌ APIKeyManager: Failed to delete API key, status: \(status)")
            return false
        }
    }

    /// Check if an API key is currently stored (always true with default fallback)
    /// - Returns: True if a key exists or default is available
    func hasAPIKey() -> Bool {
        return true // Always have at least the default key
    }

    /// Check if a custom API key is stored (not using default)
    /// - Returns: True if a custom key is stored
    func hasCustomAPIKey() -> Bool {
        return getStoredAPIKey() != nil
    }
}

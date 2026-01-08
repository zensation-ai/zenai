import Foundation
import LocalAuthentication

/// Phase 13: Biometric Authentication Service
/// Provides Face ID / Touch ID authentication for app access
final class BiometricService {
    static let shared = BiometricService()

    private let context = LAContext()

    private init() {}

    // MARK: - Biometric Type

    enum BiometricType {
        case none
        case touchID
        case faceID
        case opticID

        var displayName: String {
            switch self {
            case .none: return "Keine"
            case .touchID: return "Touch ID"
            case .faceID: return "Face ID"
            case .opticID: return "Optic ID"
            }
        }

        var iconName: String {
            switch self {
            case .none: return "lock.slash"
            case .touchID: return "touchid"
            case .faceID: return "faceid"
            case .opticID: return "opticid"
            }
        }
    }

    // MARK: - Errors

    enum BiometricError: LocalizedError {
        case notAvailable
        case notEnrolled
        case lockout
        case cancelled
        case failed
        case unknown(Error)

        var errorDescription: String? {
            switch self {
            case .notAvailable:
                return "Biometrische Authentifizierung ist auf diesem Gerät nicht verfügbar."
            case .notEnrolled:
                return "Keine biometrischen Daten eingerichtet. Bitte richte Face ID oder Touch ID in den Einstellungen ein."
            case .lockout:
                return "Biometrische Authentifizierung ist gesperrt. Bitte entsperre mit deinem Passcode."
            case .cancelled:
                return "Authentifizierung abgebrochen."
            case .failed:
                return "Authentifizierung fehlgeschlagen. Bitte versuche es erneut."
            case .unknown(let error):
                return "Unbekannter Fehler: \(error.localizedDescription)"
            }
        }
    }

    // MARK: - Public API

    /// Check what type of biometric is available on this device
    var availableBiometricType: BiometricType {
        let context = LAContext()
        var error: NSError?

        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            return .none
        }

        switch context.biometryType {
        case .none:
            return .none
        case .touchID:
            return .touchID
        case .faceID:
            return .faceID
        case .opticID:
            return .opticID
        @unknown default:
            return .none
        }
    }

    /// Check if biometric authentication is available
    var isBiometricAvailable: Bool {
        return availableBiometricType != .none
    }

    /// Authenticate with biometrics
    /// - Parameter reason: The reason displayed to the user
    /// - Returns: True if authentication was successful
    func authenticate(reason: String = "Authentifiziere dich für Personal AI Brain") async throws -> Bool {
        let context = LAContext()
        var error: NSError?

        // Check if biometric authentication is available
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            if let laError = error {
                throw mapLAError(laError)
            }
            throw BiometricError.notAvailable
        }

        // Perform authentication
        do {
            let success = try await context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: reason
            )
            return success
        } catch let laError as LAError {
            throw mapLAError(laError)
        } catch {
            throw BiometricError.unknown(error)
        }
    }

    /// Authenticate with biometrics or device passcode as fallback
    func authenticateWithPasscodeFallback(reason: String = "Authentifiziere dich für Personal AI Brain") async throws -> Bool {
        let context = LAContext()
        var error: NSError?

        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            if let laError = error {
                throw mapLAError(laError)
            }
            throw BiometricError.notAvailable
        }

        do {
            let success = try await context.evaluatePolicy(
                .deviceOwnerAuthentication,
                localizedReason: reason
            )
            return success
        } catch let laError as LAError {
            throw mapLAError(laError)
        } catch {
            throw BiometricError.unknown(error)
        }
    }

    // MARK: - Private Helpers

    private func mapLAError(_ error: Error) -> BiometricError {
        guard let laError = error as? LAError else {
            return .unknown(error)
        }

        switch laError.code {
        case .biometryNotAvailable:
            return .notAvailable
        case .biometryNotEnrolled:
            return .notEnrolled
        case .biometryLockout:
            return .lockout
        case .userCancel, .systemCancel, .appCancel:
            return .cancelled
        case .authenticationFailed:
            return .failed
        default:
            return .unknown(error)
        }
    }
}

// MARK: - Settings Integration

extension BiometricService {
    /// Key for storing biometric preference in UserDefaults
    private static let biometricEnabledKey = "biometricAuthEnabled"

    /// Whether the user has enabled biometric authentication
    var isEnabled: Bool {
        get {
            UserDefaults.standard.bool(forKey: Self.biometricEnabledKey)
        }
        set {
            UserDefaults.standard.set(newValue, forKey: Self.biometricEnabledKey)
        }
    }

    /// Enable biometric authentication (requires successful auth first)
    func enableBiometricAuth() async throws {
        guard isBiometricAvailable else {
            throw BiometricError.notAvailable
        }

        // Verify user can authenticate before enabling
        let success = try await authenticate(reason: "Bestätige deine Identität um Biometrie zu aktivieren")

        if success {
            isEnabled = true
        }
    }

    /// Disable biometric authentication
    func disableBiometricAuth() {
        isEnabled = false
    }
}

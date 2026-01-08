import SwiftUI

/// Phase 13: Lock Screen View
/// Displayed when app requires biometric authentication
struct LockScreenView: View {
    @State private var isAuthenticating = false
    @State private var errorMessage: String?
    @State private var showError = false

    let onAuthenticated: () -> Void

    private let biometricService = BiometricService.shared

    var body: some View {
        ZStack {
            // Background gradient
            LinearGradient(
                gradient: Gradient(colors: [
                    Color(.systemBackground),
                    Color(.systemGray6)
                ]),
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 32) {
                Spacer()

                // App Icon / Brain Symbol
                Image(systemName: "brain.head.profile")
                    .font(.system(size: 80))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [.blue, .purple],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                // Title
                Text("Personal AI Brain")
                    .font(.largeTitle)
                    .fontWeight(.bold)

                Text("Deine Ideen, sicher verwahrt")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                Spacer()

                // Biometric Button
                Button(action: authenticate) {
                    HStack(spacing: 12) {
                        if isAuthenticating {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Image(systemName: biometricService.availableBiometricType.iconName)
                                .font(.title2)
                        }

                        Text(buttonTitle)
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(Color.accentColor)
                    .foregroundColor(.white)
                    .cornerRadius(14)
                }
                .disabled(isAuthenticating)
                .padding(.horizontal, 32)

                // Alternative: Use Passcode
                if biometricService.isBiometricAvailable {
                    Button("Mit Passcode entsperren") {
                        authenticateWithPasscode()
                    }
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                }

                Spacer()
                    .frame(height: 60)
            }
        }
        .alert("Authentifizierung fehlgeschlagen", isPresented: $showError) {
            Button("OK") {
                showError = false
            }
            Button("Erneut versuchen") {
                authenticate()
            }
        } message: {
            Text(errorMessage ?? "Bitte versuche es erneut.")
        }
        .onAppear {
            // Auto-authenticate on appear
            authenticate()
        }
    }

    private var buttonTitle: String {
        switch biometricService.availableBiometricType {
        case .faceID:
            return "Mit Face ID entsperren"
        case .touchID:
            return "Mit Touch ID entsperren"
        case .opticID:
            return "Mit Optic ID entsperren"
        case .none:
            return "Entsperren"
        }
    }

    private func authenticate() {
        guard !isAuthenticating else { return }

        isAuthenticating = true
        errorMessage = nil

        Task {
            do {
                let success = try await biometricService.authenticate()
                await MainActor.run {
                    isAuthenticating = false
                    if success {
                        onAuthenticated()
                    }
                }
            } catch let error as BiometricService.BiometricError {
                await MainActor.run {
                    isAuthenticating = false
                    // Don't show error for cancelled authentication
                    if case .cancelled = error {
                        return
                    }
                    errorMessage = error.localizedDescription
                    showError = true
                }
            } catch {
                await MainActor.run {
                    isAuthenticating = false
                    errorMessage = error.localizedDescription
                    showError = true
                }
            }
        }
    }

    private func authenticateWithPasscode() {
        guard !isAuthenticating else { return }

        isAuthenticating = true
        errorMessage = nil

        Task {
            do {
                let success = try await biometricService.authenticateWithPasscodeFallback()
                await MainActor.run {
                    isAuthenticating = false
                    if success {
                        onAuthenticated()
                    }
                }
            } catch let error as BiometricService.BiometricError {
                await MainActor.run {
                    isAuthenticating = false
                    if case .cancelled = error {
                        return
                    }
                    errorMessage = error.localizedDescription
                    showError = true
                }
            } catch {
                await MainActor.run {
                    isAuthenticating = false
                    errorMessage = error.localizedDescription
                    showError = true
                }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    LockScreenView {
        print("Authenticated!")
    }
}

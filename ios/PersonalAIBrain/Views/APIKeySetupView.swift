//
//  APIKeySetupView.swift
//  PersonalAIBrain
//
//  Created by Claude Code on 2026-01-09.
//  API Key Setup View for secure keychain-based authentication
//

import SwiftUI

struct APIKeySetupView: View {
    @State private var apiKey = ""
    @State private var showSuccess = false
    @State private var showError = false
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationView {
            Form {
                Section {
                    Text("Um die App zu nutzen, benötigst du einen API-Key vom Backend.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Section("API Key") {
                    SecureField("ab_live_xxxxxxxxxxxxxxxx", text: $apiKey)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .font(.system(.body, design: .monospaced))
                }

                Section {
                    Button("Speichern") {
                        saveAPIKey()
                    }
                    .disabled(apiKey.isEmpty)
                }

                if showSuccess {
                    Section {
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                            Text("API Key gespeichert!")
                        }
                    }
                }

                if showError {
                    Section {
                        HStack {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(.red)
                            Text("Fehler beim Speichern")
                        }
                    }
                }

                Section {
                    Text("API Key Format: **ab_live_** gefolgt von 32 Zeichen")
                        .font(.caption)
                        .foregroundColor(.secondary)

                    Text("Den API Key erhältst du vom Backend Administrator.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .navigationTitle("API Key Setup")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") {
                        dismiss()
                    }
                }
            }
        }
    }

    private func saveAPIKey() {
        let success = APIKeyManager.shared.saveAPIKey(apiKey)
        if success {
            showSuccess = true
            showError = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                dismiss()
            }
        } else {
            showError = true
            showSuccess = false
        }
    }
}

#Preview {
    APIKeySetupView()
}

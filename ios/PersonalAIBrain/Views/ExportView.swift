import SwiftUI

struct ExportView: View {
    @EnvironmentObject var apiService: APIService
    @Binding var context: AIContext

    @State private var selectedFormat: APIService.ExportFormat = .pdf
    @State private var includeArchived = false
    @State private var isExporting = false
    @State private var exportedFileURL: URL?
    @State private var showShareSheet = false
    @State private var errorMessage: String?
    @State private var showError = false

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            List {
                // Context Info
                Section {
                    HStack {
                        Image(systemName: context == .personal ? "house.fill" : "briefcase.fill")
                            .foregroundColor(context == .personal ? .blue : .orange)
                        Text(context == .personal ? "Personal" : "Work")
                            .font(.headline)
                        Spacer()
                        Text("Aktueller Kontext")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }

                // Format Selection
                Section(header: Text("Export-Format")) {
                    ForEach(APIService.ExportFormat.allCases, id: \.self) { format in
                        Button(action: { selectedFormat = format }) {
                            HStack {
                                Image(systemName: format.icon)
                                    .font(.title2)
                                    .frame(width: 30)
                                    .foregroundColor(selectedFormat == format ? .accentColor : .secondary)

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(format.displayName)
                                        .font(.headline)
                                        .foregroundColor(.primary)
                                    Text(format.description)
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }

                                Spacer()

                                if selectedFormat == format {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundColor(.accentColor)
                                }
                            }
                        }
                        .buttonStyle(PlainButtonStyle())
                    }
                }

                // Options
                if selectedFormat != .backup {
                    Section(header: Text("Optionen")) {
                        Toggle(isOn: $includeArchived) {
                            Label("Archivierte einschließen", systemImage: "archivebox")
                        }
                    }
                }

                // Export Button
                Section {
                    Button(action: performExport) {
                        HStack {
                            Spacer()
                            if isExporting {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle())
                                Text("Exportiere...")
                            } else {
                                Image(systemName: "square.and.arrow.up")
                                Text("Exportieren")
                            }
                            Spacer()
                        }
                        .font(.headline)
                        .padding(.vertical, 8)
                    }
                    .disabled(isExporting)
                    .listRowBackground(Color.accentColor.opacity(0.15))
                }

                // Quick Export Options
                Section(header: Text("Schnell-Export")) {
                    Button(action: { exportMeetings() }) {
                        Label("Meetings exportieren (PDF)", systemImage: "calendar")
                    }
                    .disabled(isExporting)

                    Button(action: { exportIncubator() }) {
                        Label("Inkubator exportieren (MD)", systemImage: "lightbulb")
                    }
                    .disabled(isExporting)
                }
            }
            .navigationTitle("Export")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Abbrechen") {
                        dismiss()
                    }
                }
            }
            .sheet(isPresented: $showShareSheet) {
                if let url = exportedFileURL {
                    ShareSheet(activityItems: [url])
                }
            }
            .alert("Fehler", isPresented: $showError) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "Unbekannter Fehler")
            }
        }
    }

    private func performExport() {
        isExporting = true
        errorMessage = nil

        Task {
            do {
                let fileURL = try await apiService.exportIdeas(
                    format: selectedFormat,
                    context: context,
                    includeArchived: includeArchived
                )

                await MainActor.run {
                    exportedFileURL = fileURL
                    showShareSheet = true
                    isExporting = false
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    showError = true
                    isExporting = false
                }
            }
        }
    }

    private func exportMeetings() {
        isExporting = true
        errorMessage = nil

        Task {
            do {
                let fileURL = try await apiService.exportMeetings(format: .pdf, context: context)

                await MainActor.run {
                    exportedFileURL = fileURL
                    showShareSheet = true
                    isExporting = false
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    showError = true
                    isExporting = false
                }
            }
        }
    }

    private func exportIncubator() {
        isExporting = true
        errorMessage = nil

        Task {
            do {
                let fileURL = try await apiService.exportIncubator(context: context)

                await MainActor.run {
                    exportedFileURL = fileURL
                    showShareSheet = true
                    isExporting = false
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    showError = true
                    isExporting = false
                }
            }
        }
    }
}

// MARK: - Share Sheet

struct ShareSheet: UIViewControllerRepresentable {
    let activityItems: [Any]
    var applicationActivities: [UIActivity]? = nil

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(
            activityItems: activityItems,
            applicationActivities: applicationActivities
        )
        return controller
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// MARK: - Export Button for Toolbar

struct ExportButton: View {
    @Binding var showExportSheet: Bool

    var body: some View {
        Button(action: { showExportSheet = true }) {
            Image(systemName: "square.and.arrow.up")
        }
    }
}

#Preview {
    ExportView(context: .constant(.personal))
        .environmentObject(APIService())
}

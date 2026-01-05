import SwiftUI

// MARK: - Offline Queue View
struct OfflineQueueView: View {
    @EnvironmentObject var offlineQueueService: OfflineQueueService
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Color.zensationBackground.ignoresSafeArea()

                if offlineQueueService.queuedItems.isEmpty {
                    emptyState
                } else {
                    queueList
                }
            }
            .navigationTitle("Warteschlange")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarBackground(Color.zensationSurface, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Fertig") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    if !offlineQueueService.queuedItems.isEmpty && offlineQueueService.isOnline {
                        Button(action: syncAll) {
                            HStack(spacing: 4) {
                                Image(systemName: "arrow.triangle.2.circlepath")
                                Text("Sync")
                            }
                        }
                        .disabled(offlineQueueService.isProcessing)
                    }
                }
            }
        }
    }

    // MARK: - Empty State
    private var emptyState: some View {
        VStack(spacing: 20) {
            Image(systemName: "checkmark.icloud.fill")
                .font(.system(size: 60))
                .foregroundColor(.zensationSuccess)

            Text("Alles synchronisiert!")
                .font(.title2)
                .fontWeight(.semibold)

            Text("Keine ausstehenden Einträge")
                .font(.subheadline)
                .foregroundColor(.zensationTextMuted)

            // Connection status
            connectionStatusBadge
        }
    }

    // MARK: - Queue List
    private var queueList: some View {
        VStack(spacing: 0) {
            // Status header
            statusHeader
                .padding()
                .background(Color.zensationSurface)

            // Items list
            List {
                ForEach(offlineQueueService.queuedItems) { item in
                    QueueItemRow(item: item, onRetry: {
                        retryItem(item)
                    })
                    .listRowBackground(Color.zensationBackground)
                    .listRowSeparatorTint(.zensationBorder)
                }
                .onDelete(perform: deleteItems)
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
        }
    }

    // MARK: - Status Header
    private var statusHeader: some View {
        VStack(spacing: 12) {
            // Connection status
            connectionStatusBadge

            // Summary
            HStack(spacing: 20) {
                VStack {
                    Text("\(offlineQueueService.queuedItems.count)")
                        .font(.title)
                        .fontWeight(.bold)
                    Text("Ausstehend")
                        .font(.caption)
                        .foregroundColor(.zensationTextMuted)
                }

                Divider()
                    .frame(height: 40)

                VStack {
                    Text("\(failedCount)")
                        .font(.title)
                        .fontWeight(.bold)
                        .foregroundColor(failedCount > 0 ? .zensationDanger : .primary)
                    Text("Fehlgeschlagen")
                        .font(.caption)
                        .foregroundColor(.zensationTextMuted)
                }

                if offlineQueueService.isProcessing {
                    Divider()
                        .frame(height: 40)

                    VStack {
                        ProgressView()
                            .scaleEffect(0.8)
                        Text("Synchronisiere...")
                            .font(.caption)
                            .foregroundColor(.zensationTextMuted)
                    }
                }
            }
        }
    }

    // MARK: - Connection Status Badge
    private var connectionStatusBadge: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(offlineQueueService.isOnline ? Color.zensationSuccess : Color.zensationDanger)
                .frame(width: 10, height: 10)

            Text(offlineQueueService.isOnline ? "Online" : "Offline")
                .font(.subheadline)
                .fontWeight(.medium)

            if !offlineQueueService.isOnline {
                Text("- Warte auf Verbindung")
                    .font(.subheadline)
                    .foregroundColor(.zensationTextMuted)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            Capsule()
                .fill((offlineQueueService.isOnline ? Color.zensationSuccess : Color.zensationDanger).opacity(0.15))
        )
    }

    // MARK: - Computed Properties
    private var failedCount: Int {
        offlineQueueService.queuedItems.filter { $0.retryCount > 0 }.count
    }

    // MARK: - Actions
    private func syncAll() {
        Task {
            await offlineQueueService.processQueue()
        }
    }

    private func retryItem(_ item: QueueItem) {
        Task {
            await offlineQueueService.processQueue()
        }
    }

    private func deleteItems(at offsets: IndexSet) {
        for index in offsets {
            let item = offlineQueueService.queuedItems[index]
            offlineQueueService.removeItem(item)
        }
    }
}

// MARK: - Queue Item Row
struct QueueItemRow: View {
    let item: QueueItem
    let onRetry: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            // Type icon
            ZStack {
                Circle()
                    .fill(typeColor.opacity(0.15))
                    .frame(width: 44, height: 44)

                Image(systemName: typeIcon)
                    .font(.title3)
                    .foregroundColor(typeColor)
            }

            // Content
            VStack(alignment: .leading, spacing: 4) {
                Text(typeLabel)
                    .font(.subheadline)
                    .fontWeight(.medium)

                HStack(spacing: 8) {
                    Text(contextLabel)
                        .font(.caption)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.secondary.opacity(0.2))
                        .clipShape(Capsule())

                    Text(item.createdAt.formatted(date: .abbreviated, time: .shortened))
                        .font(.caption)
                        .foregroundColor(.zensationTextMuted)
                }

                // Error status
                if item.retryCount > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.caption2)
                            .foregroundColor(.zensationWarning)
                        Text("Versuch \(item.retryCount)/3")
                            .font(.caption)
                            .foregroundColor(.zensationWarning)
                        if let error = item.lastError {
                            Text("- \(error)")
                                .font(.caption)
                                .foregroundColor(.zensationTextMuted)
                                .lineLimit(1)
                        }
                    }
                }
            }

            Spacer()

            // Retry button for failed items
            if item.retryCount > 0 {
                Button(action: onRetry) {
                    Image(systemName: "arrow.clockwise")
                        .foregroundColor(.zensationOrange)
                }
            }
        }
        .padding(.vertical, 8)
    }

    // MARK: - Type Properties
    private var typeIcon: String {
        switch item.type {
        case .textInput: return "text.bubble.fill"
        case .voiceMemo: return "waveform"
        case .audioInput: return "mic.fill"
        case .mediaInput: return "photo.fill"
        case .swipeAction: return "hand.draw.fill"
        }
    }

    private var typeColor: Color {
        switch item.type {
        case .textInput: return .blue
        case .voiceMemo, .audioInput: return .purple
        case .mediaInput: return .green
        case .swipeAction: return .orange
        }
    }

    private var typeLabel: String {
        switch item.type {
        case .textInput: return "Text-Eingabe"
        case .voiceMemo: return "Sprachnotiz"
        case .audioInput: return "Audio-Aufnahme"
        case .mediaInput: return "Media-Upload"
        case .swipeAction: return "Swipe-Aktion"
        }
    }

    private var contextLabel: String {
        // Try to extract context from payload
        if let context = extractContext() {
            return context == "personal" ? "🏠 Privat" : "💼 Arbeit"
        }
        return "📝 Allgemein"
    }

    private func extractContext() -> String? {
        // Decode payload to get context
        switch item.type {
        case .textInput:
            if let payload = try? JSONDecoder().decode(TextInputPayload.self, from: item.payload) {
                return payload.context
            }
        case .voiceMemo:
            if let payload = try? JSONDecoder().decode(VoiceMemoPayload.self, from: item.payload) {
                return payload.context
            }
        case .audioInput:
            if let payload = try? JSONDecoder().decode(AudioInputPayload.self, from: item.payload) {
                return payload.context
            }
        case .mediaInput:
            if let payload = try? JSONDecoder().decode(MediaInputPayload.self, from: item.payload) {
                return payload.context
            }
        case .swipeAction:
            return nil
        }
        return nil
    }
}

// MARK: - Queue Status Banner (for embedding in other views)
struct QueueStatusBanner: View {
    @EnvironmentObject var offlineQueueService: OfflineQueueService
    let onTap: () -> Void

    var body: some View {
        if !offlineQueueService.queuedItems.isEmpty {
            Button(action: onTap) {
                HStack(spacing: 12) {
                    // Status indicator
                    ZStack {
                        Circle()
                            .fill(offlineQueueService.isOnline ? Color.zensationOrange.opacity(0.2) : Color.zensationWarning.opacity(0.2))
                            .frame(width: 36, height: 36)

                        if offlineQueueService.isProcessing {
                            ProgressView()
                                .scaleEffect(0.6)
                        } else {
                            Image(systemName: offlineQueueService.isOnline ? "arrow.triangle.2.circlepath" : "wifi.slash")
                                .font(.subheadline)
                                .foregroundColor(offlineQueueService.isOnline ? .zensationOrange : .zensationWarning)
                        }
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(offlineQueueService.queuedItems.count) Einträge warten")
                            .font(.subheadline)
                            .fontWeight(.medium)

                        Text(offlineQueueService.isOnline ? "Tippen zum Synchronisieren" : "Warte auf Verbindung...")
                            .font(.caption)
                            .foregroundColor(.zensationTextMuted)
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundColor(.zensationTextMuted)
                }
                .padding()
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color.zensationSurface)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.zensationBorder, lineWidth: 1)
                )
            }
            .buttonStyle(PlainButtonStyle())
        }
    }
}

#Preview("Queue View") {
    OfflineQueueView()
        .environmentObject(OfflineQueueService.shared)
}

#Preview("Queue Banner") {
    VStack {
        QueueStatusBanner(onTap: {})
            .environmentObject(OfflineQueueService.shared)
    }
    .padding()
    .background(Color.zensationBackground)
}

import SwiftUI

// MARK: - Toast Types
enum ToastType {
    case success
    case error
    case info
    case processing

    var icon: String {
        switch self {
        case .success: return "checkmark.circle.fill"
        case .error: return "exclamationmark.circle.fill"
        case .info: return "info.circle.fill"
        case .processing: return "arrow.triangle.2.circlepath"
        }
    }

    var color: Color {
        switch self {
        case .success: return .zensationSuccess
        case .error: return .zensationDanger
        case .info: return .zensationOrange
        case .processing: return .blue
        }
    }
}

// MARK: - Toast Message
struct ToastMessage: Identifiable, Equatable {
    let id = UUID()
    let type: ToastType
    let title: String
    let message: String?
    let duration: Double

    init(type: ToastType, title: String, message: String? = nil, duration: Double = 3.0) {
        self.type = type
        self.title = title
        self.message = message
        self.duration = duration
    }

    static func == (lhs: ToastMessage, rhs: ToastMessage) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Toast View
struct ToastView: View {
    let toast: ToastMessage
    let onDismiss: () -> Void

    @State private var isAnimating = false

    var body: some View {
        HStack(spacing: 12) {
            // Icon with animation for processing
            if toast.type == .processing {
                Image(systemName: toast.type.icon)
                    .font(.title2)
                    .foregroundColor(toast.type.color)
                    .rotationEffect(.degrees(isAnimating ? 360 : 0))
                    .animation(.linear(duration: 1).repeatForever(autoreverses: false), value: isAnimating)
            } else {
                Image(systemName: toast.type.icon)
                    .font(.title2)
                    .foregroundColor(toast.type.color)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(toast.title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundColor(.primary)

                if let message = toast.message {
                    Text(message)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                }
            }

            Spacer()

            // Dismiss button (only for non-processing toasts)
            if toast.type != .processing {
                Button(action: onDismiss) {
                    Image(systemName: "xmark")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemBackground))
                .shadow(color: .black.opacity(0.15), radius: 10, x: 0, y: 4)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(toast.type.color.opacity(0.3), lineWidth: 1)
        )
        .padding(.horizontal)
        .onAppear {
            if toast.type == .processing {
                isAnimating = true
            }
        }
    }
}

// MARK: - Toast Manager
@MainActor
class ToastManager: ObservableObject {
    static let shared = ToastManager()

    @Published var currentToast: ToastMessage?
    @Published var toastQueue: [ToastMessage] = []

    private var dismissTask: Task<Void, Never>?

    private init() {}

    func show(_ toast: ToastMessage) {
        // Cancel any pending dismiss
        dismissTask?.cancel()

        withAnimation(.spring(response: 0.3)) {
            currentToast = toast
        }

        // Auto-dismiss non-processing toasts
        if toast.type != .processing {
            dismissTask = Task {
                try? await Task.sleep(nanoseconds: UInt64(toast.duration * 1_000_000_000))
                if !Task.isCancelled {
                    await MainActor.run {
                        self.dismiss()
                    }
                }
            }
        }
    }

    func dismiss() {
        dismissTask?.cancel()
        withAnimation(.spring(response: 0.3)) {
            currentToast = nil
        }
    }

    // Convenience methods
    func success(_ title: String, message: String? = nil) {
        show(ToastMessage(type: .success, title: title, message: message))
    }

    func error(_ title: String, message: String? = nil) {
        show(ToastMessage(type: .error, title: title, message: message, duration: 5.0))
    }

    func info(_ title: String, message: String? = nil) {
        show(ToastMessage(type: .info, title: title, message: message))
    }

    func processing(_ title: String, message: String? = nil) {
        show(ToastMessage(type: .processing, title: title, message: message))
    }
}

// MARK: - Toast Container View Modifier
struct ToastContainerModifier: ViewModifier {
    @ObservedObject var toastManager = ToastManager.shared

    func body(content: Content) -> some View {
        ZStack {
            content

            VStack {
                if let toast = toastManager.currentToast {
                    ToastView(toast: toast) {
                        toastManager.dismiss()
                    }
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .zIndex(100)
                }
                Spacer()
            }
            .padding(.top, 50)
        }
    }
}

extension View {
    func withToast() -> some View {
        modifier(ToastContainerModifier())
    }
}

// MARK: - Processing Status View (for detailed feedback)
struct ProcessingStatusView: View {
    let stages: [ProcessingStage]
    let currentStageIndex: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(stages.enumerated()), id: \.element.id) { index, stage in
                HStack(spacing: 12) {
                    // Status indicator
                    ZStack {
                        Circle()
                            .fill(stageColor(for: index).opacity(0.2))
                            .frame(width: 28, height: 28)

                        if index < currentStageIndex {
                            Image(systemName: "checkmark")
                                .font(.caption.bold())
                                .foregroundColor(stageColor(for: index))
                        } else if index == currentStageIndex {
                            ProgressView()
                                .scaleEffect(0.6)
                                .tint(stageColor(for: index))
                        } else {
                            Text("\(index + 1)")
                                .font(.caption.bold())
                                .foregroundColor(.secondary)
                        }
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text(stage.title)
                            .font(.subheadline)
                            .fontWeight(index == currentStageIndex ? .semibold : .regular)
                            .foregroundColor(index <= currentStageIndex ? .primary : .secondary)

                        if let subtitle = stage.subtitle, index == currentStageIndex {
                            Text(subtitle)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }

                    Spacer()
                }
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(.systemBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.zensationBorder, lineWidth: 1)
        )
    }

    private func stageColor(for index: Int) -> Color {
        if index < currentStageIndex {
            return .zensationSuccess
        } else if index == currentStageIndex {
            return .zensationOrange
        } else {
            return .secondary
        }
    }
}

struct ProcessingStage: Identifiable {
    let id = UUID()
    let title: String
    let subtitle: String?

    init(_ title: String, subtitle: String? = nil) {
        self.title = title
        self.subtitle = subtitle
    }
}

// MARK: - Result Card View (shows what was created)
struct ResultCardView: View {
    let icon: String
    let title: String
    let type: String
    let summary: String?
    let context: AIContext
    let onDismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            HStack {
                Image(systemName: "checkmark.circle.fill")
                    .font(.title)
                    .foregroundColor(.zensationSuccess)

                VStack(alignment: .leading) {
                    Text("Erfolgreich erstellt!")
                        .font(.headline)
                    Text("Im \(context.displayName)-Bereich")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()

                Button(action: onDismiss) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title2)
                        .foregroundColor(.secondary)
                }
            }

            Divider()

            // Created item preview
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundColor(context.color)
                    .frame(width: 40, height: 40)
                    .background(context.color.opacity(0.15))
                    .clipShape(RoundedRectangle(cornerRadius: 8))

                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.headline)
                        .lineLimit(2)

                    Text(type)
                        .font(.caption)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(Color.secondary.opacity(0.2))
                        .clipShape(Capsule())

                    if let summary = summary {
                        Text(summary)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .lineLimit(3)
                            .padding(.top, 4)
                    }
                }
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(.systemBackground))
                .shadow(color: .black.opacity(0.1), radius: 10, y: 4)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.zensationSuccess.opacity(0.3), lineWidth: 2)
        )
        .padding()
    }
}

#Preview("Toast Success") {
    ToastView(toast: ToastMessage(type: .success, title: "Idee gespeichert", message: "Als Priorität markiert")) {}
}

#Preview("Toast Processing") {
    ToastView(toast: ToastMessage(type: .processing, title: "Verarbeite...", message: "KI analysiert deinen Gedanken")) {}
}

#Preview("Processing Status") {
    ProcessingStatusView(
        stages: [
            ProcessingStage("Audio aufnehmen", subtitle: "3.2 Sekunden"),
            ProcessingStage("Transkribieren", subtitle: "Whisper AI"),
            ProcessingStage("KI analysiert", subtitle: "Erstelle Struktur..."),
            ProcessingStage("Speichern"),
        ],
        currentStageIndex: 2
    )
    .padding()
    .background(Color(.systemGray6))
}

#Preview("Result Card") {
    ResultCardView(
        icon: "lightbulb.fill",
        title: "RAG-System für Kundenbetreuung",
        type: "Idee",
        summary: "Ein intelligentes System zur automatischen Beantwortung von Kundenanfragen basierend auf historischen Daten.",
        context: .work,
        onDismiss: {}
    )
    .background(Color(.systemGray6))
}

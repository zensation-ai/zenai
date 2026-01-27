import SwiftUI

// MARK: - Deep Link Handler
enum DeepLink: Equatable {
    case record
    case text
    case search
    case incubator
    case idea(String)
    case draft(String)
    case cluster(String)
    case stories
    case graph
    case profile
    case settings

    static func from(url: URL) -> DeepLink? {
        guard url.scheme == "zenai" || url.scheme == "personalai" else { return nil }

        let path = url.host ?? url.path
        let pathComponents = url.pathComponents.filter { $0 != "/" }

        switch path {
        case "record": return .record
        case "text": return .text
        case "search": return .search
        case "incubator": return .incubator
        case "stories": return .stories
        case "graph": return .graph
        case "profile": return .profile
        case "settings": return .settings
        case "idea":
            if let ideaId = pathComponents.first {
                return .idea(ideaId)
            }
            return nil
        case "draft":
            if let draftId = pathComponents.first {
                return .draft(draftId)
            }
            return nil
        case "cluster":
            if let clusterId = pathComponents.first {
                return .cluster(clusterId)
            }
            return nil
        default:
            // Handle URLs like personalai://idea/uuid
            if path.hasPrefix("idea/") {
                let ideaId = String(path.dropFirst(5))
                return .idea(ideaId)
            }
            if path.hasPrefix("draft/") {
                let draftId = String(path.dropFirst(6))
                return .draft(draftId)
            }
            if path.hasPrefix("cluster/") {
                let clusterId = String(path.dropFirst(8))
                return .cluster(clusterId)
            }
            return nil
        }
    }
}

// MARK: - Deep Link Manager
class DeepLinkManager: ObservableObject {
    static let shared = DeepLinkManager()

    @Published var pendingDeepLink: DeepLink?
    @Published var selectedTab: Int = 2 // Default to record tab
    @Published var selectedIdeaId: String?
    @Published var showSearch: Bool = false

    // Push notification specific navigation targets
    @Published var pendingDraftId: String?
    @Published var pendingClusterId: String?

    func handle(_ deepLink: DeepLink) {
        // Clear previous pending navigation
        pendingDraftId = nil
        pendingClusterId = nil
        selectedIdeaId = nil

        switch deepLink {
        case .record:
            selectedTab = 2 // Record tab
        case .text:
            selectedTab = 2 // Record tab (text input is there)
        case .search:
            selectedTab = 1 // Ideas tab
            showSearch = true
        case .incubator:
            selectedTab = 0 // Review/Swipe tab (incubator is there)
        case .idea(let id):
            selectedTab = 1 // Ideas tab
            selectedIdeaId = id
        case .draft(let id):
            selectedTab = 1 // Ideas tab (drafts are shown in idea detail)
            pendingDraftId = id
        case .cluster(let id):
            selectedTab = 0 // Incubator tab
            pendingClusterId = id
        case .stories:
            selectedTab = 3 // Stories tab
        case .graph:
            selectedTab = 4 // Knowledge Graph tab
        case .profile, .settings:
            selectedTab = 5 // Profile tab
        }
        pendingDeepLink = nil
    }

    // MARK: - Navigation Helpers for Push Notifications

    /// Navigate to a draft (from draft_ready notification)
    func navigateToDraft(draftId: String) {
        pendingDraftId = draftId
        selectedTab = 1
    }

    /// Navigate to an idea
    func navigateToIdea(ideaId: String) {
        selectedIdeaId = ideaId
        selectedTab = 1
    }

    /// Navigate to a cluster in incubator
    func navigateToCluster(clusterId: String) {
        pendingClusterId = clusterId
        selectedTab = 0
    }

    /// Clear pending draft navigation
    func clearPendingDraft() {
        pendingDraftId = nil
    }

    /// Clear pending idea navigation
    func clearPendingIdea() {
        selectedIdeaId = nil
    }

    /// Clear pending cluster navigation
    func clearPendingCluster() {
        pendingClusterId = nil
    }
}

@main
struct PersonalAIBrainApp: App {
    @StateObject private var apiService = APIService()
    @StateObject private var localStorageService = LocalStorageService.shared
    @StateObject private var offlineQueueService = OfflineQueueService.shared
    @StateObject private var deepLinkManager = DeepLinkManager.shared
    @State private var showSplash = true

    // Phase 13: Biometric Lock
    @State private var isUnlocked = false
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ZStack {
                // Main Content (only when unlocked or biometric disabled)
                if isUnlocked || !BiometricService.shared.isEnabled {
                    ContentView()
                        .environmentObject(apiService)
                        .environmentObject(localStorageService)
                        .environmentObject(offlineQueueService)
                        .environmentObject(deepLinkManager)
                        .preferredColorScheme(.dark)
                        .task {
                            // Initial sync on app launch
                            await localStorageService.syncWithServer()
                        }
                } else {
                    // Lock Screen
                    LockScreenView {
                        withAnimation {
                            isUnlocked = true
                        }
                    }
                    .preferredColorScheme(.dark)
                }

                // Splash Screen (shown above everything initially)
                if showSplash {
                    SplashView()
                        .transition(.opacity)
                        .zIndex(1)
                }
            }
            .onAppear {
                // Check if biometric auth is enabled
                if !BiometricService.shared.isEnabled {
                    isUnlocked = true
                }

                // Hide splash after 1.5 seconds
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                    withAnimation(.easeOut(duration: 0.5)) {
                        showSplash = false
                    }
                }
            }
            .onChange(of: scenePhase) { oldPhase, newPhase in
                // Lock app when going to background (if biometric enabled)
                if newPhase == .background && BiometricService.shared.isEnabled {
                    isUnlocked = false
                }
            }
            // Phase 14: URL Scheme Handler for Widget & Siri Deep Links
            .onOpenURL { url in
                print("📱 Received deep link: \(url)")
                if let deepLink = DeepLink.from(url: url) {
                    if isUnlocked || !BiometricService.shared.isEnabled {
                        deepLinkManager.handle(deepLink)
                    } else {
                        // Store for after unlock
                        deepLinkManager.pendingDeepLink = deepLink
                    }
                }
            }
            .onChange(of: isUnlocked) { _, newValue in
                // Handle pending deep link after unlock
                if newValue, let pending = deepLinkManager.pendingDeepLink {
                    deepLinkManager.handle(pending)
                }
            }
        }
    }
}

// MARK: - Splash View

struct SplashView: View {
    @State private var logoScale: CGFloat = 0.5
    @State private var logoOpacity: Double = 0
    @State private var textOffset: CGFloat = 20
    @State private var textOpacity: Double = 0
    @State private var ringRotation: Double = 0
    @State private var ringScale: CGFloat = 0.8

    var body: some View {
        ZStack {
            // Background
            Color.zensationBackground
                .ignoresSafeArea()

            VStack(spacing: 24) {
                // Logo mit Animation
                ZStack {
                    // Outer rotating ring
                    Circle()
                        .trim(from: 0, to: 0.7)
                        .stroke(
                            AngularGradient(
                                colors: [.zensationOrange, .zensationOrangeLight, .zensationOrange.opacity(0.3)],
                                center: .center
                            ),
                            style: StrokeStyle(lineWidth: 4, lineCap: .round)
                        )
                        .frame(width: 120, height: 120)
                        .rotationEffect(.degrees(ringRotation))
                        .scaleEffect(ringScale)

                    // Pulsing ring
                    Circle()
                        .stroke(Color.zensationOrange.opacity(0.3), lineWidth: 2)
                        .frame(width: 140, height: 140)
                        .scaleEffect(ringScale)

                    // Brain Icon
                    Image(systemName: "brain.head.profile")
                        .font(.system(size: 50))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [.zensationOrange, .zensationOrangeLight],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .scaleEffect(logoScale)
                        .opacity(logoOpacity)
                }

                // App Name
                VStack(spacing: 4) {
                    Text("ZenAI")
                        .font(.title)
                        .fontWeight(.bold)
                        .foregroundColor(.zensationText)

                    Text("Enterprise AI by ZenSation")
                        .font(.subheadline)
                        .foregroundColor(.zensationTextMuted)
                }
                .offset(y: textOffset)
                .opacity(textOpacity)
            }
        }
        .onAppear {
            // Logo Animation
            withAnimation(.spring(response: 0.6, dampingFraction: 0.6).delay(0.1)) {
                logoScale = 1.0
                logoOpacity = 1.0
            }

            // Ring Animation
            withAnimation(.linear(duration: 2.0).repeatForever(autoreverses: false)) {
                ringRotation = 360
            }
            withAnimation(.easeOut(duration: 0.5)) {
                ringScale = 1.0
            }

            // Text Animation
            withAnimation(.easeOut(duration: 0.5).delay(0.3)) {
                textOffset = 0
                textOpacity = 1.0
            }
        }
    }
}

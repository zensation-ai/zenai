import SwiftUI

@main
struct PersonalAIBrainApp: App {
    @StateObject private var apiService = APIService()
    @StateObject private var localStorageService = LocalStorageService.shared
    @StateObject private var offlineQueueService = OfflineQueueService.shared
    @State private var showSplash = true

    var body: some Scene {
        WindowGroup {
            ZStack {
                ContentView()
                    .environmentObject(apiService)
                    .environmentObject(localStorageService)
                    .environmentObject(offlineQueueService)
                    .task {
                        // Initial sync on app launch
                        await localStorageService.syncWithServer()
                    }

                // Splash Screen
                if showSplash {
                    SplashView()
                        .transition(.opacity)
                        .zIndex(1)
                }
            }
            .onAppear {
                // Splash nach 1.5 Sekunden ausblenden
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                    withAnimation(.easeOut(duration: 0.5)) {
                        showSplash = false
                    }
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
                    // Äußerer rotierender Ring
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

                    // Pulsierender Ring
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
                    Text("Personal AI Brain")
                        .font(.title)
                        .fontWeight(.bold)
                        .foregroundColor(.zensationText)

                    Text("Dein digitales Gedächtnis")
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

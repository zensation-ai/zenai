import SwiftUI

// MARK: - AI Activity Types

enum AIActivityType {
    case idle
    case thinking
    case transcribing
    case searching
    case processing

    var label: String {
        switch self {
        case .idle: return ""
        case .thinking: return "Denke..."
        case .transcribing: return "Höre zu..."
        case .searching: return "Suche..."
        case .processing: return "Arbeite..."
        }
    }

    var detailedMessage: String {
        switch self {
        case .idle: return "Bereit für deinen nächsten Gedanken"
        case .thinking: return "Analysiere deinen Input..."
        case .transcribing: return "Wandle Sprache in Text um..."
        case .searching: return "Durchsuche semantische Embeddings..."
        case .processing: return "Strukturiere mit Mistral KI..."
        }
    }
}

// MARK: - AI Brain View

struct AIBrainView: View {
    let isActive: Bool
    var activityType: AIActivityType = .thinking
    var size: CGFloat = 48
    var ideasCount: Int = 0
    var showGreeting: Bool = false

    @State private var pulseScale: CGFloat = 1.0
    @State private var glowOpacity: Double = 0.3
    @State private var ringScale1: CGFloat = 0.8
    @State private var ringScale2: CGFloat = 0.8
    @State private var ringScale3: CGFloat = 0.8
    @State private var ringOpacity1: Double = 0.6
    @State private var ringOpacity2: Double = 0.6
    @State private var ringOpacity3: Double = 0.6
    @State private var neuralPhase: Double = 0
    @State private var nodeScale: [CGFloat] = Array(repeating: 1.0, count: 7)

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5..<12: return "Guten Morgen"
        case 12..<17: return "Guten Tag"
        case 17..<21: return "Guten Abend"
        default: return "Gute Nacht"
        }
    }

    private var contextMessage: String {
        if ideasCount == 0 {
            return "\(greeting)! Erzähl mir deinen ersten Gedanken."
        } else if ideasCount < 5 {
            return "\(greeting)! Du hast \(ideasCount) Gedanken."
        } else if ideasCount < 20 {
            return "\(greeting)! \(ideasCount) Gedanken gespeichert."
        } else {
            return "\(greeting)! Beeindruckend - \(ideasCount) Gedanken!"
        }
    }

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                // Glow rings
                if isActive {
                    glowRings
                }

                // Brain
                brainShape
                    .scaleEffect(pulseScale)
            }
            .frame(width: size * 1.8, height: size * 1.8)

            // Activity label or greeting
            if isActive && activityType != .idle {
                Text(activityType.label)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.zensationOrange)
                    .textCase(.uppercase)
                    .tracking(0.5)
                    .opacity(glowOpacity + 0.4)
            } else if showGreeting {
                Text(contextMessage)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.zensationTextMuted)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .frame(maxWidth: 200)
            }
        }
        .opacity(isActive ? 1.0 : 0.4)
        .animation(.easeInOut(duration: 0.5), value: isActive)
        .onAppear {
            startIdleAnimation()
        }
        .onChange(of: isActive) { _, newValue in
            if newValue {
                startActiveAnimations()
            } else {
                stopActiveAnimations()
            }
        }
    }

    // MARK: - Brain Shape

    private var brainShape: some View {
        ZStack {
            // Left hemisphere
            BrainHemisphere(isLeft: true)
                .fill(
                    LinearGradient(
                        colors: [.zensationOrange, .zensationOrangeLight],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .shadow(color: isActive ? .zensationOrange.opacity(0.6) : .clear, radius: 8)

            // Right hemisphere
            BrainHemisphere(isLeft: false)
                .fill(
                    LinearGradient(
                        colors: [.zensationOrangeLight, .zensationOrange],
                        startPoint: .topTrailing,
                        endPoint: .bottomLeading
                    )
                )
                .shadow(color: isActive ? .zensationOrange.opacity(0.6) : .clear, radius: 8)

            // Neural paths
            if isActive {
                neuralPaths
            }

            // Neural nodes
            neuralNodes
        }
        .frame(width: size, height: size)
    }

    // MARK: - Glow Rings

    private var glowRings: some View {
        ZStack {
            Circle()
                .stroke(Color.zensationOrange.opacity(0.3), lineWidth: 1)
                .frame(width: size * 1.3, height: size * 1.3)
                .scaleEffect(ringScale1)
                .opacity(ringOpacity1)

            Circle()
                .stroke(Color.zensationOrange.opacity(0.2), lineWidth: 1)
                .frame(width: size * 1.5, height: size * 1.5)
                .scaleEffect(ringScale2)
                .opacity(ringOpacity2)

            Circle()
                .stroke(Color.zensationOrange.opacity(0.1), lineWidth: 1)
                .frame(width: size * 1.7, height: size * 1.7)
                .scaleEffect(ringScale3)
                .opacity(ringOpacity3)
        }
    }

    // MARK: - Neural Paths

    private var neuralPaths: some View {
        ZStack {
            // Left side paths
            NeuralPath()
                .trim(from: 0, to: neuralPhase)
                .stroke(Color.white.opacity(0.6), lineWidth: 1.5)
                .frame(width: size * 0.3, height: size * 0.2)
                .offset(x: -size * 0.15, y: -size * 0.1)

            NeuralPath()
                .trim(from: 0, to: neuralPhase)
                .stroke(Color.white.opacity(0.5), lineWidth: 1.5)
                .frame(width: size * 0.3, height: size * 0.2)
                .offset(x: -size * 0.12, y: size * 0.05)

            // Right side paths
            NeuralPath()
                .trim(from: 0, to: neuralPhase)
                .stroke(Color.white.opacity(0.6), lineWidth: 1.5)
                .frame(width: size * 0.3, height: size * 0.2)
                .offset(x: size * 0.15, y: -size * 0.1)
                .scaleEffect(x: -1)

            NeuralPath()
                .trim(from: 0, to: neuralPhase)
                .stroke(Color.white.opacity(0.5), lineWidth: 1.5)
                .frame(width: size * 0.3, height: size * 0.2)
                .offset(x: size * 0.12, y: size * 0.05)
                .scaleEffect(x: -1)

            // Center line
            Rectangle()
                .fill(Color.white.opacity(0.3))
                .frame(width: 1, height: size * 0.5)
                .opacity(neuralPhase)
        }
    }

    // MARK: - Neural Nodes

    private var neuralNodes: some View {
        ZStack {
            // Left nodes
            Circle()
                .fill(Color.white)
                .frame(width: 4, height: 4)
                .scaleEffect(nodeScale[0])
                .offset(x: -size * 0.2, y: -size * 0.15)

            Circle()
                .fill(Color.white)
                .frame(width: 4, height: 4)
                .scaleEffect(nodeScale[1])
                .offset(x: -size * 0.12, y: 0)

            Circle()
                .fill(Color.white)
                .frame(width: 4, height: 4)
                .scaleEffect(nodeScale[2])
                .offset(x: -size * 0.18, y: size * 0.15)

            // Right nodes
            Circle()
                .fill(Color.white)
                .frame(width: 4, height: 4)
                .scaleEffect(nodeScale[3])
                .offset(x: size * 0.2, y: -size * 0.15)

            Circle()
                .fill(Color.white)
                .frame(width: 4, height: 4)
                .scaleEffect(nodeScale[4])
                .offset(x: size * 0.12, y: 0)

            Circle()
                .fill(Color.white)
                .frame(width: 4, height: 4)
                .scaleEffect(nodeScale[5])
                .offset(x: size * 0.18, y: size * 0.15)

            // Center node
            Circle()
                .fill(Color.white)
                .frame(width: 6, height: 6)
                .scaleEffect(nodeScale[6])
        }
        .opacity(isActive ? 1.0 : 0.5)
    }

    // MARK: - Animations

    private func startIdleAnimation() {
        withAnimation(
            .easeInOut(duration: 4)
            .repeatForever(autoreverses: true)
        ) {
            pulseScale = 1.03
            glowOpacity = 0.5
        }
    }

    private func startActiveAnimations() {
        // Pulse animation
        withAnimation(
            .easeInOut(duration: 1.2)
            .repeatForever(autoreverses: true)
        ) {
            pulseScale = 1.1
            glowOpacity = 1.0
        }

        // Ring animations
        animateRing1()
        animateRing2()
        animateRing3()

        // Neural flow
        withAnimation(
            .easeInOut(duration: 1.5)
            .repeatForever(autoreverses: true)
        ) {
            neuralPhase = 1.0
        }

        // Node animations
        animateNodes()
    }

    private func stopActiveAnimations() {
        withAnimation(.easeInOut(duration: 0.5)) {
            pulseScale = 1.0
            glowOpacity = 0.3
            ringScale1 = 0.8
            ringScale2 = 0.8
            ringScale3 = 0.8
            ringOpacity1 = 0
            ringOpacity2 = 0
            ringOpacity3 = 0
            neuralPhase = 0
            nodeScale = Array(repeating: 1.0, count: 7)
        }
        startIdleAnimation()
    }

    private func animateRing1() {
        withAnimation(
            .easeOut(duration: 2)
            .repeatForever(autoreverses: false)
        ) {
            ringScale1 = 1.4
            ringOpacity1 = 0
        }
    }

    private func animateRing2() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            withAnimation(
                .easeOut(duration: 2)
                .repeatForever(autoreverses: false)
            ) {
                ringScale2 = 1.4
                ringOpacity2 = 0
            }
        }
    }

    private func animateRing3() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            withAnimation(
                .easeOut(duration: 2)
                .repeatForever(autoreverses: false)
            ) {
                ringScale3 = 1.4
                ringOpacity3 = 0
            }
        }
    }

    private func animateNodes() {
        for i in 0..<7 {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.15) {
                withAnimation(
                    .easeInOut(duration: 0.8)
                    .repeatForever(autoreverses: true)
                ) {
                    nodeScale[i] = 1.5
                }
            }
        }
    }
}

// MARK: - Brain Hemisphere Shape

struct BrainHemisphere: Shape {
    let isLeft: Bool

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let width = rect.width
        let height = rect.height
        let centerX = width / 2
        let centerY = height / 2

        if isLeft {
            // Left hemisphere
            path.move(to: CGPoint(x: centerX, y: centerY - height * 0.25))
            path.addQuadCurve(
                to: CGPoint(x: centerX - width * 0.25, y: centerY - height * 0.28),
                control: CGPoint(x: centerX - width * 0.1, y: centerY - height * 0.3)
            )
            path.addQuadCurve(
                to: CGPoint(x: centerX - width * 0.35, y: centerY),
                control: CGPoint(x: centerX - width * 0.38, y: centerY - height * 0.15)
            )
            path.addQuadCurve(
                to: CGPoint(x: centerX - width * 0.2, y: centerY + height * 0.28),
                control: CGPoint(x: centerX - width * 0.35, y: centerY + height * 0.2)
            )
            path.addQuadCurve(
                to: CGPoint(x: centerX, y: centerY + height * 0.25),
                control: CGPoint(x: centerX - width * 0.05, y: centerY + height * 0.28)
            )
            path.addQuadCurve(
                to: CGPoint(x: centerX, y: centerY - height * 0.25),
                control: CGPoint(x: centerX - width * 0.02, y: centerY)
            )
        } else {
            // Right hemisphere (mirrored)
            path.move(to: CGPoint(x: centerX, y: centerY - height * 0.25))
            path.addQuadCurve(
                to: CGPoint(x: centerX + width * 0.25, y: centerY - height * 0.28),
                control: CGPoint(x: centerX + width * 0.1, y: centerY - height * 0.3)
            )
            path.addQuadCurve(
                to: CGPoint(x: centerX + width * 0.35, y: centerY),
                control: CGPoint(x: centerX + width * 0.38, y: centerY - height * 0.15)
            )
            path.addQuadCurve(
                to: CGPoint(x: centerX + width * 0.2, y: centerY + height * 0.28),
                control: CGPoint(x: centerX + width * 0.35, y: centerY + height * 0.2)
            )
            path.addQuadCurve(
                to: CGPoint(x: centerX, y: centerY + height * 0.25),
                control: CGPoint(x: centerX + width * 0.05, y: centerY + height * 0.28)
            )
            path.addQuadCurve(
                to: CGPoint(x: centerX, y: centerY - height * 0.25),
                control: CGPoint(x: centerX + width * 0.02, y: centerY)
            )
        }

        path.closeSubpath()
        return path
    }
}

// MARK: - Neural Path Shape

struct NeuralPath: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let width = rect.width
        let height = rect.height

        path.move(to: CGPoint(x: 0, y: height * 0.5))
        path.addQuadCurve(
            to: CGPoint(x: width * 0.5, y: height * 0.2),
            control: CGPoint(x: width * 0.25, y: height * 0.6)
        )
        path.addQuadCurve(
            to: CGPoint(x: width, y: height * 0.5),
            control: CGPoint(x: width * 0.75, y: height * 0.1)
        )

        return path
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        Color.zensationBackground
            .ignoresSafeArea()

        VStack(spacing: 40) {
            AIBrainView(isActive: false, ideasCount: 0, showGreeting: true)
            AIBrainView(isActive: false, ideasCount: 15, showGreeting: true)
            AIBrainView(isActive: true, activityType: .thinking, size: 64)
            AIBrainView(isActive: true, activityType: .transcribing, size: 80)
        }
    }
}

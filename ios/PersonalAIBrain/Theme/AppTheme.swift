import SwiftUI

// MARK: - Zensation Theme: Midnight Dark Petrol + Sunset Orange

extension Color {
    // Primary Accent Colors
    static let zensationOrange = Color(hex: "ff6b35")
    static let zensationOrangeDark = Color(hex: "e85a2a")
    static let zensationOrangeLight = Color(hex: "ff8c5a")

    // Background Colors
    static let zensationBackground = Color(hex: "0a1520")
    static let zensationSurface = Color(hex: "0f1f2e")
    static let zensationSurfaceLight = Color(hex: "1a3040")
    static let zensationSurfaceHover = Color(hex: "243a4d")

    // Text Colors
    static let zensationText = Color(hex: "f0f4f8")
    static let zensationTextMuted = Color(hex: "8ba3b8")
    static let zensationTextSecondary = Color(hex: "6b8a9e")

    // Border Colors
    static let zensationBorder = Color(hex: "2a4a5a")
    static let zensationBorderLight = Color(hex: "3a5a6a")

    // Semantic Colors
    static let zensationSuccess = Color(hex: "22c55e")
    static let zensationWarning = Color(hex: "ffb347")
    static let zensationDanger = Color(hex: "ef4444")

    // Hex Color Initializer
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - Theme Gradients

extension LinearGradient {
    static let zensationPrimary = LinearGradient(
        colors: [.zensationOrange, .zensationOrangeLight],
        startPoint: .leading,
        endPoint: .trailing
    )

    static let zensationBackground = LinearGradient(
        colors: [.zensationSurface, .zensationBackground],
        startPoint: .top,
        endPoint: .bottom
    )
}

// MARK: - Theme Modifiers

struct ZensationCardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(Color.zensationSurface)
            .cornerRadius(16)
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.zensationBorder, lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.2), radius: 8, x: 0, y: 4)
    }
}

struct ZensationButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(LinearGradient.zensationPrimary)
            .foregroundColor(.white)
            .fontWeight(.semibold)
            .cornerRadius(12)
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .shadow(color: .zensationOrange.opacity(0.3), radius: 8, x: 0, y: 4)
    }
}

extension View {
    func zensationCard() -> some View {
        modifier(ZensationCardStyle())
    }
}

import Foundation

// MARK: - Milestone Model
// Used for AI Evolution tracking and achievements

struct Milestone: Identifiable, Codable {
    let id: String
    let title: String
    let description: String
    let icon: String
    let achieved: Bool
    let progress: Int

    static let sampleData: [Milestone] = [
        Milestone(id: "1", title: "Erste Idee", description: "Deine erste Idee aufgenommen", icon: "lightbulb", achieved: true, progress: 100),
        Milestone(id: "2", title: "Fleißiger Denker", description: "50 Ideen aufgenommen", icon: "brain", achieved: true, progress: 100),
        Milestone(id: "3", title: "Feedback-Geber", description: "10 Feedback-Runden", icon: "bubble.left.and.bubble.right", achieved: true, progress: 100),
        Milestone(id: "4", title: "Power User", description: "100 Ideen aufgenommen", icon: "star.fill", achieved: false, progress: 78),
        Milestone(id: "5", title: "AI Trainer", description: "50 Feedback-Runden", icon: "graduationcap", achieved: false, progress: 34)
    ]
}

import SwiftUI

struct IdeaDetailView: View {
    let idea: Idea

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Image(systemName: idea.type.icon)
                            .font(.title2)
                            .foregroundColor(colorFor(idea.type))

                        Text(idea.type.displayName)
                            .font(.subheadline)
                            .foregroundColor(.secondary)

                        Spacer()

                        PriorityBadge(priority: idea.priority)
                    }

                    Text(idea.title)
                        .font(.title)
                        .fontWeight(.bold)

                    HStack {
                        Label(idea.category.displayName, systemImage: "folder")
                        Spacer()
                        Text(idea.createdAt.formatted(date: .long, time: .shortened))
                    }
                    .font(.caption)
                    .foregroundColor(.secondary)
                }
                .padding()
                .background(Color(.systemGray6))
                .clipShape(RoundedRectangle(cornerRadius: 12))

                // Summary
                if let summary = idea.summary {
                    SectionCard(title: "Zusammenfassung", icon: "doc.text") {
                        Text(summary)
                    }
                }

                // Next Steps
                if let nextSteps = idea.nextSteps, !nextSteps.isEmpty {
                    SectionCard(title: "Nächste Schritte", icon: "checklist") {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(nextSteps, id: \.self) { step in
                                HStack(alignment: .top, spacing: 8) {
                                    Image(systemName: "circle")
                                        .font(.caption)
                                        .foregroundColor(.blue)
                                    Text(step)
                                }
                            }
                        }
                    }
                }

                // Context Needed
                if let context = idea.contextNeeded, !context.isEmpty {
                    SectionCard(title: "Benötigter Kontext", icon: "questionmark.circle") {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(context, id: \.self) { item in
                                HStack(alignment: .top, spacing: 8) {
                                    Image(systemName: "arrow.right.circle")
                                        .font(.caption)
                                        .foregroundColor(.orange)
                                    Text(item)
                                }
                            }
                        }
                    }
                }

                // Keywords
                if let keywords = idea.keywords, !keywords.isEmpty {
                    SectionCard(title: "Keywords", icon: "tag") {
                        FlowLayout(spacing: 8) {
                            ForEach(keywords, id: \.self) { keyword in
                                Text(keyword)
                                    .font(.caption)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 4)
                                    .background(Color.blue.opacity(0.1))
                                    .foregroundColor(.blue)
                                    .clipShape(Capsule())
                            }
                        }
                    }
                }

                // Raw Transcript
                if let transcript = idea.rawTranscript {
                    SectionCard(title: "Original-Transkript", icon: "waveform") {
                        Text(transcript)
                            .font(.callout)
                            .foregroundColor(.secondary)
                            .italic()
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Details")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func colorFor(_ type: IdeaType) -> Color {
        switch type {
        case .idea: return .yellow
        case .task: return .blue
        case .insight: return .purple
        case .problem: return .red
        case .question: return .orange
        }
    }
}

// MARK: - Section Card

struct SectionCard<Content: View>: View {
    let title: String
    let icon: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: icon)
                Text(title)
                    .fontWeight(.semibold)
            }
            .font(.headline)

            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.05), radius: 5, x: 0, y: 2)
    }
}

// MARK: - Flow Layout

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = FlowResult(in: proposal.width ?? 0, subviews: subviews, spacing: spacing)
        return CGSize(width: proposal.width ?? 0, height: result.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = FlowResult(in: bounds.width, subviews: subviews, spacing: spacing)

        for (index, subview) in subviews.enumerated() {
            let point = result.positions[index]
            subview.place(at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y), proposal: .unspecified)
        }
    }

    struct FlowResult {
        var positions: [CGPoint] = []
        var height: CGFloat = 0

        init(in width: CGFloat, subviews: Subviews, spacing: CGFloat) {
            var currentX: CGFloat = 0
            var currentY: CGFloat = 0
            var lineHeight: CGFloat = 0

            for subview in subviews {
                let size = subview.sizeThatFits(.unspecified)

                if currentX + size.width > width && currentX > 0 {
                    currentX = 0
                    currentY += lineHeight + spacing
                    lineHeight = 0
                }

                positions.append(CGPoint(x: currentX, y: currentY))
                lineHeight = max(lineHeight, size.height)
                currentX += size.width + spacing
            }

            height = currentY + lineHeight
        }
    }
}

#Preview {
    NavigationStack {
        IdeaDetailView(idea: Idea.sampleData[0])
    }
}

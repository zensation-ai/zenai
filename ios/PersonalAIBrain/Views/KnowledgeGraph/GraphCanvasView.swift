//
//  GraphCanvasView.swift
//  PersonalAIBrain
//
//  Phase 8: Canvas-based Knowledge Graph visualization
//

import SwiftUI

struct GraphCanvasView: View {
    let nodes: [GraphNode]
    let edges: [GraphEdge]
    @Binding var selectedNodeId: String?
    let onNodeTap: (String) -> Void

    @State private var scale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @GestureState private var dragOffset: CGSize = .zero
    @GestureState private var magnifyBy: CGFloat = 1.0

    private let nodeRadius: CGFloat = 30
    private let canvasSize: CGSize = CGSize(width: 800, height: 600)

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Background
                Color.zensationBackground
                    .ignoresSafeArea()

                // Canvas with nodes and edges
                Canvas { context, size in
                    let effectiveScale = scale * magnifyBy
                    let effectiveOffset = CGSize(
                        width: offset.width + dragOffset.width,
                        height: offset.height + dragOffset.height
                    )

                    // Apply transformations
                    context.translateBy(x: size.width / 2 + effectiveOffset.width,
                                        y: size.height / 2 + effectiveOffset.height)
                    context.scaleBy(x: effectiveScale, y: effectiveScale)
                    context.translateBy(x: -canvasSize.width / 2, y: -canvasSize.height / 2)

                    // Draw edges first
                    for edge in edges {
                        drawEdge(context: context, edge: edge)
                    }

                    // Draw nodes on top
                    for node in nodes {
                        drawNode(context: context, node: node)
                    }
                }
                .gesture(
                    DragGesture()
                        .updating($dragOffset) { value, state, _ in
                            state = value.translation
                        }
                        .onEnded { value in
                            offset.width += value.translation.width
                            offset.height += value.translation.height
                        }
                )
                .gesture(
                    MagnificationGesture()
                        .updating($magnifyBy) { value, state, _ in
                            state = value
                        }
                        .onEnded { value in
                            scale = max(0.3, min(3.0, scale * value))
                        }
                )
                .onTapGesture { location in
                    handleTap(at: location, in: geometry.size)
                }

                // Node count indicator
                VStack {
                    Spacer()
                    HStack {
                        Text("\(nodes.count) Knoten, \(edges.count) Verbindungen")
                            .font(.caption)
                            .foregroundColor(.zensationTextMuted)
                            .padding(8)
                            .background(Color.zensationSurface.opacity(0.9))
                            .cornerRadius(8)
                        Spacer()
                    }
                    .padding()
                }
            }
        }
    }

    // MARK: - Drawing Functions

    private func drawNode(context: GraphicsContext, node: GraphNode) {
        guard let position = node.position else { return }

        let x = CGFloat(position.x) * canvasSize.width
        let y = CGFloat(position.y) * canvasSize.height
        let isSelected = selectedNodeId == node.id
        let radius = isSelected ? nodeRadius * 1.3 : nodeRadius

        let rect = CGRect(
            x: x - radius,
            y: y - radius,
            width: radius * 2,
            height: radius * 2
        )

        // Draw glow for selected node
        if isSelected {
            let glowRect = rect.insetBy(dx: -8, dy: -8)
            context.fill(
                Circle().path(in: glowRect),
                with: .color(Color.zensationOrange.opacity(0.3))
            )
        }

        // Draw node circle
        context.fill(
            Circle().path(in: rect),
            with: .color(node.color)
        )

        // Draw border
        context.stroke(
            Circle().path(in: rect),
            with: .color(isSelected ? Color.zensationOrange : Color.white.opacity(0.3)),
            lineWidth: isSelected ? 3 : 1
        )

        // Draw priority indicator (small circle at bottom)
        let indicatorRadius: CGFloat = 6
        let indicatorRect = CGRect(
            x: x - indicatorRadius,
            y: y + radius - indicatorRadius - 2,
            width: indicatorRadius * 2,
            height: indicatorRadius * 2
        )
        context.fill(
            Circle().path(in: indicatorRect),
            with: .color(node.priorityColor)
        )

        // Draw title (truncated)
        let title = String(node.title.prefix(15))
        let textRect = CGRect(
            x: x - 60,
            y: y + radius + 5,
            width: 120,
            height: 20
        )

        context.draw(
            Text(title)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.white),
            in: textRect
        )
    }

    private func drawEdge(context: GraphicsContext, edge: GraphEdge) {
        guard let sourceNode = nodes.first(where: { $0.id == edge.sourceId }),
              let targetNode = nodes.first(where: { $0.id == edge.targetId }),
              let sourcePos = sourceNode.position,
              let targetPos = targetNode.position else {
            return
        }

        let startX = CGFloat(sourcePos.x) * canvasSize.width
        let startY = CGFloat(sourcePos.y) * canvasSize.height
        let endX = CGFloat(targetPos.x) * canvasSize.width
        let endY = CGFloat(targetPos.y) * canvasSize.height

        let path = Path { p in
            p.move(to: CGPoint(x: startX, y: startY))
            p.addLine(to: CGPoint(x: endX, y: endY))
        }

        let lineWidth = max(1, CGFloat(edge.strength) * 3)
        let opacity = 0.4 + edge.strength * 0.4

        context.stroke(
            path,
            with: .color(edge.color.opacity(opacity)),
            lineWidth: lineWidth
        )

        // Draw arrow head for direction
        let angle = atan2(endY - startY, endX - startX)
        let arrowLength: CGFloat = 10
        let arrowX = endX - nodeRadius * cos(angle)
        let arrowY = endY - nodeRadius * sin(angle)

        let arrowPath = Path { p in
            p.move(to: CGPoint(x: arrowX, y: arrowY))
            p.addLine(to: CGPoint(
                x: arrowX - arrowLength * cos(angle - .pi / 6),
                y: arrowY - arrowLength * sin(angle - .pi / 6)
            ))
            p.move(to: CGPoint(x: arrowX, y: arrowY))
            p.addLine(to: CGPoint(
                x: arrowX - arrowLength * cos(angle + .pi / 6),
                y: arrowY - arrowLength * sin(angle + .pi / 6)
            ))
        }

        context.stroke(
            arrowPath,
            with: .color(edge.color.opacity(opacity)),
            lineWidth: 2
        )
    }

    // MARK: - Interaction

    private func handleTap(at location: CGPoint, in size: CGSize) {
        let effectiveScale = scale
        let effectiveOffset = offset

        // Convert tap location to canvas coordinates
        let canvasX = (location.x - size.width / 2 - effectiveOffset.width) / effectiveScale + canvasSize.width / 2
        let canvasY = (location.y - size.height / 2 - effectiveOffset.height) / effectiveScale + canvasSize.height / 2

        // Find tapped node
        for node in nodes {
            guard let position = node.position else { continue }
            let nodeX = CGFloat(position.x) * canvasSize.width
            let nodeY = CGFloat(position.y) * canvasSize.height

            let distance = sqrt(pow(canvasX - nodeX, 2) + pow(canvasY - nodeY, 2))
            if distance <= nodeRadius * 1.5 {
                onNodeTap(node.id)
                return
            }
        }

        // Tapped empty space - deselect
        selectedNodeId = nil
    }
}

// MARK: - Preview
struct GraphCanvasView_Previews: PreviewProvider {
    static var previews: some View {
        let sampleNodes = [
            GraphNode(id: "1", title: "Sample Idea", type: "idea", category: "business",
                      priority: "high", topicId: nil, topicName: nil, topicColor: nil,
                      position: GraphNode.Position(x: 0.3, y: 0.3)),
            GraphNode(id: "2", title: "Another Thought", type: "task", category: "technical",
                      priority: "medium", topicId: nil, topicName: nil, topicColor: nil,
                      position: GraphNode.Position(x: 0.7, y: 0.5)),
        ]

        let sampleEdges = [
            GraphEdge(id: "e1", sourceId: "1", targetId: "2", relationType: "similar_to",
                      strength: 0.8, reason: "Both about tech")
        ]

        return GraphCanvasView(
            nodes: sampleNodes,
            edges: sampleEdges,
            selectedNodeId: .constant(nil),
            onNodeTap: { _ in }
        )
    }
}

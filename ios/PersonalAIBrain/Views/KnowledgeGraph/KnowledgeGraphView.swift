//
//  KnowledgeGraphView.swift
//  PersonalAIBrain
//
//  Phase 8: Main Knowledge Graph View
//

import SwiftUI

struct KnowledgeGraphView: View {
    @EnvironmentObject var apiService: APIService
    @EnvironmentObject var contextManager: ContextManager

    @State private var graphData: GraphDataResponse?
    @State private var selectedNodeId: String?
    @State private var selectedTopic: Topic?
    @State private var showNodeDetail = false
    @State private var isLoading = false
    @State private var isGeneratingTopics = false
    @State private var isDiscovering = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ZStack {
                Color.zensationBackground
                    .ignoresSafeArea()

                if isLoading && graphData == nil {
                    GraphLoadingView()
                } else if let data = graphData {
                    GraphContentView(
                        graphData: data,
                        selectedNodeId: $selectedNodeId,
                        selectedTopic: $selectedTopic,
                        onNodeTap: handleNodeTap,
                        onGenerateTopics: generateTopics,
                        onDiscoverRelationships: discoverRelationships,
                        isGeneratingTopics: isGeneratingTopics,
                        isDiscovering: isDiscovering
                    )
                } else {
                    EmptyGraphView(onRefresh: loadGraph)
                }

                // Error banner
                if let error = errorMessage {
                    VStack {
                        ErrorBanner(message: error, onDismiss: { errorMessage = nil })
                        Spacer()
                    }
                }
            }
            .navigationTitle("Knowledge Graph")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button(action: loadGraph) {
                            Label("Aktualisieren", systemImage: "arrow.clockwise")
                        }
                        Button(action: generateTopics) {
                            Label("Themen generieren", systemImage: "folder.badge.plus")
                        }
                        Button(action: discoverRelationships) {
                            Label("Beziehungen entdecken", systemImage: "link.badge.plus")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .foregroundColor(.zensationOrange)
                    }
                }
            }
            .sheet(isPresented: $showNodeDetail) {
                if let nodeId = selectedNodeId,
                   let node = graphData?.nodes.first(where: { $0.id == nodeId }) {
                    NodeDetailSheet(node: node, graphData: graphData)
                }
            }
            .task {
                await loadGraphAsync()
            }
        }
    }

    // MARK: - Filtered Data

    private var filteredNodes: [GraphNode] {
        guard let data = graphData else { return [] }
        guard let topic = selectedTopic else { return data.nodes }
        return data.nodes.filter { topic.ideaIds.contains($0.id) }
    }

    private var filteredEdges: [GraphEdge] {
        guard let data = graphData else { return [] }
        let nodeIds = Set(filteredNodes.map { $0.id })
        return data.edges.filter { nodeIds.contains($0.sourceId) && nodeIds.contains($0.targetId) }
    }

    // MARK: - Actions

    private func handleNodeTap(_ nodeId: String) {
        selectedNodeId = nodeId
        showNodeDetail = true
    }

    private func loadGraph() {
        Task {
            await loadGraphAsync()
        }
    }

    private func loadGraphAsync() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let context = contextManager.currentContext.rawValue
            graphData = try await apiService.fetchKnowledgeGraph(context: context)
        } catch {
            errorMessage = "Fehler beim Laden: \(error.localizedDescription)"
        }
    }

    private func generateTopics() {
        Task {
            isGeneratingTopics = true
            defer { isGeneratingTopics = false }

            do {
                let context = contextManager.currentContext.rawValue
                _ = try await apiService.generateTopics(context: context)
                errorMessage = nil
                // Reload graph after generation
                await loadGraphAsync()
            } catch {
                errorMessage = "Fehler: \(error.localizedDescription)"
            }
        }
    }

    private func discoverRelationships() {
        Task {
            isDiscovering = true
            defer { isDiscovering = false }

            do {
                let context = contextManager.currentContext.rawValue
                _ = try await apiService.discoverRelationships(context: context)
                errorMessage = nil
                await loadGraphAsync()
            } catch {
                errorMessage = "Fehler: \(error.localizedDescription)"
            }
        }
    }
}

// MARK: - Graph Content View
struct GraphContentView: View {
    let graphData: GraphDataResponse
    @Binding var selectedNodeId: String?
    @Binding var selectedTopic: Topic?
    let onNodeTap: (String) -> Void
    let onGenerateTopics: () -> Void
    let onDiscoverRelationships: () -> Void
    let isGeneratingTopics: Bool
    let isDiscovering: Bool

    var filteredNodes: [GraphNode] {
        guard let topic = selectedTopic else { return graphData.nodes }
        return graphData.nodes.filter { topic.ideaIds.contains($0.id) }
    }

    var filteredEdges: [GraphEdge] {
        let nodeIds = Set(filteredNodes.map { $0.id })
        return graphData.edges.filter { nodeIds.contains($0.sourceId) && nodeIds.contains($0.targetId) }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Stats bar
            HStack(spacing: 16) {
                StatBadge(value: "\(graphData.stats.nodeCount)", label: "Ideen")
                StatBadge(value: "\(graphData.stats.edgeCount)", label: "Verbindungen")
                StatBadge(value: "\(graphData.stats.topicCount)", label: "Themen")
                Spacer()

                if isGeneratingTopics || isDiscovering {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .zensationOrange))
                        .scaleEffect(0.8)
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 12)
            .background(Color.zensationSurface)

            // Topic filter
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    TopicChip(
                        name: "Alle",
                        count: graphData.nodes.count,
                        color: .zensationOrange,
                        isSelected: selectedTopic == nil,
                        onTap: { selectedTopic = nil }
                    )

                    ForEach(graphData.topics) { topic in
                        TopicChip(
                            name: topic.name,
                            count: topic.ideaCount,
                            color: topic.swiftUIColor,
                            isSelected: selectedTopic?.id == topic.id,
                            onTap: {
                                selectedTopic = selectedTopic?.id == topic.id ? nil : topic
                            }
                        )
                    }

                    if graphData.topics.isEmpty {
                        Button(action: onGenerateTopics) {
                            HStack(spacing: 4) {
                                Image(systemName: "plus.circle.fill")
                                Text("Themen generieren")
                            }
                            .font(.caption)
                            .foregroundColor(.zensationOrange)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.zensationSurface)
                            .cornerRadius(16)
                        }
                        .disabled(isGeneratingTopics)
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 8)
            }
            .background(Color.zensationBackground)

            // Graph canvas
            GraphCanvasView(
                nodes: filteredNodes,
                edges: filteredEdges,
                selectedNodeId: $selectedNodeId,
                onNodeTap: onNodeTap
            )
        }
    }
}

// MARK: - Supporting Views

struct StatBadge: View {
    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.headline)
                .foregroundColor(.zensationText)
            Text(label)
                .font(.caption2)
                .foregroundColor(.zensationTextMuted)
        }
    }
}

struct TopicChip: View {
    let name: String
    let count: Int
    let color: Color
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 6) {
                Circle()
                    .fill(color)
                    .frame(width: 8, height: 8)
                Text(name)
                    .font(.caption)
                    .lineLimit(1)
                Text("(\(count))")
                    .font(.caption2)
                    .foregroundColor(.zensationTextMuted)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(isSelected ? color.opacity(0.2) : Color.zensationSurface)
            .foregroundColor(isSelected ? color : .zensationText)
            .cornerRadius(16)
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(isSelected ? color : Color.clear, lineWidth: 2)
            )
        }
    }
}

struct GraphLoadingView: View {
    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: .zensationOrange))
                .scaleEffect(1.5)
            Text("Lade Knowledge Graph...")
                .font(.subheadline)
                .foregroundColor(.zensationTextMuted)
        }
    }
}

struct EmptyGraphView: View {
    let onRefresh: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "network.slash")
                .font(.system(size: 60))
                .foregroundColor(.zensationTextMuted)

            Text("Kein Graph vorhanden")
                .font(.headline)
                .foregroundColor(.zensationText)

            Text("Erstelle zuerst einige Ideen oder lade den Graph neu.")
                .font(.subheadline)
                .foregroundColor(.zensationTextMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Button(action: onRefresh) {
                HStack {
                    Image(systemName: "arrow.clockwise")
                    Text("Neu laden")
                }
                .foregroundColor(.white)
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(Color.zensationOrange)
                .cornerRadius(10)
            }
        }
    }
}

struct ErrorBanner: View {
    let message: String
    let onDismiss: () -> Void

    var body: some View {
        HStack {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.zensationDanger)
            Text(message)
                .font(.caption)
                .foregroundColor(.zensationText)
            Spacer()
            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .foregroundColor(.zensationTextMuted)
            }
        }
        .padding()
        .background(Color.zensationSurface)
        .cornerRadius(8)
        .padding()
    }
}

// MARK: - Node Detail Sheet
struct NodeDetailSheet: View {
    let node: GraphNode
    let graphData: GraphDataResponse?

    @Environment(\.dismiss) var dismiss

    var connectedEdges: [GraphEdge] {
        graphData?.edges.filter { $0.sourceId == node.id || $0.targetId == node.id } ?? []
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Title
                    Text(node.title)
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(.zensationText)

                    // Badges
                    HStack(spacing: 12) {
                        Badge(text: node.type.capitalized, color: node.typeColor)
                        Badge(text: node.category.capitalized, color: .zensationTextMuted)
                        Badge(text: node.priority.capitalized, color: node.priorityColor)
                    }

                    // Topic
                    if let topicName = node.topicName {
                        HStack {
                            Text("Thema:")
                                .font(.subheadline)
                                .foregroundColor(.zensationTextMuted)
                            Text(topicName)
                                .font(.subheadline)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(node.color.opacity(0.2))
                                .cornerRadius(6)
                        }
                    }

                    Divider()

                    // Connections
                    if !connectedEdges.isEmpty {
                        Text("Verbindungen (\(connectedEdges.count))")
                            .font(.headline)
                            .foregroundColor(.zensationText)

                        ForEach(connectedEdges) { edge in
                            ConnectionRow(edge: edge, node: node, graphData: graphData)
                        }
                    } else {
                        Text("Keine Verbindungen")
                            .font(.subheadline)
                            .foregroundColor(.zensationTextMuted)
                    }
                }
                .padding()
            }
            .background(Color.zensationBackground)
            .navigationTitle("Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Fertig") {
                        dismiss()
                    }
                    .foregroundColor(.zensationOrange)
                }
            }
        }
    }
}

struct Badge: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.caption)
            .fontWeight(.medium)
            .foregroundColor(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(color)
            .cornerRadius(6)
    }
}

struct ConnectionRow: View {
    let edge: GraphEdge
    let node: GraphNode
    let graphData: GraphDataResponse?

    var connectedNode: GraphNode? {
        let otherId = edge.sourceId == node.id ? edge.targetId : edge.sourceId
        return graphData?.nodes.first { $0.id == otherId }
    }

    var body: some View {
        HStack {
            Circle()
                .fill(edge.color)
                .frame(width: 10, height: 10)

            VStack(alignment: .leading, spacing: 2) {
                Text(connectedNode?.title ?? "Unbekannt")
                    .font(.subheadline)
                    .foregroundColor(.zensationText)
                Text(edge.displayName)
                    .font(.caption)
                    .foregroundColor(.zensationTextMuted)
            }

            Spacer()

            Text("\(Int(edge.strength * 100))%")
                .font(.caption)
                .foregroundColor(.zensationTextMuted)
        }
        .padding()
        .background(Color.zensationSurface)
        .cornerRadius(8)
    }
}

// MARK: - Preview
struct KnowledgeGraphView_Previews: PreviewProvider {
    static var previews: some View {
        KnowledgeGraphView()
            .environmentObject(APIService())
            .environmentObject(ContextManager())
    }
}

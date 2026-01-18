import SwiftUI

struct EvolutionView: View {
    @EnvironmentObject var apiService: APIService
    @EnvironmentObject var contextManager: ContextManager

    @State private var evolutionData: EvolutionData?
    @State private var milestones: [Milestone] = []
    @State private var loading = true
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            Color.zensationBackground.ignoresSafeArea()

            if loading {
                VStack(spacing: 16) {
                    AIBrainView(isActive: true, activityType: .thinking, size: 48)
                    Text("Analysiere Evolution...")
                        .foregroundColor(.zensationTextMuted)
                }
            } else if let data = evolutionData {
                ScrollView {
                    VStack(spacing: 24) {
                        // Header Card
                        evolutionHeader(data: data)

                        // Learning Curve
                        learningCurveSection(data: data)

                        // Milestones
                        milestonesSection

                        // Accuracy Trends
                        accuracySection(data: data)

                        // Stats Grid
                        statsGrid(data: data)
                    }
                    .padding()
                }
            } else {
                emptyState
            }
        }
        .navigationTitle("AI Evolution")
        .navigationBarTitleDisplayMode(.large)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbarBackground(Color.zensationSurface, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .alert("Fehler", isPresented: .constant(errorMessage != nil)) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
        .task {
            await loadEvolutionData()
        }
    }

    // MARK: - Evolution Header

    private func evolutionHeader(data: EvolutionData) -> some View {
        VStack(spacing: 16) {
            // AI Brain Animation
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [.zensationOrange.opacity(0.3), .purple.opacity(0.3)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 100, height: 100)

                Image(systemName: "brain.head.profile")
                    .font(.system(size: 48))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [.zensationOrange, .purple],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            }

            VStack(spacing: 4) {
                Text("Level \(data.level)")
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(.zensationText)

                Text(data.levelTitle)
                    .font(.subheadline)
                    .foregroundColor(.zensationOrange)
            }

            // XP Progress
            VStack(spacing: 8) {
                HStack {
                    Text("\(data.xp) XP")
                        .font(.caption)
                        .foregroundColor(.zensationTextMuted)
                    Spacer()
                    Text("\(data.xpForNextLevel) XP")
                        .font(.caption)
                        .foregroundColor(.zensationTextMuted)
                }

                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.zensationSurface)
                            .frame(height: 8)

                        RoundedRectangle(cornerRadius: 4)
                            .fill(
                                LinearGradient(
                                    colors: [.zensationOrange, .purple],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(width: geo.size.width * data.xpProgress, height: 8)
                    }
                }
                .frame(height: 8)
            }
        }
        .padding(24)
        .background(Color.zensationSurface)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.zensationBorder, lineWidth: 1)
        )
    }

    // MARK: - Learning Curve

    private func learningCurveSection(data: EvolutionData) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .foregroundColor(.zensationOrange)
                Text("Lernkurve")
                    .font(.headline)
                    .foregroundColor(.zensationText)
            }

            // Simple bar chart
            HStack(alignment: .bottom, spacing: 8) {
                ForEach(Array(data.learningCurve.enumerated()), id: \.offset) { index, value in
                    VStack(spacing: 4) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(
                                LinearGradient(
                                    colors: [.zensationOrange.opacity(0.7), .purple.opacity(0.7)],
                                    startPoint: .bottom,
                                    endPoint: .top
                                )
                            )
                            .frame(height: CGFloat(value) * 1.2)

                        Text("W\(index + 1)")
                            .font(.caption2)
                            .foregroundColor(.zensationTextMuted)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 150)

            Text("Interaktionen pro Woche")
                .font(.caption)
                .foregroundColor(.zensationTextMuted)
        }
        .padding()
        .background(Color.zensationSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.zensationBorder, lineWidth: 1)
        )
    }

    // MARK: - Milestones

    private var milestonesSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Image(systemName: "trophy.fill")
                    .foregroundColor(.yellow)
                Text("Meilensteine")
                    .font(.headline)
                    .foregroundColor(.zensationText)

                Spacer()

                Text("\(milestones.filter { $0.achieved }.count)/\(milestones.count)")
                    .font(.caption)
                    .foregroundColor(.zensationTextMuted)
            }

            ForEach(milestones) { milestone in
                HStack(spacing: 12) {
                    ZStack {
                        Circle()
                            .fill(milestone.achieved ? Color.yellow.opacity(0.2) : Color.zensationSurface)
                            .frame(width: 40, height: 40)

                        Image(systemName: milestone.icon)
                            .foregroundColor(milestone.achieved ? .yellow : .zensationTextMuted)
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text(milestone.title)
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(milestone.achieved ? .zensationText : .zensationTextMuted)

                        Text(milestone.description)
                            .font(.caption)
                            .foregroundColor(.zensationTextMuted)
                    }

                    Spacer()

                    if milestone.achieved {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.zensationSuccess)
                    } else {
                        Text("\(milestone.progress)%")
                            .font(.caption)
                            .foregroundColor(.zensationTextMuted)
                    }
                }
                .padding(.vertical, 4)
            }
        }
        .padding()
        .background(Color.zensationSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.zensationBorder, lineWidth: 1)
        )
    }

    // MARK: - Accuracy Section

    private func accuracySection(data: EvolutionData) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Image(systemName: "target")
                    .foregroundColor(.zensationSuccess)
                Text("Genauigkeit")
                    .font(.headline)
                    .foregroundColor(.zensationText)
            }

            HStack(spacing: 20) {
                accuracyMetric(
                    title: "Kategorisierung",
                    value: data.categoryAccuracy,
                    color: .blue
                )

                accuracyMetric(
                    title: "Priorität",
                    value: data.priorityAccuracy,
                    color: .orange
                )

                accuracyMetric(
                    title: "Typ",
                    value: data.typeAccuracy,
                    color: .purple
                )
            }
        }
        .padding()
        .background(Color.zensationSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.zensationBorder, lineWidth: 1)
        )
    }

    private func accuracyMetric(title: String, value: Double, color: Color) -> some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .stroke(color.opacity(0.2), lineWidth: 6)

                Circle()
                    .trim(from: 0, to: value)
                    .stroke(color, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .rotationEffect(.degrees(-90))

                Text("\(Int(value * 100))%")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(.zensationText)
            }
            .frame(width: 60, height: 60)

            Text(title)
                .font(.caption2)
                .foregroundColor(.zensationTextMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Stats Grid

    private func statsGrid(data: EvolutionData) -> some View {
        LazyVGrid(columns: [
            GridItem(.flexible()),
            GridItem(.flexible())
        ], spacing: 12) {
            statCard(icon: "lightbulb.fill", title: "Ideen verarbeitet", value: "\(data.ideasProcessed)", color: .yellow)
            statCard(icon: "clock.fill", title: "Tage aktiv", value: "\(data.daysActive)", color: .blue)
            statCard(icon: "arrow.triangle.2.circlepath", title: "Feedback erhalten", value: "\(data.feedbackReceived)", color: .green)
            statCard(icon: "sparkles", title: "Verbesserungen", value: "\(data.improvements)", color: .purple)
        }
    }

    private func statCard(icon: String, title: String, value: String, color: Color) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundColor(color)

            Text(value)
                .font(.title)
                .fontWeight(.bold)
                .foregroundColor(.zensationText)

            Text(title)
                .font(.caption)
                .foregroundColor(.zensationTextMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color.zensationSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.zensationBorder, lineWidth: 1)
        )
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 20) {
            Image(systemName: "brain.head.profile")
                .font(.system(size: 60))
                .foregroundColor(.zensationTextMuted.opacity(0.5))

            Text("Noch keine Daten")
                .font(.title2)
                .fontWeight(.semibold)
                .foregroundColor(.zensationText)

            Text("Nutze die App regelmäßig, um die AI-Evolution zu verfolgen.")
                .font(.subheadline)
                .foregroundColor(.zensationTextMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
    }

    // MARK: - Data Loading

    private func loadEvolutionData() async {
        loading = true
        do {
            async let dataTask = apiService.fetchEvolutionData(context: contextManager.currentContext)
            async let milestonesTask = apiService.fetchMilestones(context: contextManager.currentContext)

            let (data, fetchedMilestones) = try await (dataTask, milestonesTask)
            evolutionData = data
            milestones = fetchedMilestones
        } catch {
            // Use sample data for preview
            evolutionData = EvolutionData.sample
            milestones = Milestone.sampleData
        }
        loading = false
    }
}

// MARK: - Models

struct EvolutionData: Codable {
    let level: Int
    let levelTitle: String
    let xp: Int
    let xpForNextLevel: Int
    let xpProgress: Double
    let learningCurve: [Int]
    let categoryAccuracy: Double
    let priorityAccuracy: Double
    let typeAccuracy: Double
    let ideasProcessed: Int
    let daysActive: Int
    let feedbackReceived: Int
    let improvements: Int

    enum CodingKeys: String, CodingKey {
        case level
        case levelTitle = "level_title"
        case xp
        case xpForNextLevel = "xp_for_next_level"
        case xpProgress = "xp_progress"
        case learningCurve = "learning_curve"
        case categoryAccuracy = "category_accuracy"
        case priorityAccuracy = "priority_accuracy"
        case typeAccuracy = "type_accuracy"
        case ideasProcessed = "ideas_processed"
        case daysActive = "days_active"
        case feedbackReceived = "feedback_received"
        case improvements
    }

    static let sample = EvolutionData(
        level: 5,
        levelTitle: "Thought Partner",
        xp: 2450,
        xpForNextLevel: 3000,
        xpProgress: 0.82,
        learningCurve: [45, 67, 89, 102, 78, 95, 120],
        categoryAccuracy: 0.87,
        priorityAccuracy: 0.92,
        typeAccuracy: 0.85,
        ideasProcessed: 156,
        daysActive: 45,
        feedbackReceived: 89,
        improvements: 12
    )
}

// Milestone is defined in Models/Milestone.swift

#Preview {
    NavigationStack {
        EvolutionView()
            .environmentObject(APIService())
            .environmentObject(ContextManager.shared)
    }
}

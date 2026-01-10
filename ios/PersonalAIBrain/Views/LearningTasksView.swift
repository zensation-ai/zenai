import SwiftUI

/// Phase 22: Learning Tasks View
/// Enables users to assign topics for the AI to study and deepen knowledge in
struct LearningTasksView: View {
    @StateObject private var viewModel = LearningTasksViewModel()
    @State private var showingAddTask = false
    @State private var selectedTask: LearningTask?
    @State private var showingTaskDetail = false

    var body: some View {
        NavigationView {
            ZStack {
                Color.zensationBackground.ignoresSafeArea()

                if viewModel.isLoading && viewModel.tasks.isEmpty {
                    ProgressView("Lade Lernaufgaben...")
                } else {
                    ScrollView {
                        VStack(spacing: 20) {
                            // Daily Summary Card
                            if let summary = viewModel.dailySummary {
                                DailyLearningCard(summary: summary)
                            }

                            // Stats Card
                            if let stats = viewModel.stats {
                                LearningStatsCard(stats: stats)
                            }

                            // Active Tasks Section
                            if !viewModel.activeTasks.isEmpty {
                                ActiveTasksSection(
                                    tasks: viewModel.activeTasks,
                                    onTaskTap: { task in
                                        selectedTask = task
                                        showingTaskDetail = true
                                    },
                                    onLogSession: { task in
                                        viewModel.selectedTaskForSession = task
                                        viewModel.showingLogSession = true
                                    }
                                )
                            }

                            // Completed Tasks Section
                            if !viewModel.completedTasks.isEmpty {
                                CompletedTasksSection(tasks: viewModel.completedTasks)
                            }

                            // Empty State
                            if viewModel.tasks.isEmpty && !viewModel.isLoading {
                                EmptyLearningView(onAddTask: { showingAddTask = true })
                            }
                        }
                        .padding()
                    }
                    .refreshable {
                        await viewModel.refresh()
                    }
                }
            }
            .navigationTitle("Lernaufgaben")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showingAddTask = true }) {
                        Image(systemName: "plus.circle.fill")
                            .foregroundColor(.zensationOrange)
                    }
                }
            }
            .sheet(isPresented: $showingAddTask) {
                AddLearningTaskSheet(viewModel: viewModel) {
                    showingAddTask = false
                }
            }
            .sheet(isPresented: $showingTaskDetail) {
                if let task = selectedTask {
                    LearningTaskDetailSheet(task: task, viewModel: viewModel)
                }
            }
            .sheet(isPresented: $viewModel.showingLogSession) {
                if let task = viewModel.selectedTaskForSession {
                    LogSessionSheet(task: task, viewModel: viewModel)
                }
            }
            .alert("Fehler", isPresented: .constant(viewModel.errorMessage != nil)) {
                Button("OK") { viewModel.errorMessage = nil }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
        .task {
            await viewModel.loadData()
        }
    }
}

// MARK: - Daily Learning Card

struct DailyLearningCard: View {
    let summary: DailyLearningSummary

    var body: some View {
        VStack(spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Heute")
                        .font(.headline)
                        .foregroundColor(.zensationText)
                    if summary.streakDays > 0 {
                        HStack(spacing: 4) {
                            Image(systemName: "flame.fill")
                                .foregroundColor(.orange)
                            Text("\(summary.streakDays) Tage Streak")
                                .font(.caption)
                                .foregroundColor(.zensationTextMuted)
                        }
                    }
                }
                Spacer()
                VStack(alignment: .trailing) {
                    Text("\(summary.minutesToday) Min")
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(.zensationOrange)
                    Text("gelernt")
                        .font(.caption)
                        .foregroundColor(.zensationTextMuted)
                }
            }

            HStack(spacing: 24) {
                DailyStat(value: "\(summary.sessionsToday)", label: "Sessions", icon: "book.fill")
                DailyStat(value: "\(summary.tasksStudiedToday)", label: "Themen", icon: "lightbulb.fill")
            }

            if let nextTask = summary.nextRecommendedTask {
                Divider()
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Empfohlen")
                            .font(.caption)
                            .foregroundColor(.zensationTextMuted)
                        Text(nextTask.topic)
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(.zensationText)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .foregroundColor(.zensationTextMuted)
                }
            }
        }
        .padding()
        .background(Color.zensationSurface)
        .cornerRadius(16)
    }
}

struct DailyStat: View {
    let value: String
    let label: String
    let icon: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .foregroundColor(.zensationOrange)
            VStack(alignment: .leading, spacing: 2) {
                Text(value)
                    .font(.headline)
                    .foregroundColor(.zensationText)
                Text(label)
                    .font(.caption)
                    .foregroundColor(.zensationTextMuted)
            }
        }
    }
}

// MARK: - Stats Card

struct LearningStatsCard: View {
    let stats: LearningStats

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Text("Statistik")
                    .font(.headline)
                    .foregroundColor(.zensationText)
                Spacer()
                Text(stats.formattedStudyTime)
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.zensationOrange.opacity(0.2))
                    .cornerRadius(8)
            }

            HStack(spacing: 16) {
                LearningStatItem(value: stats.activeTasks, label: "Aktiv", color: .blue)
                LearningStatItem(value: stats.completedTasks, label: "Fertig", color: .green)
                LearningStatItem(value: stats.totalSessions, label: "Sessions", color: .purple)
                LearningStatItem(value: stats.avgProgress, label: "% Fortschritt", color: .orange)
            }
        }
        .padding()
        .background(Color.zensationSurface)
        .cornerRadius(16)
    }
}

struct LearningStatItem: View {
    let value: Int
    let label: String
    let color: Color

    var body: some View {
        VStack(spacing: 4) {
            Text("\(value)")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(color)
            Text(label)
                .font(.caption2)
                .foregroundColor(.zensationTextMuted)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Active Tasks Section

struct ActiveTasksSection: View {
    let tasks: [LearningTask]
    let onTaskTap: (LearningTask) -> Void
    let onLogSession: (LearningTask) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "book.fill")
                    .foregroundColor(.zensationOrange)
                Text("Aktive Lernaufgaben")
                    .font(.headline)
                    .foregroundColor(.zensationText)
                Spacer()
                Text("\(tasks.count)")
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.zensationOrange.opacity(0.2))
                    .cornerRadius(8)
            }

            ForEach(tasks) { task in
                LearningTaskCard(
                    task: task,
                    onTap: { onTaskTap(task) },
                    onLogSession: { onLogSession(task) }
                )
            }
        }
    }
}

struct LearningTaskCard: View {
    let task: LearningTask
    let onTap: () -> Void
    let onLogSession: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(task.topic)
                        .font(.headline)
                        .foregroundColor(.zensationText)
                    if let category = task.category {
                        Text(task.categoryLabel)
                            .font(.caption)
                            .foregroundColor(.zensationTextMuted)
                    }
                }
                Spacer()
                LearningPriorityBadge(priority: task.priority)
            }

            // Progress
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Fortschritt")
                        .font(.caption)
                        .foregroundColor(.zensationTextMuted)
                    Spacer()
                    Text("\(task.progressPercent)%")
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundColor(.zensationOrange)
                }

                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.gray.opacity(0.2))
                            .frame(height: 6)

                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.zensationOrange)
                            .frame(width: geo.size.width * CGFloat(task.progressPercent) / 100, height: 6)
                    }
                }
                .frame(height: 6)
            }

            // Stats Row
            HStack(spacing: 16) {
                HStack(spacing: 4) {
                    Image(systemName: "clock")
                        .font(.caption)
                    Text("\(task.totalStudyMinutes) Min")
                        .font(.caption)
                }
                .foregroundColor(.zensationTextMuted)

                HStack(spacing: 4) {
                    Image(systemName: "checkmark.circle")
                        .font(.caption)
                    Text("\(task.studyCount) Sessions")
                        .font(.caption)
                }
                .foregroundColor(.zensationTextMuted)

                Spacer()
            }

            // Actions
            HStack(spacing: 12) {
                Button(action: onLogSession) {
                    HStack {
                        Image(systemName: "play.fill")
                        Text("Lernen")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.zensationOrange)

                Button(action: onTap) {
                    Image(systemName: "info.circle")
                }
                .buttonStyle(.bordered)
            }
        }
        .padding()
        .background(Color.zensationSurface)
        .cornerRadius(12)
    }
}

struct LearningPriorityBadge: View {
    let priority: String

    var color: Color {
        switch priority {
        case "high": return .red
        case "medium": return .orange
        case "low": return .green
        default: return .gray
        }
    }

    var label: String {
        switch priority {
        case "high": return "Hoch"
        case "medium": return "Mittel"
        case "low": return "Niedrig"
        default: return priority
        }
    }

    var body: some View {
        Text(label)
            .font(.caption2)
            .fontWeight(.medium)
            .foregroundColor(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color)
            .cornerRadius(6)
    }
}

// MARK: - Completed Tasks Section

struct CompletedTasksSection: View {
    let tasks: [LearningTask]
    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button(action: { withAnimation { isExpanded.toggle() } }) {
                HStack {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                    Text("Abgeschlossen")
                        .font(.headline)
                        .foregroundColor(.zensationText)
                    Spacer()
                    Text("\(tasks.count)")
                        .font(.caption)
                        .foregroundColor(.zensationTextMuted)
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .foregroundColor(.zensationTextMuted)
                }
            }

            if isExpanded {
                ForEach(tasks.prefix(5)) { task in
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(task.topic)
                                .font(.subheadline)
                                .foregroundColor(.zensationText)
                            Text("\(task.totalStudyMinutes) Min gelernt")
                                .font(.caption)
                                .foregroundColor(.zensationTextMuted)
                        }
                        Spacer()
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.green)
                    }
                    .padding()
                    .background(Color.zensationSurface)
                    .cornerRadius(8)
                }
            }
        }
    }
}

// MARK: - Empty State

struct EmptyLearningView: View {
    let onAddTask: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "book.closed")
                .font(.system(size: 60))
                .foregroundColor(.zensationTextMuted)

            Text("Keine Lernaufgaben")
                .font(.headline)
                .foregroundColor(.zensationText)

            Text("Gib der KI Themen zum Lernen,\nz.B. 'Neue Management-Methoden'\noder 'Agile Frameworks'")
                .font(.subheadline)
                .foregroundColor(.zensationTextMuted)
                .multilineTextAlignment(.center)

            Button(action: onAddTask) {
                HStack {
                    Image(systemName: "plus.circle.fill")
                    Text("Erste Lernaufgabe erstellen")
                }
                .foregroundColor(.white)
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(Color.zensationOrange)
                .cornerRadius(10)
            }
        }
        .padding(40)
    }
}

// MARK: - Add Task Sheet

struct AddLearningTaskSheet: View {
    @ObservedObject var viewModel: LearningTasksViewModel
    let onDismiss: () -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var topic = ""
    @State private var description = ""
    @State private var category = "other"
    @State private var priority = "medium"
    @State private var generateOutline = true
    @State private var isSubmitting = false

    let categories = [
        ("leadership", "Führung"),
        ("technology", "Technologie"),
        ("business", "Business"),
        ("personal_development", "Persönliche Entwicklung"),
        ("communication", "Kommunikation"),
        ("creativity", "Kreativität"),
        ("productivity", "Produktivität"),
        ("health", "Gesundheit"),
        ("finance", "Finanzen"),
        ("other", "Sonstiges")
    ]

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Thema")) {
                    TextField("z.B. Neue Management-Methoden", text: $topic)

                    TextField("Beschreibung (optional)", text: $description, axis: .vertical)
                        .lineLimit(3...6)
                }

                Section(header: Text("Kategorie")) {
                    Picker("Kategorie", selection: $category) {
                        ForEach(categories, id: \.0) { cat in
                            Text(cat.1).tag(cat.0)
                        }
                    }
                }

                Section(header: Text("Priorität")) {
                    Picker("Priorität", selection: $priority) {
                        Text("Niedrig").tag("low")
                        Text("Mittel").tag("medium")
                        Text("Hoch").tag("high")
                    }
                    .pickerStyle(.segmented)
                }

                Section {
                    Toggle("Lernplan generieren", isOn: $generateOutline)
                } footer: {
                    Text("Die KI erstellt automatisch einen strukturierten Lernplan für dieses Thema.")
                }
            }
            .navigationTitle("Neue Lernaufgabe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Erstellen") {
                        isSubmitting = true
                        Task {
                            await viewModel.createTask(
                                topic: topic,
                                description: description.isEmpty ? nil : description,
                                category: category,
                                priority: priority,
                                generateOutline: generateOutline
                            )
                            isSubmitting = false
                            onDismiss()
                        }
                    }
                    .disabled(topic.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSubmitting)
                }
            }
            .overlay {
                if isSubmitting {
                    Color.black.opacity(0.3)
                        .ignoresSafeArea()
                    VStack {
                        ProgressView()
                        Text("Erstelle Lernaufgabe...")
                            .font(.caption)
                            .foregroundColor(.white)
                            .padding(.top, 8)
                    }
                }
            }
        }
    }
}

// MARK: - Task Detail Sheet

struct LearningTaskDetailSheet: View {
    let task: LearningTask
    @ObservedObject var viewModel: LearningTasksViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Header
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(task.topic)
                                .font(.title2)
                                .fontWeight(.bold)
                            Spacer()
                            LearningPriorityBadge(priority: task.priority)
                        }

                        if let description = task.description {
                            Text(description)
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }

                        HStack {
                            Text(task.categoryLabel)
                                .font(.caption)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.blue.opacity(0.2))
                                .cornerRadius(6)

                            Text(task.statusLabel)
                                .font(.caption)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.gray.opacity(0.2))
                                .cornerRadius(6)
                        }
                    }

                    Divider()

                    // Progress
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Fortschritt")
                            .font(.headline)

                        HStack {
                            Text("\(task.progressPercent)%")
                                .font(.title)
                                .fontWeight(.bold)
                                .foregroundColor(.zensationOrange)

                            Spacer()

                            VStack(alignment: .trailing) {
                                Text("\(task.totalStudyMinutes) Min")
                                    .font(.subheadline)
                                Text("\(task.studyCount) Sessions")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }

                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 6)
                                    .fill(Color.gray.opacity(0.2))
                                    .frame(height: 10)

                                RoundedRectangle(cornerRadius: 6)
                                    .fill(Color.zensationOrange)
                                    .frame(width: geo.size.width * CGFloat(task.progressPercent) / 100, height: 10)
                            }
                        }
                        .frame(height: 10)
                    }

                    // Learning Outline
                    if let outline = task.learningOutline {
                        Divider()
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Lernplan")
                                .font(.headline)
                            Text(outline)
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                    }

                    Divider()

                    // Actions
                    VStack(spacing: 12) {
                        Button(action: {
                            viewModel.selectedTaskForSession = task
                            viewModel.showingLogSession = true
                            dismiss()
                        }) {
                            HStack {
                                Image(systemName: "play.fill")
                                Text("Lernsitzung starten")
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.zensationOrange)

                        if task.learningOutline == nil {
                            Button(action: {
                                Task {
                                    await viewModel.generateOutline(for: task.id)
                                }
                            }) {
                                HStack {
                                    Image(systemName: "sparkles")
                                    Text("Lernplan generieren")
                                }
                                .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                        }

                        if task.status == "active" {
                            Button(action: {
                                Task {
                                    await viewModel.updateTaskStatus(task.id, status: "completed")
                                    dismiss()
                                }
                            }) {
                                HStack {
                                    Image(systemName: "checkmark.circle")
                                    Text("Als abgeschlossen markieren")
                                }
                                .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                            .tint(.green)
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fertig") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Log Session Sheet

struct LogSessionSheet: View {
    let task: LearningTask
    @ObservedObject var viewModel: LearningTasksViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var sessionType = "study"
    @State private var durationMinutes = 15
    @State private var notes = ""
    @State private var understandingLevel = 3
    @State private var isSubmitting = false

    let sessionTypes = [
        ("study", "Lernen"),
        ("practice", "Übung"),
        ("review", "Wiederholung"),
        ("reflection", "Reflexion")
    ]

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Session für: \(task.topic)")) {
                    Picker("Art", selection: $sessionType) {
                        ForEach(sessionTypes, id: \.0) { type in
                            Text(type.1).tag(type.0)
                        }
                    }
                }

                Section(header: Text("Dauer")) {
                    Stepper("\(durationMinutes) Minuten", value: $durationMinutes, in: 5...180, step: 5)
                }

                Section(header: Text("Verständnis")) {
                    HStack {
                        ForEach(1...5, id: \.self) { level in
                            Button(action: { understandingLevel = level }) {
                                Image(systemName: level <= understandingLevel ? "star.fill" : "star")
                                    .foregroundColor(level <= understandingLevel ? .yellow : .gray)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }

                Section(header: Text("Notizen (optional)")) {
                    TextEditor(text: $notes)
                        .frame(minHeight: 100)
                }
            }
            .navigationTitle("Session protokollieren")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Speichern") {
                        isSubmitting = true
                        Task {
                            await viewModel.logSession(
                                taskId: task.id,
                                sessionType: sessionType,
                                durationMinutes: durationMinutes,
                                notes: notes.isEmpty ? nil : notes,
                                understandingLevel: understandingLevel
                            )
                            isSubmitting = false
                            dismiss()
                        }
                    }
                    .disabled(isSubmitting)
                }
            }
        }
    }
}

// MARK: - View Model

@MainActor
class LearningTasksViewModel: ObservableObject {
    @Published var tasks: [LearningTask] = []
    @Published var stats: LearningStats?
    @Published var dailySummary: DailyLearningSummary?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var showingLogSession = false
    @Published var selectedTaskForSession: LearningTask?

    var activeTasks: [LearningTask] {
        tasks.filter { $0.status == "active" }
    }

    var completedTasks: [LearningTask] {
        tasks.filter { $0.status == "completed" }
    }

    func loadData() async {
        isLoading = true
        defer { isLoading = false }

        do {
            async let tasksTask = LearningTasksService.shared.getTasks()
            async let statsTask = LearningTasksService.shared.getStats()
            async let summaryTask = LearningTasksService.shared.getDailySummary()

            let (fetchedTasks, fetchedStats, fetchedSummary) = try await (tasksTask, statsTask, summaryTask)

            self.tasks = fetchedTasks
            self.stats = fetchedStats
            self.dailySummary = fetchedSummary
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refresh() async {
        await loadData()
    }

    func createTask(topic: String, description: String?, category: String, priority: String, generateOutline: Bool) async {
        do {
            let task = try await LearningTasksService.shared.createTask(
                topic: topic,
                description: description,
                category: category,
                priority: priority,
                generateOutline: generateOutline
            )
            tasks.insert(task, at: 0)
            await loadData() // Refresh stats
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func logSession(taskId: String, sessionType: String, durationMinutes: Int, notes: String?, understandingLevel: Int) async {
        do {
            _ = try await LearningTasksService.shared.logSession(
                taskId: taskId,
                sessionType: sessionType,
                durationMinutes: durationMinutes,
                notes: notes,
                understandingLevel: understandingLevel
            )
            await loadData() // Refresh to get updated progress
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func updateTaskStatus(_ taskId: String, status: String) async {
        do {
            _ = try await LearningTasksService.shared.updateTask(id: taskId, updates: ["status": status])
            await loadData()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func generateOutline(for taskId: String) async {
        do {
            _ = try await LearningTasksService.shared.generateOutline(taskId: taskId)
            await loadData()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Preview

#Preview {
    LearningTasksView()
}

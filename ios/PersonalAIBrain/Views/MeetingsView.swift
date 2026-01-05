import SwiftUI

struct MeetingsView: View {
    @EnvironmentObject var apiService: APIService
    @State private var meetings: [Meeting] = []
    @State private var isLoading = false
    @State private var showingNewMeeting = false
    @State private var selectedMeeting: Meeting?
    @State private var filter: MeetingFilter = .all

    enum MeetingFilter {
        case all, scheduled, completed
    }

    var filteredMeetings: [Meeting] {
        switch filter {
        case .all:
            return meetings
        case .scheduled:
            return meetings.filter { $0.status == .scheduled || $0.status == .inProgress }
        case .completed:
            return meetings.filter { $0.status == .completed }
        }
    }

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Filter Picker
                Picker("Filter", selection: $filter) {
                    Text("Alle (\(meetings.count))").tag(MeetingFilter.all)
                    Text("Geplant").tag(MeetingFilter.scheduled)
                    Text("Abgeschlossen").tag(MeetingFilter.completed)
                }
                .pickerStyle(.segmented)
                .padding()

                if isLoading {
                    Spacer()
                    ProgressView()
                    Spacer()
                } else if filteredMeetings.isEmpty {
                    Spacer()
                    VStack(spacing: 16) {
                        Image(systemName: "calendar")
                            .font(.system(size: 60))
                            .foregroundColor(.zensationTextMuted)
                        Text("Keine Meetings")
                            .font(.headline)
                        Text("Erstelle dein erstes Meeting")
                            .font(.subheadline)
                            .foregroundColor(.zensationTextMuted)
                    }
                    Spacer()
                } else {
                    List {
                        ForEach(filteredMeetings) { meeting in
                            MeetingRow(meeting: meeting)
                                .onTapGesture {
                                    selectedMeeting = meeting
                                }
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Meetings")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showingNewMeeting = true }) {
                        Image(systemName: "plus")
                    }
                }
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: loadMeetings) {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
            .sheet(isPresented: $showingNewMeeting) {
                NewMeetingView { meeting in
                    meetings.insert(meeting, at: 0)
                }
            }
            .sheet(item: $selectedMeeting) { meeting in
                MeetingDetailView(meeting: meeting)
            }
            .task {
                await loadMeetingsAsync()
            }
        }
    }

    private func loadMeetings() {
        Task {
            await loadMeetingsAsync()
        }
    }

    private func loadMeetingsAsync() async {
        isLoading = true
        do {
            meetings = try await apiService.fetchMeetings()
        } catch {
            print("Failed to load meetings: \(error)")
        }
        isLoading = false
    }
}

struct MeetingRow: View {
    let meeting: Meeting

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: meeting.meetingType.icon)
                    .foregroundColor(.blue)

                Text(meeting.title)
                    .font(.headline)

                Spacer()

                Text(meeting.status.displayName)
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(statusColor.opacity(0.2))
                    .foregroundColor(statusColor)
                    .cornerRadius(8)
            }

            HStack {
                Image(systemName: "calendar")
                    .foregroundColor(.zensationTextMuted)
                    .font(.caption)
                Text(meeting.date, style: .date)
                    .font(.subheadline)
                    .foregroundColor(.zensationTextMuted)

                Text(meeting.date, style: .time)
                    .font(.subheadline)
                    .foregroundColor(.zensationTextMuted)

                if let duration = meeting.durationMinutes {
                    Text("• \(duration) Min")
                        .font(.subheadline)
                        .foregroundColor(.zensationTextMuted)
                }
            }

            if !meeting.participants.isEmpty {
                HStack {
                    Image(systemName: "person.2")
                        .foregroundColor(.zensationTextMuted)
                        .font(.caption)
                    Text(meeting.participants.prefix(3).joined(separator: ", "))
                        .font(.caption)
                        .foregroundColor(.zensationTextMuted)
                    if meeting.participants.count > 3 {
                        Text("+\(meeting.participants.count - 3)")
                            .font(.caption)
                            .foregroundColor(.zensationTextMuted)
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }

    private var statusColor: Color {
        switch meeting.status {
        case .scheduled: return .blue
        case .inProgress: return .orange
        case .completed: return .green
        case .cancelled: return .gray
        }
    }
}

struct NewMeetingView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var apiService: APIService

    @State private var title = ""
    @State private var date = Date()
    @State private var meetingType: MeetingType = .internal
    @State private var participants = ""
    @State private var location = ""
    @State private var isSubmitting = false

    let onCreated: (Meeting) -> Void

    var body: some View {
        NavigationView {
            Form {
                Section("Details") {
                    TextField("Titel", text: $title)
                    DatePicker("Datum & Zeit", selection: $date)
                    Picker("Typ", selection: $meetingType) {
                        ForEach(MeetingType.allCases, id: \.self) { type in
                            Label(type.displayName, systemImage: type.icon)
                                .tag(type)
                        }
                    }
                }

                Section("Teilnehmer") {
                    TextField("Namen (kommasepariert)", text: $participants)
                }

                Section("Ort") {
                    TextField("Ort / Zoom Link", text: $location)
                }
            }
            .navigationTitle("Neues Meeting")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Abbrechen") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Erstellen") {
                        createMeeting()
                    }
                    .disabled(title.isEmpty || isSubmitting)
                }
            }
        }
    }

    private func createMeeting() {
        isSubmitting = true
        let participantsList = participants
            .split(separator: ",")
            .map { String($0).trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }

        Task {
            do {
                let meeting = try await apiService.createMeeting(
                    title: title,
                    date: date,
                    meetingType: meetingType,
                    participants: participantsList,
                    location: location.isEmpty ? nil : location
                )
                onCreated(meeting)
                dismiss()
            } catch {
                print("Create meeting failed: \(error)")
            }
            isSubmitting = false
        }
    }
}

struct MeetingDetailView: View {
    @EnvironmentObject var apiService: APIService
    @Environment(\.dismiss) var dismiss

    let meeting: Meeting
    @State private var notes: MeetingNotes?
    @State private var isLoading = true
    @State private var showingAddNotes = false
    @State private var transcript = ""
    @State private var isProcessing = false

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Meeting Info
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Image(systemName: meeting.meetingType.icon)
                                .font(.title2)
                                .foregroundColor(.blue)
                            VStack(alignment: .leading) {
                                Text(meeting.title)
                                    .font(.title2)
                                    .fontWeight(.bold)
                                Text(meeting.date, style: .date)
                                    .foregroundColor(.zensationTextMuted)
                            }
                        }

                        if !meeting.participants.isEmpty {
                            Label(meeting.participants.joined(separator: ", "), systemImage: "person.2")
                                .foregroundColor(.zensationTextMuted)
                        }

                        if let location = meeting.location {
                            Label(location, systemImage: "location")
                                .foregroundColor(.zensationTextMuted)
                        }
                    }
                    .padding()
                    .background(Color(.systemGray6))
                    .cornerRadius(12)

                    if isLoading {
                        HStack {
                            Spacer()
                            ProgressView()
                            Spacer()
                        }
                        .padding()
                    } else if let notes = notes {
                        // Notes Content
                        NotesContentView(notes: notes)
                    } else {
                        // Add Notes Section
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Notizen hinzufügen")
                                .font(.headline)

                            TextEditor(text: $transcript)
                                .frame(minHeight: 150)
                                .padding(8)
                                .background(Color(.systemGray6))
                                .cornerRadius(8)

                            Button(action: processNotes) {
                                HStack {
                                    if isProcessing {
                                        ProgressView()
                                            .tint(.white)
                                    } else {
                                        Image(systemName: "sparkles")
                                    }
                                    Text(isProcessing ? "Verarbeite..." : "Verarbeiten")
                                }
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(transcript.isEmpty ? Color.gray : Color.blue)
                                .foregroundColor(.white)
                                .cornerRadius(10)
                            }
                            .disabled(transcript.isEmpty || isProcessing)
                        }
                        .padding()
                        .background(Color(.systemGray6))
                        .cornerRadius(12)
                    }
                }
                .padding()
            }
            .navigationTitle("Meeting Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fertig") {
                        dismiss()
                    }
                }
            }
            .task {
                await loadNotes()
            }
        }
    }

    private func loadNotes() async {
        do {
            notes = try await apiService.getMeetingNotes(meetingId: meeting.id)
        } catch {
            print("Failed to load notes: \(error)")
        }
        isLoading = false
    }

    private func processNotes() {
        isProcessing = true
        Task {
            do {
                notes = try await apiService.addMeetingNotes(meetingId: meeting.id, transcript: transcript)
            } catch {
                print("Failed to process notes: \(error)")
            }
            isProcessing = false
        }
    }
}

struct NotesContentView: View {
    let notes: MeetingNotes

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            // Summary
            VStack(alignment: .leading, spacing: 8) {
                Label("Zusammenfassung", systemImage: "doc.text")
                    .font(.headline)
                Text(notes.structuredSummary)
                    .foregroundColor(.zensationTextMuted)
            }

            // Topics
            if !notes.topicsDiscussed.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Label("Themen", systemImage: "list.bullet")
                        .font(.headline)
                    ForEach(notes.topicsDiscussed, id: \.self) { topic in
                        Text("• \(topic)")
                            .foregroundColor(.zensationTextMuted)
                    }
                }
            }

            // Decisions
            if !notes.keyDecisions.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Label("Entscheidungen", systemImage: "checkmark.seal")
                        .font(.headline)
                    ForEach(notes.keyDecisions, id: \.self) { decision in
                        HStack(alignment: .top) {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                            Text(decision)
                        }
                    }
                }
            }

            // Action Items
            if !notes.actionItems.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Label("Aktionspunkte", systemImage: "list.bullet.rectangle")
                        .font(.headline)
                    ForEach(notes.actionItems, id: \.task) { item in
                        HStack(alignment: .top) {
                            Circle()
                                .fill(priorityColor(item.priority))
                                .frame(width: 8, height: 8)
                                .padding(.top, 6)
                            VStack(alignment: .leading) {
                                Text(item.task)
                                if let assignee = item.assignee {
                                    Text(assignee)
                                        .font(.caption)
                                        .foregroundColor(.zensationTextMuted)
                                }
                            }
                        }
                    }
                }
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    private func priorityColor(_ priority: String) -> Color {
        switch priority {
        case "high": return .red
        case "medium": return .orange
        default: return .gray
        }
    }
}

#Preview {
    MeetingsView()
        .environmentObject(APIService())
}

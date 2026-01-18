import Foundation
import SQLite3

// MARK: - Local Storage Service
@MainActor
class LocalStorageService: ObservableObject {
    static let shared = LocalStorageService()

    private var db: OpaquePointer?
    private let dbName = "personal_ai_brain.sqlite"

    @Published var localIdeas: [Idea] = []
    @Published var syncStatus: SyncStatus = .synced

    enum SyncStatus {
        case synced
        case pendingSync
        case syncing
        case error(String)
    }

    private init() {
        openDatabase()
        createTables()
        loadLocalIdeas()
    }

    deinit {
        sqlite3_close(db)
    }

    // MARK: - Database Setup

    private func openDatabase() {
        let fileURL = getDocumentsDirectory().appendingPathComponent(dbName)

        if sqlite3_open(fileURL.path, &db) != SQLITE_OK {
            print("Error opening database: \(String(cString: sqlite3_errmsg(db)))")
        }
    }

    private func getDocumentsDirectory() -> URL {
        guard let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            fatalError("Unable to access documents directory")
        }
        return url
    }

    private func createTables() {
        let createIdeasTable = """
        CREATE TABLE IF NOT EXISTS ideas (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            type TEXT NOT NULL,
            category TEXT NOT NULL,
            priority TEXT NOT NULL,
            summary TEXT,
            next_steps TEXT,
            context_needed TEXT,
            keywords TEXT,
            raw_transcript TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            is_synced INTEGER DEFAULT 1,
            local_changes INTEGER DEFAULT 0
        );
        """

        let createSwipeActionsTable = """
        CREATE TABLE IF NOT EXISTS swipe_actions (
            id TEXT PRIMARY KEY,
            idea_id TEXT NOT NULL,
            action TEXT NOT NULL,
            created_at TEXT NOT NULL,
            is_synced INTEGER DEFAULT 0,
            FOREIGN KEY (idea_id) REFERENCES ideas(id)
        );
        """

        let createSyncLogTable = """
        CREATE TABLE IF NOT EXISTS sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            action TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            is_synced INTEGER DEFAULT 0
        );
        """

        executeSQL(createIdeasTable)
        executeSQL(createSwipeActionsTable)
        executeSQL(createSyncLogTable)
    }

    private func executeSQL(_ sql: String) {
        var statement: OpaquePointer?

        if sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK {
            if sqlite3_step(statement) != SQLITE_DONE {
                print("Error executing SQL: \(String(cString: sqlite3_errmsg(db)))")
            }
        } else {
            print("Error preparing SQL: \(String(cString: sqlite3_errmsg(db)))")
        }

        sqlite3_finalize(statement)
    }

    // MARK: - Ideas CRUD

    func saveIdea(_ idea: Idea, isSynced: Bool = true) {
        let sql = """
        INSERT OR REPLACE INTO ideas
        (id, title, type, category, priority, summary, next_steps, context_needed, keywords, raw_transcript, created_at, updated_at, is_synced, local_changes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """

        var statement: OpaquePointer?

        if sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK {
            let dateFormatter = ISO8601DateFormatter()

            sqlite3_bind_text(statement, 1, (idea.id as NSString).utf8String, -1, nil)
            sqlite3_bind_text(statement, 2, (idea.title as NSString).utf8String, -1, nil)
            sqlite3_bind_text(statement, 3, (idea.type.rawValue as NSString).utf8String, -1, nil)
            sqlite3_bind_text(statement, 4, (idea.category.rawValue as NSString).utf8String, -1, nil)
            sqlite3_bind_text(statement, 5, (idea.priority.rawValue as NSString).utf8String, -1, nil)

            if let summary = idea.summary {
                sqlite3_bind_text(statement, 6, (summary as NSString).utf8String, -1, nil)
            } else {
                sqlite3_bind_null(statement, 6)
            }

            if let nextSteps = idea.nextSteps {
                do {
                    let json = try JSONEncoder().encode(nextSteps)
                    let jsonString = String(data: json, encoding: .utf8) ?? "[]"
                    sqlite3_bind_text(statement, 7, (jsonString as NSString).utf8String, -1, nil)
                } catch {
                    print("Error encoding nextSteps: \(error.localizedDescription)")
                    sqlite3_bind_text(statement, 7, ("[]" as NSString).utf8String, -1, nil)
                }
            } else {
                sqlite3_bind_null(statement, 7)
            }

            if let contextNeeded = idea.contextNeeded {
                do {
                    let json = try JSONEncoder().encode(contextNeeded)
                    let jsonString = String(data: json, encoding: .utf8) ?? "[]"
                    sqlite3_bind_text(statement, 8, (jsonString as NSString).utf8String, -1, nil)
                } catch {
                    print("Error encoding contextNeeded: \(error.localizedDescription)")
                    sqlite3_bind_text(statement, 8, ("[]" as NSString).utf8String, -1, nil)
                }
            } else {
                sqlite3_bind_null(statement, 8)
            }

            if let keywords = idea.keywords {
                do {
                    let json = try JSONEncoder().encode(keywords)
                    let jsonString = String(data: json, encoding: .utf8) ?? "[]"
                    sqlite3_bind_text(statement, 9, (jsonString as NSString).utf8String, -1, nil)
                } catch {
                    print("Error encoding keywords: \(error.localizedDescription)")
                    sqlite3_bind_text(statement, 9, ("[]" as NSString).utf8String, -1, nil)
                }
            } else {
                sqlite3_bind_null(statement, 9)
            }

            if let rawTranscript = idea.rawTranscript {
                sqlite3_bind_text(statement, 10, (rawTranscript as NSString).utf8String, -1, nil)
            } else {
                sqlite3_bind_null(statement, 10)
            }

            sqlite3_bind_text(statement, 11, (dateFormatter.string(from: idea.createdAt) as NSString).utf8String, -1, nil)
            sqlite3_bind_text(statement, 12, (dateFormatter.string(from: idea.updatedAt) as NSString).utf8String, -1, nil)
            sqlite3_bind_int(statement, 13, isSynced ? 1 : 0)
            sqlite3_bind_int(statement, 14, isSynced ? 0 : 1)

            if sqlite3_step(statement) != SQLITE_DONE {
                print("Error saving idea: \(String(cString: sqlite3_errmsg(db)))")
            }
        }

        sqlite3_finalize(statement)
        loadLocalIdeas()
    }

    func saveIdeas(_ ideas: [Idea]) {
        for idea in ideas {
            saveIdea(idea, isSynced: true)
        }
    }

    func loadLocalIdeas() {
        let sql = "SELECT * FROM ideas ORDER BY created_at DESC;"
        var statement: OpaquePointer?
        var ideas: [Idea] = []

        if sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK {
            while sqlite3_step(statement) == SQLITE_ROW {
                if let idea = parseIdeaFromStatement(statement) {
                    ideas.append(idea)
                }
            }
        }

        sqlite3_finalize(statement)
        localIdeas = ideas
    }

    private func parseIdeaFromStatement(_ statement: OpaquePointer?) -> Idea? {
        guard let statement = statement else { return nil }

        let dateFormatter = ISO8601DateFormatter()

        guard
            let idCString = sqlite3_column_text(statement, 0),
            let titleCString = sqlite3_column_text(statement, 1),
            let typeCString = sqlite3_column_text(statement, 2),
            let categoryCString = sqlite3_column_text(statement, 3),
            let priorityCString = sqlite3_column_text(statement, 4),
            let createdAtCString = sqlite3_column_text(statement, 10),
            let updatedAtCString = sqlite3_column_text(statement, 11)
        else {
            return nil
        }

        let id = String(cString: idCString)
        let title = String(cString: titleCString)
        let typeString = String(cString: typeCString)
        let categoryString = String(cString: categoryCString)
        let priorityString = String(cString: priorityCString)

        guard
            let type = IdeaType(rawValue: typeString),
            let category = IdeaCategory(rawValue: categoryString),
            let priority = Priority(rawValue: priorityString),
            let createdAt = dateFormatter.date(from: String(cString: createdAtCString)),
            let updatedAt = dateFormatter.date(from: String(cString: updatedAtCString))
        else {
            return nil
        }

        let summary = sqlite3_column_text(statement, 5).map { String(cString: $0) }

        let nextSteps: [String]? = {
            guard let cString = sqlite3_column_text(statement, 6) else { return nil }
            let jsonString = String(cString: cString)
            do {
                return try JSONDecoder().decode([String].self, from: jsonString.data(using: .utf8) ?? Data())
            } catch {
                print("Error decoding nextSteps JSON: \(error.localizedDescription)")
                return nil
            }
        }()

        let contextNeeded: [String]? = {
            guard let cString = sqlite3_column_text(statement, 7) else { return nil }
            let jsonString = String(cString: cString)
            do {
                return try JSONDecoder().decode([String].self, from: jsonString.data(using: .utf8) ?? Data())
            } catch {
                print("Error decoding contextNeeded JSON: \(error.localizedDescription)")
                return nil
            }
        }()

        let keywords: [String]? = {
            guard let cString = sqlite3_column_text(statement, 8) else { return nil }
            let jsonString = String(cString: cString)
            do {
                return try JSONDecoder().decode([String].self, from: jsonString.data(using: .utf8) ?? Data())
            } catch {
                print("Error decoding keywords JSON: \(error.localizedDescription)")
                return nil
            }
        }()

        let rawTranscript = sqlite3_column_text(statement, 9).map { String(cString: $0) }

        return Idea(
            id: id,
            title: title,
            type: type,
            category: category,
            priority: priority,
            summary: summary,
            nextSteps: nextSteps,
            contextNeeded: contextNeeded,
            keywords: keywords,
            rawTranscript: rawTranscript,
            context: nil,  // Local storage doesn't track context
            createdAt: createdAt,
            updatedAt: updatedAt
        )
    }

    func deleteIdea(_ id: String) {
        let sql = "DELETE FROM ideas WHERE id = ?;"
        var statement: OpaquePointer?

        if sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK {
            sqlite3_bind_text(statement, 1, (id as NSString).utf8String, -1, nil)

            if sqlite3_step(statement) != SQLITE_DONE {
                print("Error deleting idea: \(String(cString: sqlite3_errmsg(db)))")
            }
        }

        sqlite3_finalize(statement)
        loadLocalIdeas()
    }

    // MARK: - Swipe Actions

    func saveSwipeAction(ideaId: String, action: SwipeAction) {
        let sql = """
        INSERT INTO swipe_actions (id, idea_id, action, created_at, is_synced)
        VALUES (?, ?, ?, ?, 0);
        """

        var statement: OpaquePointer?

        if sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK {
            let dateFormatter = ISO8601DateFormatter()
            let id = UUID().uuidString

            sqlite3_bind_text(statement, 1, (id as NSString).utf8String, -1, nil)
            sqlite3_bind_text(statement, 2, (ideaId as NSString).utf8String, -1, nil)
            sqlite3_bind_text(statement, 3, (action.rawValue as NSString).utf8String, -1, nil)
            sqlite3_bind_text(statement, 4, (dateFormatter.string(from: Date()) as NSString).utf8String, -1, nil)

            if sqlite3_step(statement) != SQLITE_DONE {
                print("Error saving swipe action: \(String(cString: sqlite3_errmsg(db)))")
            }
        }

        sqlite3_finalize(statement)
        updateSyncStatus()
    }

    func getUnsyncedSwipeActions() -> [(id: String, ideaId: String, action: String)] {
        let sql = "SELECT id, idea_id, action FROM swipe_actions WHERE is_synced = 0;"
        var statement: OpaquePointer?
        var actions: [(String, String, String)] = []

        if sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK {
            while sqlite3_step(statement) == SQLITE_ROW {
                if let idCString = sqlite3_column_text(statement, 0),
                   let ideaIdCString = sqlite3_column_text(statement, 1),
                   let actionCString = sqlite3_column_text(statement, 2) {
                    actions.append((
                        String(cString: idCString),
                        String(cString: ideaIdCString),
                        String(cString: actionCString)
                    ))
                }
            }
        }

        sqlite3_finalize(statement)
        return actions
    }

    func markSwipeActionSynced(_ id: String) {
        let sql = "UPDATE swipe_actions SET is_synced = 1 WHERE id = ?;"
        var statement: OpaquePointer?

        if sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK {
            sqlite3_bind_text(statement, 1, (id as NSString).utf8String, -1, nil)

            if sqlite3_step(statement) != SQLITE_DONE {
                print("Error marking swipe action synced: \(String(cString: sqlite3_errmsg(db)))")
            }
        }

        sqlite3_finalize(statement)
        updateSyncStatus()
    }

    // MARK: - Sync Status

    private func updateSyncStatus() {
        let unsyncedCount = getUnsyncedCount()

        if unsyncedCount > 0 {
            syncStatus = .pendingSync
        } else {
            syncStatus = .synced
        }
    }

    private func getUnsyncedCount() -> Int {
        let sql = """
        SELECT
            (SELECT COUNT(*) FROM ideas WHERE is_synced = 0) +
            (SELECT COUNT(*) FROM swipe_actions WHERE is_synced = 0) as total;
        """

        var statement: OpaquePointer?
        var count = 0

        if sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK {
            if sqlite3_step(statement) == SQLITE_ROW {
                count = Int(sqlite3_column_int(statement, 0))
            }
        }

        sqlite3_finalize(statement)
        return count
    }

    // MARK: - Sync with Server

    func syncWithServer() async {
        syncStatus = .syncing

        let apiService = APIService.shared

        do {
            // Fetch latest from server
            let serverIdeas = try await apiService.fetchIdeas()
            saveIdeas(serverIdeas)

            // Sync local swipe actions (TODO: implement backend endpoint)
            let unsyncedActions = getUnsyncedSwipeActions()
            for action in unsyncedActions {
                // TODO: Send to server when endpoint is available
                markSwipeActionSynced(action.id)
            }

            syncStatus = .synced
        } catch {
            syncStatus = .error(error.localizedDescription)
        }
    }

    // MARK: - Search Local

    func searchLocal(query: String) -> [Idea] {
        let lowercaseQuery = query.lowercased()
        return localIdeas.filter { idea in
            idea.title.lowercased().contains(lowercaseQuery) ||
            (idea.summary?.lowercased().contains(lowercaseQuery) ?? false) ||
            (idea.keywords?.contains { $0.lowercased().contains(lowercaseQuery) } ?? false)
        }
    }

    // MARK: - Statistics

    func getStatistics() -> LocalStorageStats {
        var stats = LocalStorageStats()

        let countSQL = "SELECT COUNT(*) FROM ideas;"
        var statement: OpaquePointer?

        if sqlite3_prepare_v2(db, countSQL, -1, &statement, nil) == SQLITE_OK {
            if sqlite3_step(statement) == SQLITE_ROW {
                stats.totalIdeas = Int(sqlite3_column_int(statement, 0))
            }
        }
        sqlite3_finalize(statement)

        let unsyncedSQL = "SELECT COUNT(*) FROM ideas WHERE is_synced = 0;"
        if sqlite3_prepare_v2(db, unsyncedSQL, -1, &statement, nil) == SQLITE_OK {
            if sqlite3_step(statement) == SQLITE_ROW {
                stats.unsyncedIdeas = Int(sqlite3_column_int(statement, 0))
            }
        }
        sqlite3_finalize(statement)

        let actionsSQL = "SELECT COUNT(*) FROM swipe_actions;"
        if sqlite3_prepare_v2(db, actionsSQL, -1, &statement, nil) == SQLITE_OK {
            if sqlite3_step(statement) == SQLITE_ROW {
                stats.totalSwipeActions = Int(sqlite3_column_int(statement, 0))
            }
        }
        sqlite3_finalize(statement)

        return stats
    }
}

// MARK: - Statistics Model
struct LocalStorageStats {
    var totalIdeas: Int = 0
    var unsyncedIdeas: Int = 0
    var totalSwipeActions: Int = 0
}

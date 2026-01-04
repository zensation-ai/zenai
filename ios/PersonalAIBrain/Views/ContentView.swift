import SwiftUI

struct ContentView: View {
    @EnvironmentObject var apiService: APIService
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            // Ideas List
            IdeasListView()
                .tabItem {
                    Label("Ideen", systemImage: "lightbulb.fill")
                }
                .tag(0)

            // Record
            RecordView()
                .tabItem {
                    Label("Aufnehmen", systemImage: "mic.fill")
                }
                .tag(1)

            // Search
            SearchView()
                .tabItem {
                    Label("Suchen", systemImage: "magnifyingglass")
                }
                .tag(2)

            // Settings
            SettingsView()
                .tabItem {
                    Label("Einstellungen", systemImage: "gear")
                }
                .tag(3)
        }
        .tint(.blue)
    }
}

#Preview {
    ContentView()
        .environmentObject(APIService())
}

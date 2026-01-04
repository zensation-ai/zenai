import SwiftUI

struct ContentView: View {
    @EnvironmentObject var apiService: APIService
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            // Swipe Review
            SwipeCardsView()
                .tabItem {
                    Label("Review", systemImage: "rectangle.stack.fill")
                }
                .tag(0)

            // Ideas List
            IdeasListView()
                .tabItem {
                    Label("Ideen", systemImage: "lightbulb.fill")
                }
                .tag(1)

            // Record
            RecordView()
                .tabItem {
                    Label("Aufnehmen", systemImage: "mic.fill")
                }
                .tag(2)

            // Search
            SearchView()
                .tabItem {
                    Label("Suchen", systemImage: "magnifyingglass")
                }
                .tag(3)

            // Settings
            SettingsView()
                .tabItem {
                    Label("Einstellungen", systemImage: "gear")
                }
                .tag(4)
        }
        .tint(.blue)
    }
}

#Preview {
    ContentView()
        .environmentObject(APIService())
}

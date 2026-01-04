import SwiftUI

@main
struct PersonalAIBrainApp: App {
    @StateObject private var apiService = APIService()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(apiService)
        }
    }
}

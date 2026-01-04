import SwiftUI

@main
struct PersonalAIBrainApp: App {
    @StateObject private var apiService = APIService()
    @StateObject private var localStorageService = LocalStorageService.shared
    @StateObject private var offlineQueueService = OfflineQueueService.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(apiService)
                .environmentObject(localStorageService)
                .environmentObject(offlineQueueService)
                .task {
                    // Initial sync on app launch
                    await localStorageService.syncWithServer()
                }
        }
    }
}

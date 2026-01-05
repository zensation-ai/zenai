import SwiftUI
import PhotosUI

struct MediaPickerView: View {
    let mediaType: MediaType
    let onMediaSelected: (Data, String) -> Void

    @Environment(\.dismiss) var dismiss
    @State private var selectedItem: PhotosPickerItem?
    @State private var isLoading = false

    var body: some View {
        NavigationStack {
            VStack {
                if isLoading {
                    ProgressView("Wird geladen...")
                        .padding()
                } else {
                    PhotosPicker(
                        selection: $selectedItem,
                        matching: mediaType == .photo ? .images : .videos
                    ) {
                        VStack(spacing: 16) {
                            Image(systemName: mediaType == .photo ? "photo.on.rectangle" : "video")
                                .font(.system(size: 60))
                                .foregroundColor(.orange)

                            Text(mediaType == .photo ? "Foto auswählen" : "Video auswählen")
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                }
            }
            .navigationTitle(mediaType == .photo ? "Foto auswählen" : "Video auswählen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") {
                        dismiss()
                    }
                }
            }
            .onChange(of: selectedItem) { _, newValue in
                Task {
                    if let item = newValue {
                        isLoading = true
                        await loadMedia(from: item)
                        isLoading = false
                        dismiss()
                    }
                }
            }
        }
    }

    private func loadMedia(from item: PhotosPickerItem) async {
        do {
            if mediaType == .photo {
                // Load image
                if let data = try await item.loadTransferable(type: Data.self) {
                    let filename = "photo_\(Date().timeIntervalSince1970).jpg"
                    onMediaSelected(data, filename)
                }
            } else {
                // Load video
                if let movie = try await item.loadTransferable(type: MovieTransferable.self) {
                    let filename = "video_\(Date().timeIntervalSince1970).mov"
                    onMediaSelected(movie.data, filename)
                }
            }
        } catch {
            print("❌ Error loading media: \(error)")
        }
    }
}

// Helper for video transfer
struct MovieTransferable: Transferable {
    let url: URL
    let data: Data

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { movie in
            SentTransferredFile(movie.url)
        } importing: { received in
            let copy = URL.documentsDirectory.appending(path: "movie_\(Date().timeIntervalSince1970).mov")
            try FileManager.default.copyItem(at: received.file, to: copy)
            let data = try Data(contentsOf: copy)
            try? FileManager.default.removeItem(at: copy)
            return MovieTransferable(url: received.file, data: data)
        }
    }
}

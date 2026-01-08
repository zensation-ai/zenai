//
//  AIContext.swift
//  PersonalAIBrain
//
//  Dual-Context System: Private vs. Work modes with different AI personas
//

import Foundation
import SwiftUI

enum AIContext: String, Codable, CaseIterable {
    case personal = "personal"
    case work = "work"

    var displayName: String {
        switch self {
        case .personal: return "Privat"
        case .work: return "Arbeit"
        }
    }

    var icon: String {
        switch self {
        case .personal: return "🏠"
        case .work: return "💼"
        }
    }

    var systemImage: String {
        switch self {
        case .personal: return "house.fill"
        case .work: return "briefcase.fill"
        }
    }

    var color: Color {
        switch self {
        case .personal: return .blue
        case .work: return .orange
        }
    }

    var personaDescription: String {
        switch self {
        case .personal:
            return "Dein freundlicher Begleiter für persönliche Gedanken"
        case .work:
            return "Dein professioneller Koordinator für Business-Ideen"
        }
    }

    var placeholderText: String {
        switch self {
        case .personal:
            return "Mir kam gerade der Gedanke..."
        case .work:
            return "Neue Idee für das Business..."
        }
    }
}

/// Manages the current AI context and provides intelligent context switching suggestions
class ContextManager: ObservableObject {
    static let shared = ContextManager()

    @Published var currentContext: AIContext {
        didSet {
            // Save to UserDefaults
            UserDefaults.standard.set(currentContext.rawValue, forKey: "selectedContext")

            // Log context switch analytics
            logContextSwitch(from: oldValue, to: currentContext)
        }
    }

    init() {
        // Restore from UserDefaults or default to personal
        if let savedContext = UserDefaults.standard.string(forKey: "selectedContext"),
           let context = AIContext(rawValue: savedContext) {
            self.currentContext = context
        } else {
            self.currentContext = .personal
        }
    }

    /// Suggests when to switch context based on time and day
    func suggestContextSwitch() -> AIContext? {
        let calendar = Calendar.current
        let now = Date()
        let hour = calendar.component(.hour, from: now)
        let weekday = calendar.component(.weekday, from: now)

        // Monday-Friday
        let isWeekday = weekday >= 2 && weekday <= 6

        // Work hours: 8:00 - 18:00
        let isWorkHours = hour >= 8 && hour < 18

        // Suggest work mode during work hours on weekdays
        if isWeekday && isWorkHours && currentContext == .personal {
            return .work
        }

        // Suggest personal mode outside work hours
        if (!isWeekday || !isWorkHours) && currentContext == .work {
            return .personal
        }

        return nil
    }

    /// Check for context switch suggestion on app launch
    func checkForSuggestionOnLaunch() -> Bool {
        return suggestContextSwitch() != nil
    }

    /// Log context switch for analytics
    private func logContextSwitch(from: AIContext, to: AIContext) {
        print("Context switched: \(from.rawValue) → \(to.rawValue)")

        // TODO: Send to backend analytics endpoint
        // POST /api/context/switch { from, to, trigger: "manual" }
    }

    /// Switch to suggested context
    func applySuggestedContext() {
        if let suggested = suggestContextSwitch() {
            currentContext = suggested
        }
    }
}

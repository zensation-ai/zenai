//
//  AIContext.swift
//  PersonalAIBrain
//
//  Dual-Context System: Private vs. Work modes with different AI personas
//  Phase 16: Sub-Personas per context
//

import Foundation
import SwiftUI

// MARK: - Sub-Personas

/// Personal context personas
enum PersonalPersona: String, Codable, CaseIterable, Identifiable {
    case companion = "companion"
    case coach = "coach"
    case creative = "creative"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .companion: return "Begleiter"
        case .coach: return "Coach"
        case .creative: return "Kreativ"
        }
    }

    var icon: String {
        switch self {
        case .companion: return "🤝"
        case .coach: return "🎯"
        case .creative: return "🎨"
        }
    }

    var description: String {
        switch self {
        case .companion: return "Freundlicher Zuhörer, stellt explorative Fragen"
        case .coach: return "Motivierend, zielorientiert, hält dich accountable"
        case .creative: return "Wild assoziativ, \"Was wäre wenn...\", Querdenker"
        }
    }

    static var defaultPersona: PersonalPersona { .companion }
}

/// Work context personas
enum WorkPersona: String, Codable, CaseIterable, Identifiable {
    case coordinator = "coordinator"
    case analyst = "analyst"
    case strategist = "strategist"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .coordinator: return "Koordinator"
        case .analyst: return "Analyst"
        case .strategist: return "Stratege"
        }
    }

    var icon: String {
        switch self {
        case .coordinator: return "📋"
        case .analyst: return "📊"
        case .strategist: return "🧭"
        }
    }

    var description: String {
        switch self {
        case .coordinator: return "Strukturiert und organisiert, klare Next Steps"
        case .analyst: return "Datengetrieben, hinterfragt Annahmen, identifiziert Risiken"
        case .strategist: return "Langfristiges Denken, Big Picture, Marktanalyse"
        }
    }

    static var defaultPersona: WorkPersona { .coordinator }
}

// MARK: - AI Context

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

    var placeholderText: String {
        switch self {
        case .personal:
            return "Mir kam gerade der Gedanke..."
        case .work:
            return "Neue Idee für das Business..."
        }
    }

    var personaDescription: String {
        switch self {
        case .personal:
            return PersonalPersona.defaultPersona.description
        case .work:
            return WorkPersona.defaultPersona.description
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

    // Persona selection per context
    @Published var personalPersona: PersonalPersona {
        didSet {
            UserDefaults.standard.set(personalPersona.rawValue, forKey: "personalPersona")
        }
    }

    @Published var workPersona: WorkPersona {
        didSet {
            UserDefaults.standard.set(workPersona.rawValue, forKey: "workPersona")
        }
    }

    /// Get the current persona ID for API requests
    var currentPersonaId: String {
        switch currentContext {
        case .personal: return personalPersona.rawValue
        case .work: return workPersona.rawValue
        }
    }

    /// Get the display info for the current persona
    var currentPersonaDisplay: (icon: String, name: String, description: String) {
        switch currentContext {
        case .personal:
            return (personalPersona.icon, personalPersona.displayName, personalPersona.description)
        case .work:
            return (workPersona.icon, workPersona.displayName, workPersona.description)
        }
    }

    init() {
        // Restore context from UserDefaults or default to personal
        if let savedContext = UserDefaults.standard.string(forKey: "selectedContext"),
           let context = AIContext(rawValue: savedContext) {
            self.currentContext = context
        } else {
            self.currentContext = .personal
        }

        // Restore personal persona
        if let savedPersona = UserDefaults.standard.string(forKey: "personalPersona"),
           let persona = PersonalPersona(rawValue: savedPersona) {
            self.personalPersona = persona
        } else {
            self.personalPersona = .companion
        }

        // Restore work persona
        if let savedWorkPersona = UserDefaults.standard.string(forKey: "workPersona"),
           let workPersona = WorkPersona(rawValue: savedWorkPersona) {
            self.workPersona = workPersona
        } else {
            self.workPersona = .coordinator
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

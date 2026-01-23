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

/// Manages the current AI context
/// SIMPLIFIED: Always uses 'personal' - context switching disabled
class ContextManager: ObservableObject {
    static let shared = ContextManager()

    // Always personal - context switching disabled
    @Published var currentContext: AIContext = .personal

    // Persona selection (kept for future use)
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
        return personalPersona.rawValue
    }

    /// Get the display info for the current persona
    var currentPersonaDisplay: (icon: String, name: String, description: String) {
        return (personalPersona.icon, personalPersona.displayName, personalPersona.description)
    }

    init() {
        // Restore personal persona
        if let savedPersona = UserDefaults.standard.string(forKey: "personalPersona"),
           let persona = PersonalPersona(rawValue: savedPersona) {
            self.personalPersona = persona
        } else {
            self.personalPersona = .companion
        }

        // Restore work persona (kept for future use)
        if let savedWorkPersona = UserDefaults.standard.string(forKey: "workPersona"),
           let workPersona = WorkPersona(rawValue: savedWorkPersona) {
            self.workPersona = workPersona
        } else {
            self.workPersona = .coordinator
        }
    }

    /// Context switching disabled - always returns nil
    func suggestContextSwitch() -> AIContext? {
        return nil
    }

    /// Context switching disabled - always returns false
    func checkForSuggestionOnLaunch() -> Bool {
        return false
    }

    /// Context switching disabled - no-op
    func applySuggestedContext() {
        // No-op: context switching disabled
    }
}

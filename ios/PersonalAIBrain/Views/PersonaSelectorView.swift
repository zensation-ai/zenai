//
//  PersonaSelectorView.swift
//  PersonalAIBrain
//
//  Phase 16: Sub-Persona selection within each context
//

import SwiftUI

/// Horizontal scroll view for selecting personas within the current context
struct PersonaSelectorView: View {
    @ObservedObject var contextManager: ContextManager

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Section header
            HStack {
                Text("AI-Assistent")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                Spacer()

                Text(contextManager.currentPersonaDisplay.icon)
                    .font(.system(size: 20))
            }
            .padding(.horizontal)

            // Persona options
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    switch contextManager.currentContext {
                    case .personal:
                        ForEach(PersonalPersona.allCases) { persona in
                            PersonaChip(
                                icon: persona.icon,
                                name: persona.displayName,
                                description: persona.description,
                                isSelected: contextManager.personalPersona == persona,
                                color: contextManager.currentContext.color
                            ) {
                                withAnimation(.spring(response: 0.3)) {
                                    contextManager.personalPersona = persona
                                }
                            }
                        }
                    case .work:
                        ForEach(WorkPersona.allCases) { persona in
                            PersonaChip(
                                icon: persona.icon,
                                name: persona.displayName,
                                description: persona.description,
                                isSelected: contextManager.workPersona == persona,
                                color: contextManager.currentContext.color
                            ) {
                                withAnimation(.spring(response: 0.3)) {
                                    contextManager.workPersona = persona
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal)
            }
        }
    }
}

/// Individual persona selection chip
struct PersonaChip: View {
    let icon: String
    let name: String
    let description: String
    let isSelected: Bool
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Text(icon)
                        .font(.system(size: 24))

                    Text(name)
                        .font(.system(size: 14, weight: isSelected ? .semibold : .medium))
                        .foregroundColor(isSelected ? .primary : .secondary)
                }

                Text(description)
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(width: 140, alignment: .leading)
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? color.opacity(0.15) : Color(.systemGray6))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(
                        isSelected ? color : Color.clear,
                        lineWidth: 2
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

/// Compact persona indicator for navigation bar
struct PersonaIndicator: View {
    @ObservedObject var contextManager: ContextManager

    var body: some View {
        let display = contextManager.currentPersonaDisplay

        HStack(spacing: 4) {
            Text(display.icon)
                .font(.system(size: 14))

            Text(display.name)
                .font(.system(size: 12, weight: .medium))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(contextManager.currentContext.color.opacity(0.1))
        )
    }
}

/// Menu-style persona selector for toolbar
struct PersonaMenu: View {
    @ObservedObject var contextManager: ContextManager

    var body: some View {
        Menu {
            switch contextManager.currentContext {
            case .personal:
                ForEach(PersonalPersona.allCases) { persona in
                    Button {
                        contextManager.personalPersona = persona
                    } label: {
                        Label {
                            VStack(alignment: .leading) {
                                Text(persona.displayName)
                                Text(persona.description)
                                    .font(.caption)
                            }
                        } icon: {
                            Text(persona.icon)
                        }
                    }
                }
            case .work:
                ForEach(WorkPersona.allCases) { persona in
                    Button {
                        contextManager.workPersona = persona
                    } label: {
                        Label {
                            VStack(alignment: .leading) {
                                Text(persona.displayName)
                                Text(persona.description)
                                    .font(.caption)
                            }
                        } icon: {
                            Text(persona.icon)
                        }
                    }
                }
            }
        } label: {
            PersonaIndicator(contextManager: contextManager)
        }
    }
}

// MARK: - Preview
#Preview("Persona Selector") {
    VStack(spacing: 24) {
        PersonaSelectorView(contextManager: ContextManager())

        Divider()

        PersonaIndicator(contextManager: ContextManager())

        Divider()

        PersonaMenu(contextManager: ContextManager())
    }
    .padding()
}

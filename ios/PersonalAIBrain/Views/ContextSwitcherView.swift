//
//  ContextSwitcherView.swift
//  PersonalAIBrain
//
//  Beautiful context switcher UI with persona descriptions
//

import SwiftUI

struct ContextSwitcherView: View {
    @ObservedObject var contextManager: ContextManager

    var body: some View {
        HStack(spacing: 12) {
            ForEach(AIContext.allCases, id: \.self) { context in
                ContextButton(
                    context: context,
                    isSelected: contextManager.currentContext == context,
                    action: {
                        withAnimation(.spring(response: 0.3)) {
                            contextManager.currentContext = context
                        }
                    }
                )
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }
}

struct ContextButton: View {
    let context: AIContext
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                // Icon
                Text(context.icon)
                    .font(.system(size: 32))

                // Label
                Text(context.displayName)
                    .font(.system(size: 14, weight: isSelected ? .semibold : .regular))
                    .foregroundColor(isSelected ? .primary : .secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .padding(.horizontal, 8)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(isSelected ? context.color.opacity(0.15) : Color(.systemGray6))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(
                        isSelected ? context.color : Color.clear,
                        lineWidth: 2
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

/// Compact context indicator for navigation bar
struct ContextIndicator: View {
    let context: AIContext

    var body: some View {
        HStack(spacing: 6) {
            Text(context.icon)
                .font(.system(size: 16))

            Text(context.displayName)
                .font(.system(size: 14, weight: .medium))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(context.color.opacity(0.15))
        )
        .overlay(
            Capsule()
                .strokeBorder(context.color, lineWidth: 1)
        )
    }
}

/// Context suggestion alert
struct ContextSuggestionBanner: View {
    let suggestedContext: AIContext
    let onAccept: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "lightbulb.fill")
                    .foregroundColor(.yellow)

                Text("Kontext-Vorschlag")
                    .font(.headline)

                Spacer()

                Button(action: onDismiss) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.secondary)
                }
            }

            Text("Möchtest du zu **\(suggestedContext.icon) \(suggestedContext.displayName)** wechseln?")
                .font(.subheadline)

            HStack(spacing: 12) {
                Button("Später") {
                    onDismiss()
                }
                .buttonStyle(.bordered)

                Button("Wechseln") {
                    onAccept()
                }
                .buttonStyle(.borderedProminent)
                .tint(suggestedContext.color)
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemBackground))
                .shadow(color: .black.opacity(0.1), radius: 8, y: 2)
        )
        .padding()
    }
}

// MARK: - Preview
#Preview("Context Switcher") {
    VStack {
        ContextSwitcherView(contextManager: ContextManager())

        Spacer()

        ContextIndicator(context: .personal)

        Spacer()

        ContextSuggestionBanner(
            suggestedContext: .work,
            onAccept: {},
            onDismiss: {}
        )
    }
}

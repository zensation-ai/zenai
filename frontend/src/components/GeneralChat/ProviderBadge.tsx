interface ProviderBadgeProps {
  provider?: string;
  model?: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  mistral: 'Mistral',
  google: 'Gemini',
  deepseek: 'DeepSeek',
  ollama: 'Ollama',
  openai: 'OpenAI',
};

export function ProviderBadge({ provider, model }: ProviderBadgeProps) {
  if (!provider || provider === 'anthropic') return null;

  const label = PROVIDER_LABELS[provider] || provider;

  return (
    <span
      className="inline-flex items-center py-0.5 px-2 text-[11px] font-medium rounded-sm bg-surface text-text-secondary ml-2 align-middle"
      title={model || provider}
    >
      {label}
    </span>
  );
}

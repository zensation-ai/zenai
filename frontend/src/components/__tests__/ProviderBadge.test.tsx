import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProviderBadge } from '../GeneralChat/ProviderBadge';

describe('ProviderBadge', () => {
  it('renders nothing for anthropic provider', () => {
    const { container } = render(<ProviderBadge provider="anthropic" model="claude-sonnet-4-20250514" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders badge for mistral provider', () => {
    render(<ProviderBadge provider="mistral" model="mistral-small-latest" />);
    expect(screen.getByText('Mistral')).toBeInTheDocument();
  });

  it('renders badge for ollama provider', () => {
    render(<ProviderBadge provider="ollama" model="llama3" />);
    expect(screen.getByText('Ollama')).toBeInTheDocument();
  });

  it('renders nothing when provider is undefined', () => {
    const { container } = render(<ProviderBadge provider={undefined} model={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows model as title tooltip', () => {
    render(<ProviderBadge provider="deepseek" model="deepseek-v3" />);
    const badge = screen.getByText('DeepSeek');
    expect(badge).toHaveAttribute('title', 'deepseek-v3');
  });
});

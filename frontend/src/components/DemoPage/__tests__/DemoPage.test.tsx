import { vi, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DemoPage from '../DemoPage';

test('renders demo page with CTA button', () => {
  render(<DemoPage onDemoStart={vi.fn()} onNavigateToAuth={vi.fn()} />);
  expect(screen.getByText('Demo starten')).toBeInTheDocument();
  expect(screen.getByText('Account erstellen')).toBeInTheDocument();
});

test('renders feature highlight cards', () => {
  render(<DemoPage onDemoStart={vi.fn()} onNavigateToAuth={vi.fn()} />);
  expect(screen.getByText('4-Layer Memory')).toBeInTheDocument();
  expect(screen.getByText('55 AI Tools')).toBeInTheDocument();
});

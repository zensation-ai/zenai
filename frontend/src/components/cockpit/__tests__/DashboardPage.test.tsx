import { render, screen } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from '../DashboardPage';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('DashboardPage', () => {
  const renderDashboard = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DashboardPage context="personal" />
        </MemoryRouter>
      </QueryClientProvider>
    );

  it('renders 4 widget sections', () => {
    renderDashboard();
    expect(screen.getByText('Heute')).toBeInTheDocument();
    expect(screen.getByText('AI Insights')).toBeInTheDocument();
    expect(screen.getByText('Letzte Aktivitaet')).toBeInTheDocument();
    expect(screen.getByText('Memory Health')).toBeInTheDocument();
  });

  it('has dashboard grid layout', () => {
    const { container } = renderDashboard();
    expect(container.querySelector('.dashboard-grid')).toBeInTheDocument();
  });
});

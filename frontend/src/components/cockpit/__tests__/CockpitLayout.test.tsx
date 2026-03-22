import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CockpitLayout } from '../CockpitLayout';
import { PanelProvider } from '../../../contexts/PanelContext';

vi.mock('../Rail', () => ({
  Rail: (props: any) => <div data-testid="rail" />,
}));
vi.mock('../PanelArea', () => ({
  PanelArea: () => <div data-testid="panel-area" />,
}));

describe('CockpitLayout', () => {
  const renderLayout = () =>
    render(
      <MemoryRouter>
        <PanelProvider>
          <CockpitLayout
            currentPage="chat"
            context="personal"
            onContextChange={vi.fn()}
          >
            <div data-testid="chat-content">Chat here</div>
          </CockpitLayout>
        </PanelProvider>
      </MemoryRouter>
    );

  it('renders Rail, chat content, and PanelArea', () => {
    renderLayout();
    expect(screen.getByTestId('rail')).toBeInTheDocument();
    expect(screen.getByTestId('chat-content')).toBeInTheDocument();
    expect(screen.getByTestId('panel-area')).toBeInTheDocument();
  });

  it('has correct layout structure', () => {
    const { container } = renderLayout();
    const layout = container.querySelector('.cockpit-layout');
    expect(layout).toBeInTheDocument();
  });
});

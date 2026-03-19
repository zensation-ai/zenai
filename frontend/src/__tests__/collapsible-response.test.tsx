import { render, screen, fireEvent } from '@testing-library/react';
import { CollapsibleResponse } from '../components/GeneralChat/CollapsibleResponse';

describe('CollapsibleResponse', () => {
  const shortContent = 'Short response';
  const longContent = 'A'.repeat(600);

  test('renders short content without collapse', () => {
    const { container } = render(
      <CollapsibleResponse content={shortContent}>
        <p>{shortContent}</p>
      </CollapsibleResponse>
    );
    expect(container.querySelector('.collapsible-response__toggle')).toBeNull();
  });

  test('renders long content with collapse toggle', () => {
    render(
      <CollapsibleResponse content={longContent}>
        <p>{longContent}</p>
      </CollapsibleResponse>
    );
    expect(screen.getByText('Vollstaendig anzeigen')).toBeDefined();
  });

  test('toggle expands and collapses', () => {
    render(
      <CollapsibleResponse content={longContent}>
        <p>{longContent}</p>
      </CollapsibleResponse>
    );
    const toggle = screen.getByText('Vollstaendig anzeigen');
    fireEvent.click(toggle);
    expect(screen.getByText('Weniger anzeigen')).toBeDefined();
  });

  test('metadata is always visible', () => {
    render(
      <CollapsibleResponse content={longContent} metadata={<span data-testid="meta">Badge</span>}>
        <p>{longContent}</p>
      </CollapsibleResponse>
    );
    expect(screen.getByTestId('meta')).toBeDefined();
  });

  test('aria-expanded reflects state', () => {
    render(
      <CollapsibleResponse content={longContent}>
        <p>{longContent}</p>
      </CollapsibleResponse>
    );
    const toggle = screen.getByRole('button');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });
});

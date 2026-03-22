import { render, screen, fireEvent } from '@testing-library/react';
import { QuickActionsBar } from '../QuickActionsBar';

describe('QuickActionsBar', () => {
  const defaultProps = {
    onAttachFile: vi.fn(),
    onUploadImage: vi.fn(),
    onVoiceInput: vi.fn(),
    onQuickCreate: vi.fn(),
  };

  beforeEach(() => vi.clearAllMocks());

  it('renders 4 action buttons', () => {
    render(<QuickActionsBar {...defaultProps} />);
    expect(screen.getByLabelText('Datei anhaengen')).toBeInTheDocument();
    expect(screen.getByLabelText('Bild hochladen')).toBeInTheDocument();
    expect(screen.getByLabelText('Spracheingabe')).toBeInTheDocument();
    expect(screen.getByLabelText('Schnell erstellen')).toBeInTheDocument();
  });

  it('calls onAttachFile when attach button clicked', () => {
    render(<QuickActionsBar {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Datei anhaengen'));
    expect(defaultProps.onAttachFile).toHaveBeenCalled();
  });

  it('calls onVoiceInput when voice button clicked', () => {
    render(<QuickActionsBar {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Spracheingabe'));
    expect(defaultProps.onVoiceInput).toHaveBeenCalled();
  });
});

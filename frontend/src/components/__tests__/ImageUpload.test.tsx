/**
 * Unit Tests for ImageUpload Component
 *
 * Tests drag-and-drop functionality, file validation, preview handling,
 * and accessibility features.
 *
 * @module tests/components/ImageUpload
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageUpload } from '../ImageUpload';

// Helper to create mock files
const createMockFile = (
  name: string,
  type: string,
  size: number = 1024
): File => {
  const content = new Uint8Array(size);
  return new File([content], name, { type });
};

// Helper to create valid image file
const createImageFile = (name: string = 'test.png'): File => {
  return createMockFile(name, 'image/png', 1024);
};

// Helper to upload files using fireEvent (more robust for hidden inputs)
const uploadFiles = (input: HTMLInputElement, files: File | File[]) => {
  const fileList = Array.isArray(files) ? files : [files];
  Object.defineProperty(input, 'files', {
    value: fileList,
    configurable: true,
  });
  fireEvent.change(input);
};

describe('ImageUpload Component', () => {
  const mockOnImagesChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================
  // Rendering Tests
  // ===========================================

  describe('Rendering', () => {
    it('should render dropzone in full mode', () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} />);

      expect(screen.getByText(/Bilder hier ablegen/i)).toBeInTheDocument();
      expect(screen.getByText(/JPEG, PNG, GIF, WebP/i)).toBeInTheDocument();
    });

    it('should render button in compact mode', () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} compact />);

      expect(screen.getByRole('button', { name: /Bild hinzufügen/i })).toBeInTheDocument();
      expect(screen.queryByText(/Bilder hier ablegen/i)).not.toBeInTheDocument();
    });

    it('should show max file size', () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} maxSizeMB={5} />);

      expect(screen.getByText(/max 5MB/i)).toBeInTheDocument();
    });

    it('should be disabled when disabled prop is true', () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} disabled />);

      const dropzone = screen.getByRole('button', { name: /Bilder hochladen/i });
      expect(dropzone).toHaveClass('disabled');
    });
  });

  // ===========================================
  // File Selection Tests
  // ===========================================

  describe('File Selection', () => {
    it('should call onImagesChange when file is selected', async () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createImageFile();

      uploadFiles(input, file);

      await waitFor(() => {
        expect(mockOnImagesChange).toHaveBeenCalledWith([expect.any(File)]);
      });
    });

    it('should accept multiple files when maxImages > 1', async () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} maxImages={3} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const files = [
        createImageFile('image1.png'),
        createImageFile('image2.png'),
      ];

      uploadFiles(input, files);

      await waitFor(() => {
        expect(mockOnImagesChange).toHaveBeenCalledWith(
          expect.arrayContaining([expect.any(File), expect.any(File)])
        );
      });
    });

    it('should limit number of files to maxImages', async () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} maxImages={2} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const files = [
        createImageFile('img1.png'),
        createImageFile('img2.png'),
        createImageFile('img3.png'),
      ];

      uploadFiles(input, files);

      await waitFor(() => {
        expect(screen.getByText(/Maximal 2 Bilder erlaubt/i)).toBeInTheDocument();
      });
    });
  });

  // ===========================================
  // File Validation Tests
  // ===========================================

  describe('File Validation', () => {
    it('should accept JPEG files', async () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('photo.jpg', 'image/jpeg');

      uploadFiles(input, file);

      await waitFor(() => {
        expect(mockOnImagesChange).toHaveBeenCalled();
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('should accept PNG files', async () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('image.png', 'image/png');

      uploadFiles(input, file);

      await waitFor(() => {
        expect(mockOnImagesChange).toHaveBeenCalled();
      });
    });

    it('should accept GIF files', async () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('animation.gif', 'image/gif');

      uploadFiles(input, file);

      await waitFor(() => {
        expect(mockOnImagesChange).toHaveBeenCalled();
      });
    });

    it('should accept WebP files', async () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('modern.webp', 'image/webp');

      uploadFiles(input, file);

      await waitFor(() => {
        expect(mockOnImagesChange).toHaveBeenCalled();
      });
    });

    it('should reject invalid file formats', async () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('document.pdf', 'application/pdf');

      uploadFiles(input, file);

      await waitFor(() => {
        expect(screen.getByText(/Ungültiges Format/i)).toBeInTheDocument();
      });
    });

    it('should reject files exceeding max size', async () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} maxSizeMB={1} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      // Create file larger than 1MB (1.5MB)
      const file = createMockFile('large.png', 'image/png', 1.5 * 1024 * 1024);

      uploadFiles(input, file);

      await waitFor(() => {
        expect(screen.getByText(/Datei zu groß/i)).toBeInTheDocument();
      });
    });
  });

  // ===========================================
  // Drag and Drop Tests
  // ===========================================

  describe('Drag and Drop', () => {
    it('should show dragging state when file is dragged over', () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} />);

      const dropzone = screen.getByRole('button', { name: /Bilder hochladen/i });

      fireEvent.dragEnter(dropzone, {
        dataTransfer: { files: [] },
      });

      expect(dropzone).toHaveClass('dragging');
      expect(screen.getByText(/Hier ablegen/i)).toBeInTheDocument();
    });

    it('should remove dragging state when file leaves', () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} />);

      const dropzone = screen.getByRole('button', { name: /Bilder hochladen/i });

      fireEvent.dragEnter(dropzone, {
        dataTransfer: { files: [] },
      });
      fireEvent.dragLeave(dropzone);

      expect(dropzone).not.toHaveClass('dragging');
    });

    it('should handle file drop', async () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} />);

      const dropzone = screen.getByRole('button', { name: /Bilder hochladen/i });
      const file = createImageFile();

      const dataTransfer = {
        files: [file],
        items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
        types: ['Files'],
      };

      fireEvent.drop(dropzone, { dataTransfer });

      await waitFor(() => {
        expect(mockOnImagesChange).toHaveBeenCalled();
      });
    });

    it('should not accept drop when disabled', async () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} disabled />);

      const dropzone = screen.getByRole('button', { name: /Bilder hochladen/i });
      const file = createImageFile();

      fireEvent.drop(dropzone, {
        dataTransfer: { files: [file] },
      });

      expect(mockOnImagesChange).not.toHaveBeenCalled();
    });
  });

  // ===========================================
  // Preview Tests
  // ===========================================

  describe('Preview', () => {
    it('should show preview count after selecting files', async () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const files = [createImageFile('img1.png'), createImageFile('img2.png')];

      uploadFiles(input, files);

      await waitFor(() => {
        expect(screen.getByText(/2 Bilder ausgewählt/i)).toBeInTheDocument();
      });
    });

    it('should show "Bild" for single file', async () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      uploadFiles(input, createImageFile());

      await waitFor(() => {
        expect(screen.getByText(/1 Bild ausgewählt/i)).toBeInTheDocument();
      });
    });

    it('should show "Alle entfernen" button with previews', async () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      uploadFiles(input, createImageFile());

      await waitFor(() => {
        expect(screen.getByText(/Alle entfernen/i)).toBeInTheDocument();
      });
    });

    it('should clear all images when "Alle entfernen" is clicked', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      render(<ImageUpload onImagesChange={mockOnImagesChange} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      uploadFiles(input, createImageFile());

      await waitFor(() => {
        expect(screen.getByText(/Alle entfernen/i)).toBeInTheDocument();
      });

      const clearButton = screen.getByText(/Alle entfernen/i);
      await user.click(clearButton);

      await waitFor(() => {
        expect(mockOnImagesChange).toHaveBeenLastCalledWith([]);
      });
    });
  });

  // ===========================================
  // Remove Individual Image Tests
  // ===========================================

  describe('Remove Individual Image', () => {
    it('should remove image when remove button is clicked', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      render(<ImageUpload onImagesChange={mockOnImagesChange} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const files = [createImageFile('img1.png'), createImageFile('img2.png')];

      uploadFiles(input, files);

      await waitFor(() => {
        expect(screen.getByText(/2 Bilder/i)).toBeInTheDocument();
      });

      // Find and click first remove button
      const removeButtons = screen.getAllByRole('button', { name: /Bild entfernen/i });
      await user.click(removeButtons[0]);

      await waitFor(() => {
        expect(mockOnImagesChange).toHaveBeenLastCalledWith([expect.any(File)]);
      });
    });
  });

  // ===========================================
  // Compact Mode Tests
  // ===========================================

  describe('Compact Mode', () => {
    it('should render upload button in compact mode', () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} compact />);

      expect(screen.getByRole('button', { name: /Bild hinzufügen/i })).toBeInTheDocument();
    });

    it('should show mini previews in compact mode', async () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} compact />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      uploadFiles(input, createImageFile());

      await waitFor(() => {
        const previewStrip = document.querySelector('.image-upload-preview-strip');
        expect(previewStrip).toBeInTheDocument();
      });
    });

    it('should disable button when at max images in compact mode', async () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} compact maxImages={1} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      uploadFiles(input, createImageFile());

      await waitFor(() => {
        const button = screen.getByRole('button', { name: /Bild hinzufügen/i });
        expect(button).toBeDisabled();
      });
    });
  });

  // ===========================================
  // Accessibility Tests
  // ===========================================

  describe('Accessibility', () => {
    it('should have accessible dropzone button', () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} />);

      const dropzone = screen.getByRole('button', { name: /Bilder hochladen/i });
      expect(dropzone).toHaveAttribute('tabIndex', '0');
    });

    it('should hide file input from assistive technology', () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} />);

      const input = document.querySelector('input[type="file"]');
      expect(input).toHaveAttribute('aria-hidden', 'true');
    });

    it('should show error as alert', async () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const invalidFile = createMockFile('doc.pdf', 'application/pdf');

      uploadFiles(input, invalidFile);

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toBeInTheDocument();
      });
    });

    it('should be keyboard accessible', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      render(<ImageUpload onImagesChange={mockOnImagesChange} />);

      const dropzone = screen.getByRole('button', { name: /Bilder hochladen/i });

      dropzone.focus();
      expect(dropzone).toHaveFocus();

      // Enter key should trigger file picker (we can't test actual picker)
      await user.keyboard('{Enter}');
      // Just verify no crash occurs
    });
  });

  // ===========================================
  // Props Tests
  // ===========================================

  describe('Props', () => {
    it('should use custom maxImages', async () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} maxImages={3} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const files = [
        createImageFile('1.png'),
        createImageFile('2.png'),
        createImageFile('3.png'),
        createImageFile('4.png'),
      ];

      uploadFiles(input, files);

      await waitFor(() => {
        expect(screen.getByText(/Maximal 3 Bilder/i)).toBeInTheDocument();
      });
    });

    it('should use custom maxSizeMB', async () => {
      render(<ImageUpload onImagesChange={mockOnImagesChange} maxSizeMB={2} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const largeFile = createMockFile('large.png', 'image/png', 3 * 1024 * 1024);

      uploadFiles(input, largeFile);

      await waitFor(() => {
        expect(screen.getByText(/Max: 2MB/i)).toBeInTheDocument();
      });
    });
  });
});

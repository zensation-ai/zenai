import { MainWindow } from './main-window';
import { SpotlightWindow } from './spotlight-window';

/**
 * Coordinates all application windows.
 * Acts as the single point of control for showing/hiding/navigating
 * the main window and the spotlight popup.
 */
export class WindowManager {
  private readonly mainWindow: MainWindow;
  private readonly spotlightWindow: SpotlightWindow;

  constructor(frontendUrl: string) {
    this.mainWindow = new MainWindow(frontendUrl);
    this.spotlightWindow = new SpotlightWindow(frontendUrl);
  }

  /**
   * Initializes the spotlight window (creates it so it's ready to toggle).
   * Call this during app ready.
   */
  init(): void {
    this.spotlightWindow.create();
  }

  // ─── Spotlight ──────────────────────────────────────────────────────────────

  toggleSpotlight(): void {
    this.spotlightWindow.toggle();
  }

  showSpotlight(): void {
    this.spotlightWindow.show();
  }

  hideSpotlight(): void {
    this.spotlightWindow.hide();
  }

  resizeSpotlight(height: number): void {
    this.spotlightWindow.resize(height);
  }

  // ─── Main window ────────────────────────────────────────────────────────────

  /**
   * Creates the main window if it doesn't exist yet, then shows it.
   */
  showMainWindow(): void {
    if (!this.mainWindow.getWindow()) {
      this.mainWindow.create();
    }
    this.mainWindow.show();
  }

  hideMainWindow(): void {
    this.mainWindow.hide();
  }

  /**
   * Creates the main window (if needed), shows it, focuses it,
   * then sends the renderer to the given page.
   */
  showAndNavigate(page: string): void {
    if (!this.mainWindow.getWindow()) {
      this.mainWindow.create();
    }
    this.mainWindow.show();
    this.mainWindow.focus();
    this.mainWindow.navigateTo(page);
  }

  /**
   * If the main window already exists, focuses it.
   * Otherwise, creates and shows it.
   */
  focusOrCreate(): void {
    if (!this.mainWindow.getWindow()) {
      this.mainWindow.create();
    }
    this.mainWindow.show();
    this.mainWindow.focus();
  }

  getMainWindow(): MainWindow {
    return this.mainWindow;
  }
}

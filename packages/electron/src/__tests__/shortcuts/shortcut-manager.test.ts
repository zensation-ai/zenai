import { globalShortcut } from 'electron';
import { ShortcutManager } from '../../shortcuts/shortcut-manager';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SPOTLIGHT_SHORTCUT = 'CommandOrControl+Space';
const SEARCH_SHORTCUT = 'CommandOrControl+Shift+F';

function makeManager(overrides?: {
  spotlight?: string;
  search?: string;
  onToggleSpotlight?: () => void;
  onShowSearch?: () => void;
}) {
  const onToggleSpotlight = overrides?.onToggleSpotlight ?? jest.fn();
  const onShowSearch = overrides?.onShowSearch ?? jest.fn();
  const manager = new ShortcutManager(
    {
      spotlight: overrides?.spotlight ?? SPOTLIGHT_SHORTCUT,
      search: overrides?.search ?? SEARCH_SHORTCUT,
    },
    { onToggleSpotlight, onShowSearch },
  );
  return { manager, onToggleSpotlight, onShowSearch };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ShortcutManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Registers spotlight shortcut with globalShortcut.register
  it('registers spotlight shortcut with globalShortcut.register', () => {
    const { manager } = makeManager();
    manager.register();
    expect(globalShortcut.register).toHaveBeenCalledWith(SPOTLIGHT_SHORTCUT, expect.any(Function));
  });

  // 2. Registers search shortcut with globalShortcut.register
  it('registers search shortcut with globalShortcut.register', () => {
    const { manager } = makeManager();
    manager.register();
    expect(globalShortcut.register).toHaveBeenCalledWith(SEARCH_SHORTCUT, expect.any(Function));
  });

  // 3. Calls onToggleSpotlight callback when spotlight shortcut fires
  it('calls onToggleSpotlight callback when spotlight shortcut fires', () => {
    const { manager, onToggleSpotlight } = makeManager();
    manager.register();

    // Capture the callback registered for spotlight
    const registerMock = globalShortcut.register as jest.Mock;
    const spotlightCall = registerMock.mock.calls.find(
      ([accelerator]) => accelerator === SPOTLIGHT_SHORTCUT,
    );
    expect(spotlightCall).toBeDefined();
    const callback = spotlightCall![1] as () => void;
    callback();

    expect(onToggleSpotlight).toHaveBeenCalledTimes(1);
  });

  // 4. Calls onShowSearch callback when search shortcut fires
  it('calls onShowSearch callback when search shortcut fires', () => {
    const { manager, onShowSearch } = makeManager();
    manager.register();

    const registerMock = globalShortcut.register as jest.Mock;
    const searchCall = registerMock.mock.calls.find(
      ([accelerator]) => accelerator === SEARCH_SHORTCUT,
    );
    expect(searchCall).toBeDefined();
    const callback = searchCall![1] as () => void;
    callback();

    expect(onShowSearch).toHaveBeenCalledTimes(1);
  });

  // 5. unregister() calls globalShortcut.unregisterAll
  it('unregister() calls globalShortcut.unregisterAll', () => {
    const { manager } = makeManager();
    manager.register();
    manager.unregister();
    expect(globalShortcut.unregisterAll).toHaveBeenCalledTimes(1);
  });
});

import { Tray } from 'electron';
import { bindTray, setTrayStatus, getTrayStatus, destroyTrayManager } from '../../tray/tray-manager';
import { getTrayIcon } from '../../tray/tray-icons';

// Mock tray-icons module
jest.mock('../../tray/tray-icons', () => ({
  getTrayIcon: jest.fn().mockReturnValue({ mock: true }),
  clearIconCache: jest.fn(),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('tray-manager', () => {
  let tray: Tray;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    destroyTrayManager();
    tray = new Tray('dummy-icon-path');
    bindTray(tray);
  });

  afterEach(() => {
    destroyTrayManager();
    jest.useRealTimers();
  });

  describe('bindTray', () => {
    it('sets the tray to idle icon on bind', () => {
      expect(tray.setImage).toHaveBeenCalled();
      expect(getTrayIcon).toHaveBeenCalledWith('idle');
    });
  });

  describe('getTrayStatus', () => {
    it('returns idle by default', () => {
      expect(getTrayStatus()).toBe('idle');
    });

    it('returns the current status after setTrayStatus', () => {
      setTrayStatus('notification');
      expect(getTrayStatus()).toBe('notification');
    });
  });

  describe('setTrayStatus', () => {
    it('switches to notification icon', () => {
      setTrayStatus('notification');
      expect(getTrayIcon).toHaveBeenCalledWith('notification');
      expect(tray.setImage).toHaveBeenCalled();
    });

    it('does nothing when setting the same status', () => {
      // Already idle from bindTray
      const callsBefore = (tray.setImage as jest.Mock).mock.calls.length;
      setTrayStatus('idle');
      expect((tray.setImage as jest.Mock).mock.calls.length).toBe(callsBefore);
    });

    it('starts pulse interval for thinking status', () => {
      setTrayStatus('thinking');
      expect(getTrayIcon).toHaveBeenCalledWith('thinking');

      // Advance timer to trigger pulse
      jest.advanceTimersByTime(500);
      expect(getTrayIcon).toHaveBeenCalledWith('idle'); // pulse toggles to idle

      jest.advanceTimersByTime(500);
      expect(getTrayIcon).toHaveBeenCalledWith('thinking'); // pulse toggles back
    });

    it('stops pulse interval when switching from thinking to idle', () => {
      setTrayStatus('thinking');
      jest.advanceTimersByTime(500); // one pulse

      setTrayStatus('idle');
      const callsAfterSwitch = (tray.setImage as jest.Mock).mock.calls.length;

      // Advancing time should not trigger more icon changes
      jest.advanceTimersByTime(2000);
      expect((tray.setImage as jest.Mock).mock.calls.length).toBe(callsAfterSwitch);
    });
  });

  describe('destroyTrayManager', () => {
    it('resets status to idle', () => {
      setTrayStatus('notification');
      destroyTrayManager();
      expect(getTrayStatus()).toBe('idle');
    });

    it('stops thinking pulse interval', () => {
      setTrayStatus('thinking');
      destroyTrayManager();

      const callsAfterDestroy = (tray.setImage as jest.Mock).mock.calls.length;
      jest.advanceTimersByTime(2000);
      expect((tray.setImage as jest.Mock).mock.calls.length).toBe(callsAfterDestroy);
    });
  });
});

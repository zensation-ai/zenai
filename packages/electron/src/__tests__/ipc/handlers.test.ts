import { ipcMain } from 'electron';
import { registerIpcHandlers } from '../../ipc/handlers';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDeps() {
  return {
    getMainWindow: jest.fn().mockReturnValue(null),
    getConfig: jest.fn().mockReturnValue(undefined),
    setConfig: jest.fn(),
    getBackendStatus: jest.fn().mockReturnValue('healthy'),
    getBackendUrl: jest.fn().mockReturnValue('http://localhost:3000'),
    hideSpotlight: jest.fn(),
    resizeSpotlight: jest.fn(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Registers 'show-notification' handler (ipcMain.on)
  it("registers 'show-notification' handler via ipcMain.on", () => {
    const deps = makeDeps();
    registerIpcHandlers(deps);

    const channels = (ipcMain.on as jest.Mock).mock.calls.map(([ch]) => ch as string);
    expect(channels).toContain('show-notification');
  });

  // 2. Registers 'dialog:openFile' handler (ipcMain.handle)
  it("registers 'dialog:openFile' handler via ipcMain.handle", () => {
    const deps = makeDeps();
    registerIpcHandlers(deps);

    const channels = (ipcMain.handle as jest.Mock).mock.calls.map(([ch]) => ch as string);
    expect(channels).toContain('dialog:openFile');
  });

  // 3. Registers 'dialog:saveFile' handler (ipcMain.handle)
  it("registers 'dialog:saveFile' handler via ipcMain.handle", () => {
    const deps = makeDeps();
    registerIpcHandlers(deps);

    const channels = (ipcMain.handle as jest.Mock).mock.calls.map(([ch]) => ch as string);
    expect(channels).toContain('dialog:saveFile');
  });

  // 4. Registers window management handlers via ipcMain.on
  it('registers window:minimize, window:maximize, window:close via ipcMain.on', () => {
    const deps = makeDeps();
    registerIpcHandlers(deps);

    const channels = (ipcMain.on as jest.Mock).mock.calls.map(([ch]) => ch as string);
    expect(channels).toContain('window:minimize');
    expect(channels).toContain('window:maximize');
    expect(channels).toContain('window:close');
  });

  // 5. Registers config handlers via ipcMain.handle
  it('registers config:get and config:set via ipcMain.handle', () => {
    const deps = makeDeps();
    registerIpcHandlers(deps);

    const channels = (ipcMain.handle as jest.Mock).mock.calls.map(([ch]) => ch as string);
    expect(channels).toContain('config:get');
    expect(channels).toContain('config:set');
  });

  // 6. Registers backend handlers via ipcMain.handle
  it('registers backend:getStatus and backend:getUrl via ipcMain.handle', () => {
    const deps = makeDeps();
    registerIpcHandlers(deps);

    const channels = (ipcMain.handle as jest.Mock).mock.calls.map(([ch]) => ch as string);
    expect(channels).toContain('backend:getStatus');
    expect(channels).toContain('backend:getUrl');
  });

  // 7. Registers spotlight handlers via ipcMain.on
  it('registers spotlight:close and spotlight:resize via ipcMain.on', () => {
    const deps = makeDeps();
    registerIpcHandlers(deps);

    const channels = (ipcMain.on as jest.Mock).mock.calls.map(([ch]) => ch as string);
    expect(channels).toContain('spotlight:close');
    expect(channels).toContain('spotlight:resize');
  });

  // 8. Registers shell:openExternal handler via ipcMain.handle
  it('registers shell:openExternal handler via ipcMain.handle', () => {
    const deps = makeDeps();
    registerIpcHandlers(deps);

    const channels = (ipcMain.handle as jest.Mock).mock.calls.map(([ch]) => ch as string);
    expect(channels).toContain('shell:openExternal');
  });

  // 9. Registers app:getVersion handler via ipcMain.handle
  it('registers app:getVersion handler via ipcMain.handle', () => {
    const deps = makeDeps();
    registerIpcHandlers(deps);

    const channels = (ipcMain.handle as jest.Mock).mock.calls.map(([ch]) => ch as string);
    expect(channels).toContain('app:getVersion');
  });

  // 10. Verify all expected channels are registered
  it('registers all expected IPC channels', () => {
    const deps = makeDeps();
    registerIpcHandlers(deps);

    const onChannels = (ipcMain.on as jest.Mock).mock.calls.map(([ch]) => ch as string);
    const handleChannels = (ipcMain.handle as jest.Mock).mock.calls.map(([ch]) => ch as string);
    const allChannels = [...onChannels, ...handleChannels];

    const expectedChannels = [
      // ipcMain.on
      'show-notification',
      'window:minimize',
      'window:maximize',
      'window:close',
      'spotlight:close',
      'spotlight:resize',
      // ipcMain.handle
      'dialog:openFile',
      'dialog:saveFile',
      'shell:openExternal',
      'app:getVersion',
      'config:get',
      'config:set',
      'backend:getStatus',
      'backend:getUrl',
    ];

    for (const channel of expectedChannels) {
      expect(allChannels).toContain(channel);
    }
  });
});

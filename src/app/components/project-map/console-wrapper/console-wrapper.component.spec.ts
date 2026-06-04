import { signal } from '@angular/core';
import { describe, it, expect, vi } from 'vitest';
import { ConsoleWrapperComponent } from './console-wrapper.component';
import { DEFAULT_FONT_SIZE, MAX_FONT_SIZE, MIN_FONT_SIZE } from '@services/xterm.service';

describe('ConsoleWrapperComponent', () => {
  describe('prototype methods', () => {
    it('should have ngOnInit method', () => {
      expect(typeof (ConsoleWrapperComponent.prototype as any).ngOnInit).toBe('function');
    });

    it('should have ngAfterViewInit method', () => {
      expect(typeof (ConsoleWrapperComponent.prototype as any).ngAfterViewInit).toBe('function');
    });

    it('should have ngOnDestroy method', () => {
      expect(typeof (ConsoleWrapperComponent.prototype as any).ngOnDestroy).toBe('function');
    });

    it('should have minimize method', () => {
      expect(typeof (ConsoleWrapperComponent.prototype as any).minimize).toBe('function');
    });

    it('should have toggleMinimize method', () => {
      expect(typeof (ConsoleWrapperComponent.prototype as any).toggleMinimize).toBe('function');
    });

    it('should have toggleMaximize method', () => {
      expect(typeof (ConsoleWrapperComponent.prototype as any).toggleMaximize).toBe('function');
    });

    it('should have addTab method', () => {
      expect(typeof (ConsoleWrapperComponent.prototype as any).addTab).toBe('function');
    });

    it('should have removeTab method', () => {
      expect(typeof (ConsoleWrapperComponent.prototype as any).removeTab).toBe('function');
    });

    it('should have validate method', () => {
      expect(typeof (ConsoleWrapperComponent.prototype as any).validate).toBe('function');
    });

    it('should have onResizeEnd method', () => {
      expect(typeof (ConsoleWrapperComponent.prototype as any).onResizeEnd).toBe('function');
    });

    it('should have close method', () => {
      expect(typeof (ConsoleWrapperComponent.prototype as any).close).toBe('function');
    });

    it('should have getActiveTabName method', () => {
      expect(typeof (ConsoleWrapperComponent.prototype as any).getActiveTabName).toBe('function');
    });

    it('should have onDeviceSelected method', () => {
      expect(typeof (ConsoleWrapperComponent.prototype as any).onDeviceSelected).toBe('function');
    });

    it('should have handleTabShortcut method', () => {
      expect(typeof (ConsoleWrapperComponent.prototype as any).handleTabShortcut).toBe('function');
    });

    it('should have onXtermTabShortcut method', () => {
      expect(typeof (ConsoleWrapperComponent.prototype as any).onXtermTabShortcut).toBe('function');
    });

    it('should have onConsoleActivate method', () => {
      expect(typeof (ConsoleWrapperComponent.prototype as any).onConsoleActivate).toBe('function');
    });

    it('should have onDocumentClick method', () => {
      expect(typeof (ConsoleWrapperComponent.prototype as any).onDocumentClick).toBe('function');
    });

    it('should have switchToTab method', () => {
      expect(typeof (ConsoleWrapperComponent.prototype as any).switchToTab).toBe('function');
    });

    it('should have enableScroll method', () => {
      expect(typeof (ConsoleWrapperComponent.prototype as any).enableScroll).toBe('function');
    });

    it('should have disableScroll method', () => {
      expect(typeof (ConsoleWrapperComponent.prototype as any).disableScroll).toBe('function');
    });

    it('should have onWindowResize method', () => {
      expect(typeof (ConsoleWrapperComponent.prototype as any).onWindowResize).toBe('function');
    });
  });

  describe('settings behavior', () => {
    it('toggleSettingsPanel should flip state and mark for check', () => {
      const markForCheck = vi.fn();
      const host = {
        showSettingsPanelSignal: signal(false),
        cdr: { markForCheck },
      } as any;

      (ConsoleWrapperComponent.prototype as any).toggleSettingsPanel.call(host);
      expect(host.showSettingsPanelSignal()).toBe(true);
      expect(markForCheck).toHaveBeenCalledTimes(1);

      (ConsoleWrapperComponent.prototype as any).toggleSettingsPanel.call(host);
      expect(host.showSettingsPanelSignal()).toBe(false);
      expect(markForCheck).toHaveBeenCalledTimes(2);
    });

    it('applySettings should refresh state from service settings', () => {
      const markForCheck = vi.fn();
      const updateSettings = vi.fn();
      const serviceState = {
        fontSize: MAX_FONT_SIZE,
        fontFamily: 'Consolas',
        foregroundColor: '#112233',
        backgroundColor: '#aabbcc',
      };
      const xtermService = { updateSettings } as any;
      Object.defineProperty(xtermService, 'settings', {
        get: () => ({ ...serviceState }),
      });

      const host = {
        xtermService,
        settingsSignal: signal({
          fontSize: DEFAULT_FONT_SIZE,
          fontFamily: null,
          foregroundColor: null,
          backgroundColor: null,
        }),
        cdr: { markForCheck },
      } as any;

      (ConsoleWrapperComponent.prototype as any).applySettings.call(host, { fontSize: 999 });

      expect(updateSettings).toHaveBeenCalledWith({ fontSize: 999 });
      expect(host.settingsSignal()).toEqual(serviceState);
      expect(markForCheck).toHaveBeenCalledTimes(1);
    });

    it('changeFontSize should clamp bounds before applying', () => {
      const applySettings = vi.fn();
      const host = {
        minFontSize: MIN_FONT_SIZE,
        maxFontSize: MAX_FONT_SIZE,
        currentSettings: () => ({ fontSize: MIN_FONT_SIZE }),
        applySettings,
      } as any;

      (ConsoleWrapperComponent.prototype as any).changeFontSize.call(host, -5);
      expect(applySettings).toHaveBeenLastCalledWith({ fontSize: MIN_FONT_SIZE });

      host.currentSettings = () => ({ fontSize: MAX_FONT_SIZE });
      (ConsoleWrapperComponent.prototype as any).changeFontSize.call(host, 5);
      expect(applySettings).toHaveBeenLastCalledWith({ fontSize: MAX_FONT_SIZE });
    });
  });
});

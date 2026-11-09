import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { SYNCED_PREFERENCE_KEYS, UserPreferencesService } from './user-preferences.service';
import { HttpController } from './http-controller.service';
import { Controller } from '@models/controller';

describe('UserPreferencesService', () => {
  let service: UserPreferencesService;
  let mockHttpController: { get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> };
  let controller: Controller;

  beforeEach(() => {
    localStorage.clear();
    mockHttpController = { get: vi.fn(), put: vi.fn(() => of({})) };
    controller = {
      id: 1,
      name: 'Test Controller',
      host: 'localhost',
      port: 3080,
      protocol: 'http:',
      username: '',
      password: '',
      authToken: 'test-token',
      tokenExpired: false,
    } as Controller;

    TestBed.configureTestingModule({
      providers: [{ provide: HttpController, useValue: mockHttpController }],
    });
    service = TestBed.inject(UserPreferencesService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  describe('Sync boundary', () => {
    it('includes the floating widget geometry keys', () => {
      for (const key of ['topPosition', 'leftPosition', 'rightPosition', 'widthOfWidget', 'heightOfWidget']) {
        expect(SYNCED_PREFERENCE_KEYS).toContain(key);
      }
    });

    it('includes the AI chat panel state blob', () => {
      expect(SYNCED_PREFERENCE_KEYS).toContain('ai-chat-panel-state');
    });

    it('keeps the sync baseline key out of the mirrored document', () => {
      // The baseline is local bookkeeping (which values were last pushed);
      // mirroring it would let one browser poison another's edit detection.
      expect(SYNCED_PREFERENCE_KEYS).not.toContain('gns3_prefs_sync_baseline');
    });
  });

  describe('localStorage facade', () => {
    it('writes through to localStorage immediately', () => {
      service.setItem('topPosition', '42');

      expect(localStorage.getItem('topPosition')).toBe('42');
      expect(service.getItem('topPosition')).toBe('42');
    });

    it('propagates removals to localStorage', () => {
      service.setItem('widthOfWidget', '720');
      service.removeItem('widthOfWidget');

      expect(service.getItem('widthOfWidget')).toBeNull();
    });

    it('does not schedule a push before sync is enabled', () => {
      service.setItem('topPosition', '42');
      service.removeItem('leftPosition');

      expect(mockHttpController.put).not.toHaveBeenCalled();
    });
  });

  describe('login merge', () => {
    it('keeps local-only keys and uploads them to an older server document', () => {
      // Geometry saved by a previous session on this browser; the server
      // document (from before these keys existed) has no entry for it.
      localStorage.setItem('topPosition', '120');

      mockHttpController.get.mockReturnValue(
        of({ preferences: { version: 1, webui: { theme: 'dark' } } }),
      );
      service.sync(controller);

      // Not wiped by the merge, and included in the reconciling push.
      expect(localStorage.getItem('topPosition')).toBe('120');
      expect(mockHttpController.put).toHaveBeenCalledTimes(1);
      const body = mockHttpController.put.mock.calls[0][2] as { webui: Record<string, string> };
      expect(body.webui['topPosition']).toBe('120');
      expect(body.webui['theme']).toBe('dark');
    });

    it('applies server geometry to a fresh browser without a redundant push', () => {
      mockHttpController.get.mockReturnValue(
        of({
          preferences: {
            version: 1,
            webui: {
              widthOfWidget: '800',
              'ai-chat-panel-state': JSON.stringify({ isOpen: false, width: 900, height: 900 }),
            },
          },
        }),
      );
      service.sync(controller);

      expect(localStorage.getItem('widthOfWidget')).toBe('800');
      expect(JSON.parse(localStorage.getItem('ai-chat-panel-state')!)).toEqual(
        expect.objectContaining({ width: 900 }),
      );
      // The merged document matches the server signature — nothing to push.
      expect(mockHttpController.put).not.toHaveBeenCalled();
    });
  });
});

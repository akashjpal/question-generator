import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { AgenticModeService } from './agentic-mode.service';

describe('AgenticModeService', () => {
  let service: AgenticModeService;

  const STORAGE_KEY = 'ai-quick-analysis-agentic-mode';

  function createService(platformId = 'browser') {
    TestBed.configureTestingModule({
      providers: [AgenticModeService, { provide: PLATFORM_ID, useValue: platformId }],
    });
    return TestBed.inject(AgenticModeService);
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('should be created', () => {
    service = createService();
    expect(service).toBeTruthy();
  });

  it('should default to disabled when no stored preference', () => {
    service = createService();
    expect(service.enabled()).toBe(false);
  });

  it('should read initial value from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    service = createService();
    expect(service.enabled()).toBe(true);
  });

  it('set() should update the enabled signal', () => {
    service = createService();
    service.set(true);
    expect(service.enabled()).toBe(true);
    service.set(false);
    expect(service.enabled()).toBe(false);
  });

  it('toggle() should flip the enabled signal', () => {
    service = createService();
    expect(service.enabled()).toBe(false);
    service.toggle();
    expect(service.enabled()).toBe(true);
    service.toggle();
    expect(service.enabled()).toBe(false);
  });

  it('should persist changes to localStorage', () => {
    service = createService();
    service.set(true);
    TestBed.flushEffects();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('should not touch localStorage in SSR (non-browser) context', () => {
    service = createService('server');
    expect(service).toBeTruthy();
    expect(service.enabled()).toBe(false);
    service.toggle();
    TestBed.flushEffects();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

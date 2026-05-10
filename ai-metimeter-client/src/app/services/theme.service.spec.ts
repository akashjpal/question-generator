import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;

  const STORAGE_KEY = 'ai-quick-analysis-theme';

  function createService(platformId = 'browser') {
    TestBed.configureTestingModule({
      providers: [ThemeService, { provide: PLATFORM_ID, useValue: platformId }],
    });
    return TestBed.inject(ThemeService);
  }

  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    TestBed.resetTestingModule();
  });

  it('should be created', () => {
    service = createService();
    expect(service).toBeTruthy();
  });

  it('should default to dark when no stored preference and no system preference', () => {
    // jsdom does not implement matchMedia, so it falls through to the default
    service = createService();
    expect(service.currentTheme()).toBe('dark');
  });

  it('setTheme() should update the currentTheme signal', () => {
    service = createService();
    service.setTheme('light');
    expect(service.currentTheme()).toBe('light');
    service.setTheme('dark');
    expect(service.currentTheme()).toBe('dark');
  });

  it('toggleTheme() should switch dark → light → dark', () => {
    service = createService();
    service.setTheme('dark');
    service.toggleTheme();
    expect(service.currentTheme()).toBe('light');
    service.toggleTheme();
    expect(service.currentTheme()).toBe('dark');
  });

  it('isDarkMode() should reflect the current theme', () => {
    service = createService();
    service.setTheme('dark');
    expect(service.isDarkMode()).toBe(true);
    service.setTheme('light');
    expect(service.isDarkMode()).toBe(false);
  });

  it('should read initial theme from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'light');
    service = createService();
    expect(service.currentTheme()).toBe('light');
  });

  it('should apply theme class to document.body', () => {
    service = createService();
    service.setTheme('light');
    // Angular signal effects are scheduled asynchronously; flush them before asserting DOM state
    TestBed.flushEffects();
    expect(document.body.classList.contains('light-theme')).toBe(true);
    expect(document.body.classList.contains('dark-theme')).toBe(false);
  });

  it('should not touch the DOM in SSR (non-browser) context', () => {
    // On the server platform, the service should not throw or manipulate the DOM
    service = createService('server');
    expect(service).toBeTruthy();
    expect(service.currentTheme()).toBe('dark'); // server default
  });
});

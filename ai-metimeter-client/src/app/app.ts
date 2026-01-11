import { Component, signal, inject } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './components/layout/header/header';
import { FooterComponent } from './components/layout/footer/footer';
import { ThemeService } from './services/theme.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, HeaderComponent, FooterComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  // Inject ThemeService to ensure it initializes on app startup
  private themeService = inject(ThemeService);

  protected readonly title = signal('ai-quick-analysis');
  isLandingPage = signal(false);

  constructor(private router: Router) {
    // Check initial route
    this.checkRoute(this.router.url);

    // Subscribe to route changes
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.checkRoute(event.urlAfterRedirects || event.url);
    });
  }

  private checkRoute(url: string) {
    // Hide header/footer on landing page (root path) and dashboard pages (which have their own nav)
    // Strip hash fragment to properly detect landing page with anchor navigation (e.g., /#testimonials)
    const urlWithoutHash = url.split('#')[0];
    this.isLandingPage.set(urlWithoutHash === '/' || urlWithoutHash === '' || url.startsWith('/dashboard'));
  }
}

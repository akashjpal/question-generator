import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-landing-navbar',
    standalone: true,
    imports: [CommonModule, MatButtonModule, MatIconModule, RouterLink],
    templateUrl: './landing-navbar.html',
    styleUrl: './landing-navbar.scss'
})
export class LandingNavbar {
    isScrolled = false;
    isMobileMenuOpen = false;

    @HostListener('window:scroll')
    onScroll() {
        this.isScrolled = window.scrollY > 50;
    }

    toggleMobileMenu() {
        this.isMobileMenuOpen = !this.isMobileMenuOpen;
    }

    closeMobileMenu() {
        this.isMobileMenuOpen = false;
    }
}

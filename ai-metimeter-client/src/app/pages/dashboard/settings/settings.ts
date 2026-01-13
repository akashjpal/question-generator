import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ThemeService } from '../../../services/theme.service';

interface SettingsSection {
    id: string;
    label: string;
    icon: string;
}

@Component({
    selector: 'app-settings',
    standalone: true,
    imports: [
        CommonModule,
        MatIconModule,
        MatSlideToggleModule
    ],
    templateUrl: './settings.html',
    styleUrls: ['./settings.scss']
})
export class Settings {
    private themeService = inject(ThemeService);

    activeSection = 'profile';

    settingsSections: SettingsSection[] = [
        { id: 'profile', label: 'Profile', icon: 'person' },
        { id: 'preferences', label: 'Preferences', icon: 'tune' },
        { id: 'notifications', label: 'Notifications', icon: 'notifications' },
        { id: 'security', label: 'Security', icon: 'shield' }
    ];

    get isDarkMode(): boolean {
        return this.themeService.isDarkMode();
    }

    setActiveSection(sectionId: string): void {
        this.activeSection = sectionId;
    }

    onThemeToggle(checked: boolean): void {
        this.themeService.setTheme(checked ? 'dark' : 'light');
    }
}

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-landing-cta',
    standalone: true,
    imports: [CommonModule, MatButtonModule, MatIconModule, RouterLink],
    templateUrl: './landing-cta.html',
    styleUrl: './landing-cta.scss'
})
export class LandingCta {

}

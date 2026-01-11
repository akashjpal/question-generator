import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-landing-hero',
  standalone: true,
  imports: [CommonModule, MatButtonModule, RouterLink, MatIconModule],
  templateUrl: './landing-hero.html',
  styleUrl: './landing-hero.scss',
})
export class LandingHero {

}

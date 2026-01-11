import { Component } from '@angular/core';
import { LandingNavbar } from './landing-navbar/landing-navbar';
import { LandingHero } from './landing-hero/landing-hero';
import { LandingStats } from './landing-stats/landing-stats';
import { LandingFeatures } from './landing-features/landing-features';
import { LandingHowItWorks } from './landing-how-it-works/landing-how-it-works';
import { LandingTestimonials } from './landing-testimonials/landing-testimonials';
import { LandingPricing } from './landing-pricing/landing-pricing';
import { LandingCta } from './landing-cta/landing-cta';
import { LandingFooter } from './landing-footer/landing-footer';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    LandingNavbar,
    LandingHero,
    LandingStats,
    LandingFeatures,
    LandingHowItWorks,
    LandingTestimonials,
    LandingPricing,
    LandingCta,
    LandingFooter
  ],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class Landing {

}

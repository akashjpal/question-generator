import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LandingHero } from './landing-hero';

describe('LandingHero', () => {
  let component: LandingHero;
  let fixture: ComponentFixture<LandingHero>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingHero]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LandingHero);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

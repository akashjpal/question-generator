import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { LandingHero } from './landing-hero';

describe('LandingHero', () => {
  let component: LandingHero;
  let fixture: ComponentFixture<LandingHero>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingHero, RouterModule.forRoot([])],
    }).compileComponents();

    fixture = TestBed.createComponent(LandingHero);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

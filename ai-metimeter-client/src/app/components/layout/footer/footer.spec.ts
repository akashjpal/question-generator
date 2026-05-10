import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FooterComponent } from './footer';

describe('FooterComponent', () => {
  let component: FooterComponent;
  let fixture: ComponentFixture<FooterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FooterComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(FooterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should expose the current year', () => {
    expect(component.currentYear).toBe(new Date().getFullYear());
  });

  it('should render the footer element', () => {
    const compiled: HTMLElement = fixture.nativeElement;
    expect(compiled.innerHTML.length).toBeGreaterThan(0);
  });
});

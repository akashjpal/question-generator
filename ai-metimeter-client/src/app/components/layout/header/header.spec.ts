import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { HeaderComponent } from './header';

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeaderComponent, RouterModule.forRoot([])],
    }).compileComponents();

    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the brand logo with text "AI Quick Analysis"', () => {
    const logo: HTMLElement = fixture.nativeElement.querySelector('.logo');
    expect(logo).toBeTruthy();
    expect(logo.textContent?.trim()).toBe('AI Quick Analysis');
  });

  it('should render a Log In navigation link', () => {
    const loginBtn: HTMLElement = fixture.nativeElement.querySelector('.login-btn');
    expect(loginBtn).toBeTruthy();
  });

  it('should render navigation links for Features and Pricing', () => {
    const anchors: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('a[mat-button]');
    const texts = Array.from(anchors).map(a => a.textContent?.trim());
    expect(texts).toContain('Features');
    expect(texts).toContain('Pricing');
  });
});

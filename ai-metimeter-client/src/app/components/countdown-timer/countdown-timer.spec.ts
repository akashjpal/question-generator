import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CountdownTimerComponent } from './countdown-timer';

describe('CountdownTimerComponent', () => {
  let component: CountdownTimerComponent;
  let fixture: ComponentFixture<CountdownTimerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CountdownTimerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CountdownTimerComponent);
    component = fixture.componentInstance;
    // Do NOT call fixture.detectChanges() here — each test controls ngOnInit timing
  });

  afterEach(() => {
    vi.useRealTimers();
    fixture.destroy();
  });

  it('should create', () => {
    component.totalSeconds = 60;
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should display initial time in HH:MM:SS format', () => {
    component.totalSeconds = 3661; // 1h 1m 1s
    fixture.detectChanges();
    expect(component.display).toBe('01:01:01');
  });

  it('should apply timer-warning CSS class when timeLeft is under 60 seconds', () => {
    component.totalSeconds = 30;
    fixture.detectChanges();

    const timerEl: HTMLElement = fixture.nativeElement.querySelector('.timer-pill');
    expect(timerEl.classList.contains('timer-warning')).toBe(true);
  });

  it('should tick down by 1 each second using fake timers', () => {
    vi.useFakeTimers();

    component.totalSeconds = 10;
    fixture.detectChanges(); // calls ngOnInit → starts the interval

    expect(component.timeLeft).toBe(10);

    vi.advanceTimersByTime(1000);
    expect(component.timeLeft).toBe(9);

    vi.advanceTimersByTime(2000);
    expect(component.timeLeft).toBe(7);
  });

  it('should emit timerEnd when countdown reaches zero', () => {
    vi.useFakeTimers();

    component.totalSeconds = 2;
    const timerEndSpy = vi.fn();
    component.timerEnd.subscribe(timerEndSpy);
    fixture.detectChanges();

    vi.advanceTimersByTime(3000); // advance past the end

    expect(timerEndSpy).toHaveBeenCalledTimes(1);
    expect(component.timeLeft).toBe(0);
  });

  it('should emit timeUpdate on every tick', () => {
    vi.useFakeTimers();

    component.totalSeconds = 5;
    const updates: number[] = [];
    component.timeUpdate.subscribe((t: number) => updates.push(t));
    fixture.detectChanges();

    vi.advanceTimersByTime(3000);

    expect(updates).toEqual([4, 3, 2]);
  });

  it('should clear the interval on destroy', () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    component.totalSeconds = 60;
    fixture.detectChanges();
    fixture.destroy();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});

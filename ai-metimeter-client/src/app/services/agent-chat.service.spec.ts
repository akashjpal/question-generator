import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AgentChatService } from './agent-chat.service';
import { environment } from '../../environments/environment';
import type { AgentSessionDetail } from '../models';

const BASE_URL = environment.agentApiUrl;

function detail(processing: boolean): AgentSessionDetail {
  return {
    session: {
      id: 's1', title: null, status: 'active', processing,
      current_tool: processing ? 'generate_questions' : null,
      current_step: processing ? 'Generating questions…' : null,
      created_at: '', updated_at: '',
    },
    messages: [],
  };
}

describe('AgentChatService', () => {
  let service: AgentChatService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AgentChatService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AgentChatService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('sendMessage() POSTs the message to /sessions/:id/chat', () => {
    service.sendMessage('s1', 'hello').subscribe();
    const req = httpMock.expectOne(`${BASE_URL}/sessions/s1/chat`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ message: 'hello' });
    req.flush({ id: 'm1', role: 'user', content: 'hello', sequence: 0, created_at: '' });
  });

  it('pollSession() emits and completes once processing goes back to false', () => {
    vi.useFakeTimers();

    return new Promise<void>(resolve => {
      const seen: boolean[] = [];
      service.pollSession('s1').subscribe({
        next: d => seen.push(d.session.processing),
        complete: () => {
          expect(seen).toEqual([true, false]);
          vi.useRealTimers();
          resolve();
        },
      });

      vi.advanceTimersByTime(0);
      httpMock.expectOne(`${BASE_URL}/sessions/s1`).flush(detail(true));

      vi.advanceTimersByTime(2000);
      httpMock.expectOne(`${BASE_URL}/sessions/s1`).flush(detail(false));
    });
  });
});

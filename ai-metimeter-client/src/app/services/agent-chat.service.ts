import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, fromEvent, timer } from 'rxjs';
import { delayWhen, retryWhen, switchMap, takeWhile, tap } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import {
    AgentChatMessage,
    AgentChatSession,
    AgentSessionDetail,
    AgentUploadResponse,
} from '../models';

@Injectable({
    providedIn: 'root'
})
export class AgentChatService {
    private readonly BASE_URL = environment.agentApiUrl;

    constructor(private http: HttpClient) { }

    createSession(): Observable<{ id: string }> {
        return this.http.post<{ id: string }>(`${this.BASE_URL}/sessions`, {});
    }

    listSessions(): Observable<AgentChatSession[]> {
        return this.http.get<AgentChatSession[]>(`${this.BASE_URL}/sessions`);
    }

    getSession(sessionId: string): Observable<AgentSessionDetail> {
        return this.http.get<AgentSessionDetail>(`${this.BASE_URL}/sessions/${sessionId}`);
    }

    uploadFile(sessionId: string, file: File): Observable<AgentUploadResponse> {
        const formData = new FormData();
        formData.append('file', file);
        return this.http.post<AgentUploadResponse>(`${this.BASE_URL}/sessions/${sessionId}/upload`, formData);
    }

    /** Fires the agent turn in the background; poll the session (below) for progress/results. */
    sendMessage(sessionId: string, message: string): Observable<AgentChatMessage> {
        return this.http.post<AgentChatMessage>(`${this.BASE_URL}/sessions/${sessionId}/chat`, { message });
    }

    /**
     * Same polling convention as assessment.service.ts's pollGenerationStatus:
     * poll every 2s, keep retrying through transient/offline errors, stop
     * once the session's `processing` flag goes back to false.
     */
    pollSession(sessionId: string): Observable<AgentSessionDetail> {
        return timer(0, 2000).pipe(
            switchMap(() => this.getSession(sessionId)),
            retryWhen(errors => errors.pipe(
                tap(err => console.log('Polling failed (offline?), retrying when online...', err)),
                delayWhen(() => navigator.onLine ? timer(2000) : fromEvent(window, 'online'))
            )),
            takeWhile(detail => detail.session.processing, true)
        );
    }
}

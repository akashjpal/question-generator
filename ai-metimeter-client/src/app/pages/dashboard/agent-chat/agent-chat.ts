import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AgentChatService } from '../../../services/agent-chat.service';
import { AgentChatBubble, AgentChatMessage, AgentSessionDetail, PublishedQuizSummary } from '../../../models';
import { MessageList } from './message-list/message-list';
import { Composer } from './composer/composer';

@Component({
    selector: 'app-agent-chat',
    standalone: true,
    imports: [CommonModule, MessageList, Composer],
    templateUrl: './agent-chat.html',
    styleUrl: './agent-chat.scss'
})
export class AgentChat implements OnInit {
    sessionId = signal<string | null>(null);
    bubbles = signal<AgentChatBubble[]>([]);
    sending = signal(false);
    liveStatus = signal<string | null>(null);
    attachedFileName = signal<string | null>(null);
    loadingSession = signal(true);
    sessionError = signal<string | null>(null);

    constructor(private agentChatService: AgentChatService) { }

    ngOnInit(): void {
        this.initSession();
    }

    retry(): void {
        this.sessionError.set(null);
        this.loadingSession.set(true);
        this.initSession();
    }

    private initSession(): void {
        this.agentChatService.listSessions().subscribe({
            next: (sessions) => {
                const active = sessions.find(s => s.status === 'active');
                if (active) {
                    this.resumeSession(active.id);
                } else {
                    this.createNewSession();
                }
            },
            error: (err) => this.createNewSession(err),
        });
    }

    private createNewSession(priorError?: unknown): void {
        this.agentChatService.createSession().subscribe({
            next: (res) => {
                this.sessionId.set(res.id);
                this.sessionError.set(null);
                this.loadingSession.set(false);
            },
            error: (err) => {
                this.loadingSession.set(false);
                this.sessionError.set(this.describeHttpError(err ?? priorError));
            },
        });
    }

    private resumeSession(id: string): void {
        this.agentChatService.getSession(id).subscribe({
            next: (detail) => {
                this.sessionId.set(id);
                this.sessionError.set(null);
                this.bubbles.set(this.bubblesFromMessages(detail.messages));
                this.loadingSession.set(false);
                if (detail.session.processing) {
                    // A turn was still running when the page loaded/refreshed —
                    // SSE's long-lived connection implicitly covered this before;
                    // polling must explicitly re-arm it.
                    this.sending.set(true);
                    this.pollTurn(id, null);
                }
            },
            error: () => this.createNewSession(),
        });
    }

    private describeHttpError(err: any): string {
        if (err?.status === 0) {
            return "Can't reach the agent service — is it running and reachable at the configured URL?";
        }
        if (err?.status === 401) {
            return 'Your session has expired — please log in again.';
        }
        if (err?.status) {
            return `Agent service returned an error (${err.status}). Please try again.`;
        }
        return 'Could not start a chat session. Please try again.';
    }

    onFileSelected(file: File): void {
        const sessionId = this.sessionId();
        if (!sessionId) {
            this.pushSystemBubble('No active chat session yet — please wait a moment or hit retry above, then try attaching again.');
            return;
        }
        this.agentChatService.uploadFile(sessionId, file).subscribe({
            next: (res) => {
                this.attachedFileName.set(res.fileName);
                this.pushSystemBubble(`Attached "${res.fileName}" — tell me about the quiz you'd like.`);
            },
            error: (err) => {
                this.pushSystemBubble(`Failed to upload the PDF: ${this.describeHttpError(err)}`);
            },
        });
    }

    private pushSystemBubble(text: string): void {
        this.bubbles.update(list => [...list, {
            id: crypto.randomUUID(),
            role: 'assistant',
            text,
            pending: false,
        }]);
    }

    onSend(message: string): void {
        if (this.sending()) {
            return;
        }
        const sessionId = this.sessionId();
        if (!sessionId) {
            this.pushSystemBubble('No active chat session yet — please wait a moment or hit retry above, then try again.');
            return;
        }

        this.sending.set(true);
        this.agentChatService.sendMessage(sessionId, message).subscribe({
            next: (userMessage) => {
                const pendingId = crypto.randomUUID();
                this.bubbles.update(list => [
                    ...list,
                    this.toBubble(userMessage),
                    { id: pendingId, role: 'assistant', text: '', pending: true },
                ]);
                this.pollTurn(sessionId, pendingId);
            },
            error: (err) => {
                this.sending.set(false);
                this.pushSystemBubble(`Failed to send: ${this.describeHttpError(err)}`);
            },
        });
    }

    /** Polls the session until the turn finishes, then swaps the pending
     * placeholder (if any) for whatever new messages actually landed. */
    private pollTurn(sessionId: string, pendingBubbleId: string | null): void {
        this.agentChatService.pollSession(sessionId).subscribe({
            next: (detail: AgentSessionDetail) => {
                this.liveStatus.set(detail.session.current_step);
                if (!detail.session.processing) {
                    const known = new Set(this.bubbles().map(b => b.id));
                    const newBubbles = detail.messages
                        .filter(m => m.role !== 'tool' && !known.has(m.id))
                        .map(m => this.toBubble(m));
                    this.bubbles.update(list => [
                        ...list.filter(b => b.id !== pendingBubbleId),
                        ...newBubbles,
                    ]);
                    if (newBubbles.some(b => b.published)) {
                        this.attachedFileName.set(null);
                    }
                }
            },
            error: () => {
                if (pendingBubbleId) {
                    this.updateBubble(pendingBubbleId, b => ({ ...b, pending: false, error: 'Connection lost — please try again.' }));
                }
                this.sending.set(false);
                this.liveStatus.set(null);
            },
            complete: () => {
                this.sending.set(false);
                this.liveStatus.set(null);
            },
        });
    }

    private toBubble(m: AgentChatMessage): AgentChatBubble {
        return {
            id: m.id,
            role: m.role as 'user' | 'assistant',
            text: m.content,
            pending: false,
            published: (m.tool_payload as PublishedQuizSummary) ?? undefined,
        };
    }

    private bubblesFromMessages(messages: AgentChatMessage[]): AgentChatBubble[] {
        return messages.filter(m => m.role !== 'tool').map(m => this.toBubble(m));
    }

    private updateBubble(id: string, updater: (b: AgentChatBubble) => AgentChatBubble): void {
        this.bubbles.update(list => list.map(b => (b.id === id ? updater(b) : b)));
    }
}

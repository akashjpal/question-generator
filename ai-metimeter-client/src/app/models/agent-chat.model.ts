/**
 * Agentic Chatbot Models
 * Types for the ai-agent-chatbot service's chat sessions/messages.
 */

export interface AgentChatSession {
    id: string;
    title: string | null;
    status: 'active' | 'completed' | 'archived';
    last_assessment_id?: number | null;
    processing: boolean;
    current_tool: string | null;
    current_step: string | null;
    created_at: string;
    updated_at: string;
}

export interface PublishedQuizSummary {
    assessment_id: number;
    title: string;
    code: string;
    attempt_link: string;
    time_limit?: number;
    questions_count: number;
}

export interface AgentChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'tool';
    content: string;
    tool_name?: string | null;
    tool_payload?: PublishedQuizSummary | Record<string, unknown> | null;
    sequence: number;
    created_at: string;
}

export interface AgentSessionDetail {
    session: AgentChatSession;
    messages: AgentChatMessage[];
}

export interface AgentUploadResponse {
    fileId: string;
    fileName: string;
}

/** Local (not-yet-persisted) chat bubble shown while polling for a reply. */
export interface AgentChatBubble {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    pending: boolean;
    published?: PublishedQuizSummary;
    error?: string;
}

-- Agentic chatbot — chat session/message storage. This is the ONLY
-- persistence for the agent (no LangGraph checkpointer): agent state is
-- rebuilt from these tables on every turn (see agent/state.py's
-- build_state_from_rows) and processing/current_tool/current_step are what
-- the frontend polls (GET /sessions/{id}) for live turn progress.
--
-- Run this against the Supabase project's SQL editor (or via `supabase db
-- push` if this repo adopts migrations for that project later — it doesn't
-- today, so this is a plain SQL file to run manually, matching how the rest
-- of this repo's Supabase tables were provisioned). No automatic bootstrap
-- on service startup.

create table if not exists agent_chat_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    title text,
    status text not null default 'active' check (status in ('active', 'completed', 'archived')),
    pending_file_id text,
    pending_file_name text,
    last_assessment_id bigint,
    processing boolean not null default false,
    current_tool text,
    current_step text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists agent_chat_sessions_user_id_idx on agent_chat_sessions(user_id);

create table if not exists agent_chat_messages (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references agent_chat_sessions(id) on delete cascade,
    role text not null check (role in ('user', 'assistant', 'tool')),
    content text not null,
    tool_name text,
    tool_payload jsonb,
    sequence int not null,
    created_at timestamptz not null default now()
);

create index if not exists agent_chat_messages_session_id_idx on agent_chat_messages(session_id, sequence);

-- RLS: defense in depth. This service reads/writes via the Supabase
-- service-role key (which bypasses RLS), so these policies matter only if
-- these tables are ever queried directly from the client with the anon key.
alter table agent_chat_sessions enable row level security;
alter table agent_chat_messages enable row level security;

create policy "Users can read their own chat sessions"
    on agent_chat_sessions for select
    using (auth.uid() = user_id);

create policy "Users can read messages in their own sessions"
    on agent_chat_messages for select
    using (
        exists (
            select 1 from agent_chat_sessions s
            where s.id = agent_chat_messages.session_id
            and s.user_id = auth.uid()
        )
    );

-- ── Notifications table ──────────────────────────────────────────────────────
-- Run this once in your Supabase SQL Editor (Database → SQL Editor → New query).

create table if not exists notifications (
  id          text        primary key,
  user_id     text        not null,
  message     text        not null,
  request_id  text,
  is_read     boolean     not null default false,
  created_at  text        not null,
  page        text,
  metadata    jsonb
);

-- Index for fast per-user queries
create index if not exists notifications_user_id_idx on notifications (user_id);
create index if not exists notifications_created_at_idx on notifications (created_at desc);

-- Row Level Security
alter table notifications enable row level security;

-- Allow the app (anon key) to insert notifications for any user
create policy "Service can insert notifications"
  on notifications for insert
  to anon
  with check (true);

-- Allow reading all notifications (the app filters by user_id in JS)
create policy "Service can read notifications"
  on notifications for select
  to anon
  using (true);

-- Allow marking notifications as read
create policy "Service can update notifications"
  on notifications for update
  to anon
  using (true);


-- ── Approval signatures ───────────────────────────────────────────────────────
-- Add signature_data column to request_approvals so e-signatures persist
-- across devices and sessions. Run this in the same SQL Editor session.

alter table request_approvals
  add column if not exists signature_data jsonb;

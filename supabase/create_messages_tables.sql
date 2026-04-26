-- ── Direct Messages table ────────────────────────────────────────────────────
-- Run this once in your Supabase SQL Editor (Database → SQL Editor → New query).

create table if not exists direct_messages (
  id           text  primary key,
  sender_id    text  not null,
  receiver_id  text  not null,
  message      text  not null,
  timestamp    text  not null,
  status       text  not null default 'delivered'
);

create index if not exists direct_messages_sender_idx   on direct_messages (sender_id);
create index if not exists direct_messages_receiver_idx on direct_messages (receiver_id);
create index if not exists direct_messages_ts_idx       on direct_messages (timestamp desc);

alter table direct_messages enable row level security;

create policy "Service can insert messages"
  on direct_messages for insert to anon with check (true);

create policy "Service can read messages"
  on direct_messages for select to anon using (true);

create policy "Service can update messages"
  on direct_messages for update to anon using (true);


-- ── Announcements table ───────────────────────────────────────────────────────

create table if not exists announcements (
  id            text   primary key,
  sender_id     text   not null,
  audience_type text   not null default 'all',
  department    text,
  message       text   not null,
  timestamp     text   not null,
  status        text   not null default 'delivered',
  read_by       jsonb  not null default '[]'::jsonb
);

create index if not exists announcements_ts_idx on announcements (timestamp desc);

alter table announcements enable row level security;

create policy "Service can insert announcements"
  on announcements for insert to anon with check (true);

create policy "Service can read announcements"
  on announcements for select to anon using (true);

create policy "Service can update announcements"
  on announcements for update to anon using (true);

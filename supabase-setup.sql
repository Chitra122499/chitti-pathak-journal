-- ══════════════════════════════════════════════════════════
--  RUN THIS IN: Supabase Dashboard → SQL Editor → New query
-- ══════════════════════════════════════════════════════════

-- 1. ATTENDANCE table
create table if not exists attendance (
  id          bigint generated always as identity primary key,
  day_key     text        not null,   -- "YYYY-MM-DD"
  user_name   text        not null,   -- "Chitti" or "Pathak"
  type        text        not null,   -- "checkin" | "checkout" | "home"
  photo_url   text,                   -- Storage URL (null for home)
  time_str    text        not null,
  ts          bigint      not null,   -- unix ms
  favourited  boolean     default false,
  created_at  timestamptz default now(),
  unique(day_key, user_name, type)
);

-- 2. JOURNAL table
create table if not exists journal (
  id          bigint generated always as identity primary key,
  day_key     text        not null,
  user_name   text        not null,
  entry_text  text        not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(day_key, user_name)
);

-- 3. REACTIONS table  (on journal entries)
create table if not exists reactions (
  id          bigint generated always as identity primary key,
  day_key     text   not null,
  target_user text   not null,   -- whose entry was reacted to
  from_user   text   not null,   -- who reacted
  emoji       text   not null,
  created_at  timestamptz default now(),
  unique(day_key, target_user, from_user)
);

-- 4. REPLIES table
create table if not exists replies (
  id          bigint generated always as identity primary key,
  day_key     text   not null,
  target_user text   not null,
  from_user   text   not null,
  reply_text  text   not null,
  created_at  timestamptz default now()
);

-- 5. NOTIFICATIONS table
create table if not exists notifications (
  id          bigint generated always as identity primary key,
  day_key     text    not null,
  to_user     text    not null,
  from_user   text    not null,
  message     text    not null,
  is_read     boolean default false,
  created_at  timestamptz default now()
);

-- 6. FAVOURITES table
create table if not exists favourites (
  id           bigint generated always as identity primary key,
  owner_user   text   not null,   -- who saved it
  kind         text   not null,   -- "att_photo" | "entry"
  from_user    text   not null,
  day_key      text   not null,
  photo_url    text,
  att_type     text,              -- "checkin" | "checkout"
  time_str     text,
  entry_text   text,
  created_at   timestamptz default now()
);

-- ── Enable Realtime on all tables ──
alter publication supabase_realtime add table attendance;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table journal;
alter publication supabase_realtime add table reactions;
alter publication supabase_realtime add table replies;

-- ── Row Level Security: allow all (PIN-protected app) ──
alter table attendance    enable row level security;
alter table journal        enable row level security;
alter table reactions      enable row level security;
alter table replies        enable row level security;
alter table notifications  enable row level security;
alter table favourites     enable row level security;

create policy "allow all" on attendance    for all using (true) with check (true);
create policy "allow all" on journal        for all using (true) with check (true);
create policy "allow all" on reactions      for all using (true) with check (true);
create policy "allow all" on replies        for all using (true) with check (true);
create policy "allow all" on notifications  for all using (true) with check (true);
create policy "allow all" on favourites     for all using (true) with check (true);

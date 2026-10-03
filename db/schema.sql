-- Human Library for Children：このアプリ用の表（すべて kansha_ で始まる）
-- 既存プロジェクトの他の表には触れない。何度実行しても同じ結果になるように書く。

create table if not exists kansha_videos (
  id text primary key,                 -- YouTube 動画ID
  url text not null,
  title text not null default '',
  summary text not null default '',
  cat text not null default '',        -- ジャンル
  is_infra boolean not null default false,
  kind text not null default '',       -- 公式か個人か
  channel text not null default '',
  length text not null default '',
  job text not null default '',        -- 映っている仕事
  memo text not null default '',
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected')),
  available boolean,                   -- 動画の確認の結果（null＝まだ確かめていない）
  checked_at timestamptz,
  sort_order integer not null default 0,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists kansha_users (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  age_group text not null check (age_group in ('elementary', 'junior_high', 'high', 'university')),
  consent_at timestamptz not null,
  consent_by text not null check (consent_by in ('guardian', 'self')),
  created_at timestamptz not null default now()
);

create table if not exists kansha_invites (
  code text primary key,
  note text not null default '',
  used_by uuid references kansha_users(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create table if not exists kansha_days (
  user_id uuid not null references kansha_users(id) on delete cascade,
  date date not null,
  answers jsonb not null default '{}'::jsonb,
  selected_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table if not exists kansha_selections (
  id bigserial primary key,
  user_id uuid not null references kansha_users(id) on delete cascade,
  date date not null,
  video_id text not null references kansha_videos(id),
  rank integer not null,
  label text not null,
  path jsonb not null,
  kind text not null check (kind in ('related', 'infra', 'general')),
  is_fallback boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, date, video_id)
);
create index if not exists kansha_selections_date_idx on kansha_selections (date);

create table if not exists kansha_views (
  id bigserial primary key,
  user_id uuid not null references kansha_users(id) on delete cascade,
  video_id text not null references kansha_videos(id),
  date date not null,
  watched_at timestamptz not null default now(),
  is_first_of_day boolean not null,
  unique (user_id, video_id, date)
);

create table if not exists kansha_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references kansha_users(id) on delete cascade,
  video_id text not null references kansha_videos(id),
  date date not null,
  text text not null,
  verdict text check (verdict in ('ok', 'ng', 'gray')),
  reason text not null default '',
  question text,
  status text not null check (status in ('ok', 'ng', 'pending', 'approved', 'rejected')),
  counts_for_meter boolean not null default false,
  ai_failed boolean not null default false,
  notified_at timestamptz,             -- 承認待ちの結果を子どもが見た日時
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists kansha_comments_user_idx on kansha_comments (user_id);
create index if not exists kansha_comments_video_idx on kansha_comments (video_id, status);
create index if not exists kansha_comments_status_idx on kansha_comments (status);

-- サーバー経由でしか触れないようにする。
-- Supabase の公開キー（anon / authenticated）からは読めないよう、行レベルセキュリティを有効にし、権限も外す。
alter table kansha_videos enable row level security;
alter table kansha_users enable row level security;
alter table kansha_invites enable row level security;
alter table kansha_days enable row level security;
alter table kansha_selections enable row level security;
alter table kansha_views enable row level security;
alter table kansha_comments enable row level security;

do $$
declare
  r record;
  t text;
begin
  for r in select rolname from pg_roles where rolname in ('anon', 'authenticated') loop
    foreach t in array array['kansha_videos', 'kansha_users', 'kansha_invites', 'kansha_days',
                             'kansha_selections', 'kansha_views', 'kansha_comments'] loop
      execute format('revoke all on table %I from %I', t, r.rolname);
    end loop;
    execute format('revoke all on sequence kansha_selections_id_seq from %I', r.rolname);
    execute format('revoke all on sequence kansha_views_id_seq from %I', r.rolname);
  end loop;
end $$;

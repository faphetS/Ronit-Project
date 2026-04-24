-- Tracks webhook messages we've already processed (prevents retry duplicates).
create table if not exists processed_webhooks (
  id           bigint generated always as identity primary key,
  source       text    not null,   -- 'meta', 'monday', etc.
  external_id  text    not null,   -- message.mid for Meta, pulseId for Monday
  processed_at timestamptz not null default now()
);

create unique index if not exists ux_processed_webhooks_source_ext
  on processed_webhooks (source, external_id);

-- Maps Instagram sender IDs to Monday.com item IDs for dedup + phone updates.
create table if not exists known_senders (
  id              bigint generated always as identity primary key,
  platform        text    not null,   -- 'instagram', 'whatsapp'
  sender_id       text    not null,   -- IG scoped user ID or WA phone
  sender_username text,               -- IG username (can change, for display only)
  monday_item_id  text    not null,   -- the CRM board item ID
  phone           text,               -- extracted phone number, updated when received
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists ux_known_senders_platform_sender
  on known_senders (platform, sender_id);

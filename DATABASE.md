# Nestmates — Database Schema
## Run this entire file in your Supabase SQL Editor

---

## EXTENSIONS
```sql
create extension if not exists "uuid-ossp";
```

---

## TABLES

### profiles
Extends Supabase auth.users with display info.
```sql
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,
  avatar_url    text,
  group_id      uuid references groups(id) on delete set null,
  created_at    timestamptz default now()
);
```

### groups
A household. One group per set of roommates.
```sql
create table groups (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  invite_code  text unique not null,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz default now()
);
```

> Note: Add `group_id` FK to `profiles` after creating `groups`:
```sql
alter table profiles
  add constraint profiles_group_id_fkey
  foreign key (group_id) references groups(id) on delete set null;
```

### chores
Tasks assigned to group members.
```sql
create table chores (
  id            uuid primary key default uuid_generate_v4(),
  group_id      uuid not null references groups(id) on delete cascade,
  title         text not null,
  description   text,
  assigned_to   uuid references profiles(id) on delete set null,
  assigned_by   uuid references profiles(id) on delete set null,
  is_completed  boolean default false,
  completed_at  timestamptz,
  completed_by  uuid references profiles(id) on delete set null,
  due_date      date,
  created_at    timestamptz default now()
);
```

### messages
Group chat messages.
```sql
create table messages (
  id          uuid primary key default uuid_generate_v4(),
  group_id    uuid not null references groups(id) on delete cascade,
  sender_id   uuid not null references profiles(id) on delete cascade,
  content     text not null check (char_length(content) <= 2000),
  created_at  timestamptz default now()
);
```

### bills
Shared expenses.
```sql
create table bills (
  id           uuid primary key default uuid_generate_v4(),
  group_id     uuid not null references groups(id) on delete cascade,
  title        text not null,
  amount       numeric(10, 2) not null check (amount > 0),
  paid_by      uuid not null references profiles(id) on delete cascade,
  receipt_url  text,
  note         text,
  created_at   timestamptz default now()
);
```

### bill_splits
Who owes what for each bill.
```sql
create table bill_splits (
  id          uuid primary key default uuid_generate_v4(),
  bill_id     uuid not null references bills(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  amount_owed numeric(10, 2) not null,
  is_paid     boolean default false,
  paid_at     timestamptz,
  unique (bill_id, user_id)
);
```

### complaints
Filed by one member against another.
```sql
create table complaints (
  id           uuid primary key default uuid_generate_v4(),
  group_id     uuid not null references groups(id) on delete cascade,
  filed_by     uuid not null references profiles(id) on delete cascade,
  filed_against uuid not null references profiles(id) on delete cascade,
  reason       text not null check (char_length(reason) >= 10),
  created_at   timestamptz default now(),
  check (filed_by != filed_against)
);
```

### strikes
Strike record per user per group. Auto-managed by trigger.
```sql
create table strikes (
  id            uuid primary key default uuid_generate_v4(),
  group_id      uuid not null references groups(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  strike_count  int default 0,
  unique (group_id, user_id)
);
```

### punishments
Active punishments assigned on 3rd strike.
```sql
create table punishments (
  id            uuid primary key default uuid_generate_v4(),
  group_id      uuid not null references groups(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  description   text not null,
  assigned_at   timestamptz default now(),
  is_completed  boolean default false,
  completed_at  timestamptz
);
```

### group_punishments
Custom punishment options per group.
```sql
create table group_punishments (
  id          uuid primary key default uuid_generate_v4(),
  group_id    uuid not null references groups(id) on delete cascade,
  description text not null
);
```

Seed default punishments via API after group creation.

---

## INDEXES
```sql
create index on chores(group_id);
create index on chores(assigned_to);
create index on messages(group_id, created_at desc);
create index on bills(group_id);
create index on bill_splits(bill_id);
create index on bill_splits(user_id);
create index on complaints(group_id);
create index on complaints(filed_against);
create index on strikes(group_id, user_id);
```

---

## TRIGGERS

### Auto-create profile on signup
```sql
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
```

### Strike counter on new complaint
```sql
create or replace function handle_new_complaint()
returns trigger language plpgsql security definer as $$
declare
  complaint_count int;
  total_complaints int;
  punishment_pool text[];
  chosen_punishment text;
begin
  select count(*) into total_complaints
  from complaints
  where group_id = new.group_id and filed_against = new.filed_against;

  if total_complaints % 3 = 0 then
    insert into strikes (group_id, user_id, strike_count)
    values (new.group_id, new.filed_against, 1)
    on conflict (group_id, user_id)
    do update set strike_count = strikes.strike_count + 1;

    select array_agg(description) into punishment_pool
    from group_punishments
    where group_id = new.group_id;

    if punishment_pool is null or array_length(punishment_pool, 1) = 0 then
      punishment_pool := array[
        'Clean the bathroom',
        'Take out trash for a week',
        'Do all dishes for 3 days',
        'Vacuum the whole place',
        'Clean the kitchen'
      ];
    end if;

    chosen_punishment := punishment_pool[1 + floor(random() * array_length(punishment_pool, 1))::int];

    insert into punishments (group_id, user_id, description)
    values (new.group_id, new.filed_against, chosen_punishment);
  end if;

  return new;
end;
$$;

create trigger on_new_complaint
  after insert on complaints
  for each row execute procedure handle_new_complaint();
```

---

## ROW LEVEL SECURITY (RLS)

Enable RLS on all tables:
```sql
alter table profiles           enable row level security;
alter table groups             enable row level security;
alter table chores             enable row level security;
alter table messages           enable row level security;
alter table bills              enable row level security;
alter table bill_splits        enable row level security;
alter table complaints         enable row level security;
alter table strikes            enable row level security;
alter table punishments        enable row level security;
alter table group_punishments  enable row level security;
```

### profiles policies
```sql
create policy "Users can view profiles in their group"
  on profiles for select
  using (
    group_id = (select group_id from profiles where id = auth.uid())
    or id = auth.uid()
  );

create policy "Users can update their own profile"
  on profiles for update
  using (id = auth.uid());
```

### groups policies
```sql
create policy "Users can view their own group"
  on groups for select
  using (id = (select group_id from profiles where id = auth.uid()));

create policy "Authenticated users can create groups"
  on groups for insert
  with check (auth.role() = 'authenticated');

create policy "Group creator can update group"
  on groups for update
  using (created_by = auth.uid());
```

### chores policies
```sql
create policy "Group members can view chores"
  on chores for select
  using (group_id = (select group_id from profiles where id = auth.uid()));

create policy "Group members can insert chores"
  on chores for insert
  with check (group_id = (select group_id from profiles where id = auth.uid()));

create policy "Group members can update chores"
  on chores for update
  using (group_id = (select group_id from profiles where id = auth.uid()));

create policy "Group members can delete chores"
  on chores for delete
  using (group_id = (select group_id from profiles where id = auth.uid()));
```

### messages policies
```sql
create policy "Group members can view messages"
  on messages for select
  using (group_id = (select group_id from profiles where id = auth.uid()));

create policy "Group members can send messages"
  on messages for insert
  with check (
    group_id = (select group_id from profiles where id = auth.uid())
    and sender_id = auth.uid()
  );
```

### bills policies
```sql
create policy "Group members can view bills"
  on bills for select
  using (group_id = (select group_id from profiles where id = auth.uid()));

create policy "Group members can insert bills"
  on bills for insert
  with check (group_id = (select group_id from profiles where id = auth.uid()));

create policy "Bill creator can update bill"
  on bills for update
  using (paid_by = auth.uid());

create policy "Bill creator can delete bill"
  on bills for delete
  using (paid_by = auth.uid());
```

### bill_splits policies
```sql
create policy "Group members can view splits"
  on bill_splits for select
  using (
    bill_id in (
      select id from bills
      where group_id = (select group_id from profiles where id = auth.uid())
    )
  );

create policy "Group members can insert splits"
  on bill_splits for insert
  with check (
    bill_id in (
      select id from bills
      where group_id = (select group_id from profiles where id = auth.uid())
    )
  );

create policy "Users can mark their own splits as paid"
  on bill_splits for update
  using (user_id = auth.uid());
```

### complaints policies
```sql
create policy "Group members can view complaints"
  on complaints for select
  using (group_id = (select group_id from profiles where id = auth.uid()));

create policy "Group members can file complaints"
  on complaints for insert
  with check (
    group_id = (select group_id from profiles where id = auth.uid())
    and filed_by = auth.uid()
  );
```

### strikes, punishments, group_punishments policies
```sql
create policy "Group members can view strikes"
  on strikes for select
  using (group_id = (select group_id from profiles where id = auth.uid()));

create policy "Group members can view punishments"
  on punishments for select
  using (group_id = (select group_id from profiles where id = auth.uid()));

create policy "Users can complete their own punishment"
  on punishments for update
  using (user_id = auth.uid());

create policy "Group members can view group punishments"
  on group_punishments for select
  using (group_id = (select group_id from profiles where id = auth.uid()));

create policy "Group members can add punishments"
  on group_punishments for insert
  with check (group_id = (select group_id from profiles where id = auth.uid()));
```

---

## SUPABASE STORAGE BUCKETS
Run in Supabase Storage settings or SQL:

```sql
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true);

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false);

create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Avatars are publicly viewable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can update their own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Group members can upload receipts"
  on storage.objects for insert
  with check (bucket_id = 'receipts' and auth.role() = 'authenticated');

create policy "Group members can view receipts"
  on storage.objects for select
  using (bucket_id = 'receipts' and auth.role() = 'authenticated');
```

---

## REALTIME
Enable realtime on the messages table in Supabase dashboard:
- Table Editor → messages → Enable Realtime
- Or via SQL:
```sql
alter publication supabase_realtime add table messages;
```

---

## NOTES
- Run tables in order: groups, profiles (with FK), then the rest
- The `handle_new_user` trigger fires automatically on every signup
- The `handle_new_complaint` trigger fires automatically and manages strikes + punishment assignment
- Invite codes: generate 6-char uppercase alphanumeric codes in the backend (not DB)

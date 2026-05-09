# Nestmates

Shared-living management for roommates: chores, bills, real-time chat, complaints with a strike system, and profiles.

Built with **React + Vite + TypeScript + Tailwind v4 + Zustand** on the frontend and **FastAPI + Python 3.11+** on the backend, backed by **Supabase** (Postgres + Auth + Realtime + Storage) with **Resend** for transactional email.

---

## Project layout

```
nestmates/
├── frontend/          React + Vite + Tailwind
│   ├── src/
│   │   ├── components/    AppShell, Sidebar, Modal, Toaster, ErrorBoundary, ...
│   │   ├── pages/         Login, Register, Dashboard, Chores, Bills, Chat, Complaints, Profile, ...
│   │   ├── stores/        Zustand stores (auth, toast)
│   │   └── lib/           Supabase client, axios instance, shared TS types
│   └── public/            Logo, square app icon, PWA manifest
└── backend/           FastAPI + Supabase
    ├── app/
    │   ├── routers/       One file per feature (auth, chores, bills, ...)
    │   ├── models/        Pydantic schemas
    │   ├── services/      Email (Resend), users (auth admin lookups)
    │   ├── dependencies.py  get_current_user (validates JWT via Supabase)
    │   ├── supabase_client.py  Service-role client
    │   └── main.py        App entry + CORS + router registration
    └── requirements.txt
```

---

## Prerequisites

- **Node 20+** and npm
- **Python 3.11+**
- A **Supabase** project (free tier works)
- A **Resend** API key (optional during development — emails are wired but no-op when the key is blank)

---

## 1. Database setup

Open your Supabase project's **SQL Editor** and run [DATABASE.md](DATABASE.md) end-to-end. Order matters: `groups` → `profiles` (with FK back to `groups`) → the rest, then triggers, RLS policies, storage buckets, and the `messages` realtime publication.

The most common setup error is the `handle_new_user` trigger failing on signup. If registration returns "Database error saving new user", run this patch in the SQL editor (it pins `search_path` and grants the auth admin the needed permissions):

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.handle_new_user() to supabase_auth_admin;
grant insert on public.profiles to supabase_auth_admin;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

---

## 2. Environment variables

### `frontend/.env`

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your_anon_key>
VITE_API_URL=http://localhost:8000
```

### `backend/.env`

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<your_anon_key>
SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>
RESEND_API_KEY=<optional_resend_key>
FROM_EMAIL=Nestmates <onboarding@resend.dev>
FRONTEND_URL=http://localhost:5173
```



---

## 3. Run locally

### Backend

```bash
cd backend
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
./venv/bin/uvicorn app.main:app --reload --port 8000
```

Health check: `GET http://localhost:8000/api/v1/health` → `{"status":"ok"}`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The router redirects `/` to `/login` if signed out, otherwise to `/dashboard`.

---

## 4. Feature tour

| Page | What it does |
|---|---|
| `/register`, `/login` | Email/password via Supabase Auth. Profile auto-created on signup by the `handle_new_user` trigger. |
| `/group/create`, `/group/join` | Create a household (gets a 6-char invite code) or join one with the code. Default punishments are seeded on creation. |
| `/dashboard` | Aggregate widgets: my chores, roommate chores, what I owe, owed to me, roommate status (with active-chore dot), strike summary. |
| `/chores` | Add/edit/delete chores, filter by All / Mine / Unassigned / Completed, "Assign Randomly" round-robin shuffle, mark complete. |
| `/chat` | Full-height bubble chat with day separators, Supabase Realtime subscription on `group:{groupId}`, optimistic dedupe by message id. |
| `/bills` | Even-split bills with member-checkbox selector, summary bar (you owe / owed to you), optional receipt upload (private bucket, signed URL on read), per-split mark-paid. |
| `/complaints` | File complaints (DB trigger handles strike accumulation and random punishment), strike tracker with ⚡ icons, active-punishment cards (mark complete by owner only), customizable punishment pool. |
| `/profile` | Inline-edit display name, click-to-change avatar with preview-before-save (public `avatars` bucket, cache-busted URL), household panel with copyable invite code. |

---

## 5. API surface

All endpoints under `/api/v1/`. Auth via `Authorization: Bearer <supabase_jwt>`. Response envelope: `{ data, error }`.

```
GET    /health                                    public

GET    /me                                        current profile
PATCH  /me                                        update display_name / avatar_url

POST   /auth/welcome                              trigger welcome email

POST   /groups                                    create household
POST   /groups/join                               join with invite code
GET    /groups/me                                 group + members

GET    /dashboard                                 aggregated widgets

GET    /chores
POST   /chores
PATCH  /chores/{id}
DELETE /chores/{id}
POST   /chores/assign-random
PATCH  /chores/{id}/complete

GET    /messages?limit=&before=                   paginated history
POST   /messages

GET    /bills
POST   /bills
PATCH  /bills/{id}
DELETE /bills/{id}
PATCH  /bills/{bill_id}/splits/{split_id}/pay
POST   /bills/{id}/receipt                        multipart upload

GET    /complaints
POST   /complaints                                trigger handles strike + punishment
GET    /strikes
GET    /punishments
PATCH  /punishments/{id}/complete
GET    /group-punishments
POST   /group-punishments
DELETE /group-punishments/{id}

POST   /profile/avatar                            multipart upload
```

---

## 6. Email

Wired through Resend in [`backend/app/services/email.py`](backend/app/services/email.py). All five templates from `RESEND.md` are implemented:

1. Welcome on registration (`POST /auth/welcome`)
2. Chore assigned (manual or random)
3. Bill added (notify split members)
4. Complaint filed (notify the target)
5. Strike + punishment assigned (fired when the DB trigger creates a punishment)

Sends are wrapped in try/except and skipped silently when `RESEND_API_KEY` is empty — emails never block the API.

---

## 7. Production deploy notes

- **Frontend**: Vercel (or any static host). Set the three `VITE_*` env vars at build time. SPA fallback to `index.html`.
- **Backend**: Railway, Render, or Fly. Run `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Add the prod backend URL to `app.add_middleware(CORSMiddleware, allow_origins=...)` (or override via the `FRONTEND_URL` env var).
- **Supabase**: nothing extra — RLS policies and service role keys carry over.
- **Resend**: verify your domain to send from a custom address; until then, use the sandbox sender `onboarding@resend.dev` for testing.
- **PWA**: a basic `manifest.webmanifest` + `apple-touch-icon` + theme color are in place, so the app can be added to home screens on mobile.

---

## 8. Useful scripts

```bash
# Frontend
npm run dev          # vite dev server
npm run build        # tsc -b && vite build
npm run preview      # serve the production build

# Backend
./venv/bin/uvicorn app.main:app --reload --port 8000
./venv/bin/python -c "from app.main import app; print(app.routes)"   # quick route dump
```

---

## Phases

The codebase was built in nine phases per `PHASE.md`:

```
0 Scaffold → 1 Auth → 2 Groups → 3 Dashboard → 4 Chores →
5 Messaging → 6 Bills → 7 Complaints → 8 Profile → 9 Polish
```

Each phase was scoped to be independently shippable.

# Task Board

A lightweight Kanban-style task manager inspired by Azure DevOps Boards. The project is split into two applications: a **FastAPI** backend with **MongoDB** (Motor) and a **React** (Vite + TypeScript) frontend. Together they support shared boards, roles, drag-and-drop, comments, activity history, in-app notifications, and optional live updates over WebSockets.

## Architecture

### Backend (`backend/`)

Layers follow **Routers → Services → Models → Database**:

| Layer | Responsibility |
|--------|------------------|
| `app/routers/` | HTTP routes, query/body binding, WebSocket entry |
| `app/services/` | Authorization, business rules, aggregation |
| `app/models/` | Pydantic schemas for validation and responses |
| `app/db/` | Motor client lifecycle |

**Collections:** `users`, `boards`, `columns`, `tasks`, `labels`, `comments`, `activity_logs`, `notifications`.

**Concurrency:** Last-write-wins on task and column updates; clients refresh after mutations and on WebSocket `tasks_changed` / `columns_changed` / `labels_changed` events.

**Auth:** JWT bearer tokens (`Authorization: Bearer <token>`).

### Frontend (`frontend/`)

React function components with hooks. **Tailwind CSS v4** (with `@tailwindcss/vite`) is used for layout and styling. Data access is centralized in `src/api.ts`. The board uses **@dnd-kit** (`@dnd-kit/core`, `@dnd-kit/sortable`) for drag-and-drop: tasks are moved via the **⋮⋮** handle (smoother than dragging the whole card), with a **DragOverlay** preview. Search, filters, and non-default sort temporarily disable dragging so ordering stays consistent with the server.

## Prerequisites

- Python 3.11+
- Node.js 20+
- A [MongoDB Atlas](https://www.mongodb.com/atlas) cluster (or local MongoDB) and connection string

## Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env: set MONGODB_URI, JWT_SECRET, CORS_ORIGINS (comma-separated origins)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- API base: `http://127.0.0.1:8000/api/v1`
- Health: `GET /health`
- WebSocket: `ws://127.0.0.1:8000/ws/boards/{board_id}?token=<JWT>`

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Vite proxies **`/api`** to `http://127.0.0.1:8000` during development. **WebSockets** connect **directly** to `ws://127.0.0.1:8000` in dev (see `wsBoardUrl` in `src/api.ts`) so you avoid flaky Vite `ws proxy` / `ECONNRESET` noise. Ensure the backend is running before opening a board.

For production or a remote API, set `VITE_API_URL` (e.g. `https://api.example.com`) so the client calls and WebSocket host match your deployment.

## Neural assist (AI)

Optional **Google Gemini** integration (Generative Language API + API key) powers polish, title ideas, board briefs, and a **Copilot** chat. Without `GOOGLE_API_KEY`, the API returns **demo mode** responses (structured heuristics) so the UI still works.

Set in `backend/.env`:

- `GOOGLE_API_KEY` — from [Google AI Studio](https://aistudio.google.com/apikey) (or a Cloud API key with Generative Language API enabled)  
- `GEMINI_MODEL` — optional, default `gemini-2.5-flash` (set explicitly if Google deprecates or renames models for your key)

Endpoints: `POST /api/v1/ai/polish`, `/title-ideas`, `/board-brief`, `/chat` (all require JWT).

On the board, use the **✦** floating button or **✦ Neural** on a task to open the panel.

## Features (checklist)

- Boards with default columns: Backlog, In Progress, Review, Done; admins can add, rename, delete, and reorder columns (order persisted).
- Tasks: title, description, status (column), priority, due date, created/updated timestamps; order within columns; drag-and-drop across columns (when no active search/filter/sort).
- Task side panel: inline edits, metadata, labels, assignee search, comments, per-task activity.
- Search (title/description), filters (priority, column, assignee, label), sort (due date / priority).
- Assignees with initials; labels with colors; comments; board and task activity logs.
- Notifications for assignment-related changes; polling for unread list; mark read / mark all read.
- Shared boards: invite by email or username; roles **admin** (structure + members) and **member** (tasks).
- WebSocket: broadcast on task/column/label changes; **presence** list (connected users on the board).
- Optional niceties: JWT auth, dark mode (toggle on dashboard; theme key `taskboard_theme`), JSON export, simple analytics (tasks per column).

## Default workflow

1. Register and sign in.
2. Create a board (columns are created automatically).
3. Add tasks, optionally labels (`+ Label`), invite teammates (**Invite**).
4. Open **Analytics** or **Export JSON** from the board header as needed.

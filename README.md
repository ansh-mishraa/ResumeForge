# ResumeForge

ATS-first resume tailor: upload or store a master resume, paste a job description, answer skill-gap questions, get **single-page LaTeX** (copy to Overleaf) plus optional **PDF download**.

## Why this design

Research across open-source tailor tools (agent playbooks, LangGraph pipelines, EigenCV-style master profiles) converges on the same rules that matter for job seekers:

1. **Master profile as source of truth** — never invent experience.
2. **Fit gate before writing** — deny roles that are fundamentally mismatched.
3. **Clarify gaps** — ask about JD skills missing from the resume; honor yes/no.
4. **Keyword-honest rewrite** — mirror JD language only where verified.
5. **LaTeX + compile loop** — enforce one page by spacing first, then content trim; expand slightly if the page is sparse.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite + TypeScript |
| API | Node.js + Express + TypeScript |
| DB | SQLite locally (Prisma); PostgreSQL via Docker when you want it |
| AI | Multi-step OpenAI agents (analyze → fit → clarify → tailor → ATS score) |
| PDF | `tectonic` or `pdflatex` (optional; Overleaf always works from `.tex`) |

## Quick start

## Auth

Register / login at `/login`. JWT is stored in an httpOnly cookie and also returned for Bearer auth.

- Profiles and tailor sessions are scoped to `userId`
- `GET /api/tailor/sessions` lists **your** history only
- The **first** account you create claims any pre-auth local data so old sessions remain available

Set `JWT_SECRET` in `backend/.env` for production.

You cannot pipe the IDE “Auto” chat into the app directly. Use a **Cursor API key** from your Pro account — usage bills against your Cursor plan.

1. Create a key at [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations) (or [API Keys](https://cursor.com/dashboard/api))
2. Put it in `backend/.env`:

```bash
cd backend
copy .env.example .env   # Windows
```

```env
AI_PROVIDER=cursor
CURSOR_API_KEY=cursor_...   # your key
CURSOR_MODEL=auto           # same Auto routing idea as the IDE
```

Optional OpenAI fallback: set `OPENAI_API_KEY` and `AI_PROVIDER=openai`.

### 2. Database

SQLite is already configured (`DATABASE_URL="file:./dev.db"`).

```bash
cd backend
npm install
npx prisma db push
```

Optional PostgreSQL:

```bash
docker compose up -d
# In backend/.env set:
# DATABASE_URL="postgresql://resume:resume@localhost:5432/resume_tailor?schema=public"
# Switch prisma/schema.prisma provider to "postgresql" and Json fields, then prisma db push
```

### 3. Run

```bash
# terminal 1
cd backend
npm run dev

# terminal 2
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

### 4. PDF downloads (optional)

Install [Tectonic](https://tectonic-typesetting.github.io/) or TeX Live (`pdflatex`). Without it, use **Copy LaTeX → Overleaf → PDF**.

## Product flow

```
Master resume → structured profile (stored)
        ↓
Job description → JD analysis (keywords, must-haves)
        ↓
Fit assessment → DENY if mismatch is severe
        ↓
Clarifying questions for unverified skills
        ↓
Tailor bullets / skills / summary with JD language
        ↓
Render LaTeX → compile → single-page optimize → ATS score
        ↓
Copy LaTeX / Download .tex / Download PDF
```

## API

- `POST /api/profiles/text` — parse & store resume text
- `POST /api/profiles/upload` — PDF/DOCX/TXT upload
- `GET /api/profiles` — list stored profiles
- `POST /api/tailor/sessions` — start analyze + fit + questions
- `POST /api/tailor/sessions/:id/answers` — continue to tailor
- `GET /api/tailor/sessions/:id` — session state
- `GET /api/tailor/sessions/:id/latex` — download `.tex`
- `GET /api/tailor/sessions/:id/pdf` — download PDF (if compiled)

## Honesty guarantee

Confirmed skills may appear. Denied skills never appear. Metrics and employers are only taken from your master profile or your answers — not hallucinated to chase a fake “100% ATS” score.

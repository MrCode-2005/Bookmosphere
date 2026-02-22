# 📚 Bookmosphere — Immersive Flipbook Reading Platform

A premium, full-stack reading platform built with **Next.js 15**, featuring a realistic flipbook reader engine, reading analytics, full-text search, and a dark-themed dashboard.

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Flipbook Reader** | Page-turn animations with customizable speed, shadow, and sound effects |
| **Book Upload** | PDF, EPUB, DOCX, TXT — processed and paginated server-side |
| **Reading Progress** | Auto-saved progress, bookmarks, and page-by-page tracking |
| **Analytics Dashboard** | Area/bar charts (Recharts), GitHub-style heatmap, reading streaks |
| **Multi-Source Search** | Internal library + Google Books + OpenLibrary APIs |
| **Theme Customization** | Dark/Light/Sepia modes, accent colors, typography, reader settings |
| **Admin Panel** | User management, upload moderation, system stats |
| **Security** | JWT auth, rate limiting, security headers, file validation with magic bytes |
| **Responsive Design** | Mobile-first, dark-themed UI with smooth animations |

## 🛠 Tech Stack

- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS, Recharts
- **Backend:** Next.js API Routes, Prisma ORM
- **Database:** PostgreSQL
- **Auth:** JWT (access + refresh tokens), bcrypt, HTTP-only cookies
- **Storage:** AWS S3 (book files), local filesystem fallback
- **State:** Zustand (auth, theme, reader stores)
- **Deployment:** Docker, docker-compose

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL
- npm

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your database URL, JWT secrets, S3 credentials

# 3. Initialize database
npx prisma generate
npx prisma db push

# 4. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Docker Deployment

```bash
docker-compose up -d
```

This starts PostgreSQL, Redis, and the app in production mode.

## 📁 Project Structure

```
src/
├── app/
│   ├── (auth)/          # Login, Register pages
│   ├── (dashboard)/     # Dashboard, Library, Analytics, Search, Settings
│   ├── admin/           # Admin panel (role-protected)
│   ├── reader/          # Flipbook reader page
│   └── api/             # API routes (auth, books, sessions, search, etc.)
├── components/          # Shared UI components
├── hooks/               # Custom React hooks
├── lib/                 # Server utilities (auth, prisma, s3, validators)
├── stores/              # Zustand state stores
└── types/               # TypeScript type definitions
```

## 🔐 Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | JWT signing secret (min 32 chars) |
| `JWT_REFRESH_SECRET` | Refresh token signing secret |
| `AWS_ACCESS_KEY_ID` | S3 access key |
| `AWS_SECRET_ACCESS_KEY` | S3 secret key |
| `AWS_S3_BUCKET` | S3 bucket name |
| `AWS_REGION` | S3 region |
| `GOOGLE_BOOKS_API_KEY` | Google Books API key (optional) |

## 📄 License

MIT

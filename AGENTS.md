# Consignment Packing App — Agent Guide

This document is written for AI coding agents. It assumes zero prior knowledge of the project.

---

## Project Overview

The **Consignment Packing App** is a full-stack web application for managing consignment packing operations. It is built for VB Exports internal use and is private/proprietary software.

**Core capabilities:**
- Secure JWT-based login with role-based access control
- Consignment CRUD with SKU (Stock Keeping Unit) management
- Barcode-driven packing station with in-memory sessions
- Export consignments table to CSV
- Admin data retention settings (auto-cleanup old consignments & videos)
- Video retention protection when marketplaceTicketId is set
- File uploads (videos, documents) per consignment via Firebase Storage
- Productivity dashboard with audit logging
- Marketplace management
- User management with granular permissions

**Tech stack summary:**

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 8, Tailwind CSS v4, Firebase JS SDK 12 |
| Backend | Node.js, Express 4, Firebase Admin SDK 12 |
| Database | Firebase Firestore (with in-memory fallback) |
| Storage | Firebase Storage |
| Auth | JWT (`jsonwebtoken`) + bcrypt |
| Hosting | Firebase Hosting (frontend) OR single-container Cloud Run (full-stack) |

---

## Repository Structure

```
consignment-packing-app/
├── backend/              # Node.js + Express API
│   ├── server.js         # Entry point; Express app setup, routes, middleware
│   ├── config/
│   │   └── firebase.js   # Firebase Admin SDK initialization + credential loading
│   ├── middleware/
│   │   └── auth.js       # JWT verification, default user, role guards
│   ├── routes/           # Express route modules (one per domain)
│   │   ├── auth.js
│   │   ├── consignments.js
│   │   ├── settings.js
│   │   ├── uploads.js
│   │   ├── productivity.js
│   │   ├── templates.js
│   │   ├── packing.js
│   │   ├── marketplaces.js
│   │   ├── users.js
│   │   └── auditLogs.js
│   ├── utils/
│   │   └── helpers.js    # Firestore abstraction, memory fallback, audit log helper
│   ├── scripts/
│   │   └── cleanup.js    # One-off script to delete test consignments from Firestore
│   ├── .env              # Backend environment variables (sensitive, never commit)
│   ├── .env.example      # Template for backend env
│   └── serviceAccountKey.json   # Firebase service account (REPLACE in production)
│
├── frontend/             # React + Vite SPA
│   ├── index.html
│   ├── vite.config.js    # Vite config with Tailwind plugin + dev proxy (/api → localhost:5000)
│   ├── eslint.config.js  # ESLint flat config (recommended + react-hooks + react-refresh)
│   ├── package.json
│   ├── .env              # Frontend env vars (VITE_* Firebase web config)
│   ├── public/
│   │   ├── favicon.svg
│   │   └── icons.svg
│   └── src/
│       ├── main.jsx      # ReactDOM root render
│       ├── App.jsx       # BrowserRouter, route definitions, PrivateRoute/PublicRoute
│       ├── index.css     # Tailwind import + custom theme colors + animations
│       ├── App.css       # (minimal, most styling is Tailwind)
│       ├── config/
│       │   └── firebase.js   # Frontend Firebase SDK initialization
│       ├── context/
│       │   ├── AuthContext.jsx   # useAuth hook, login/logout, localStorage token
│       │   └── ToastContext.jsx  # useToast hook, toast notifications UI
│       ├── components/
│       │   ├── Layout.jsx    # Sidebar + Outlet wrapper (fixed 256px sidebar)
│       │   └── Sidebar.jsx   # Navigation links with permission-based filtering
│       ├── hooks/
│       │   ├── useDebounce.js       # Standard debounce hook
│       │   └── useFirebaseUpload.js # Firebase Storage upload with progress
│       ├── pages/
│       │   ├── Login.jsx
│       │   ├── Dashboard.jsx
│       │   ├── Consignments.jsx
│       │   ├── ConsignmentDetail.jsx
│       │   ├── Settings.jsx
│       │   ├── PackingStation.jsx
│       │   ├── Productivity.jsx
│       │   ├── Marketplaces.jsx
│       │   ├── Users.jsx
│       │   └── AuditLogs.jsx
│       ├── services/
│       │   └── api.js      # Axios instance + API modules (auth, consignments, settings, etc.)
│       └── assets/
│           └── (images, SVGs)
│
├── firebase.json         # Firebase Hosting config (public: frontend/dist, SPA rewrite)
├── .firebaserc           # Firebase project selector
├── package.json          # Root orchestrator (scripts for install:all, dev, build, deploy)
├── README.md             # Human-facing quick start
├── DEPLOYMENT.md         # Detailed deployment instructions
├── setup.bat             # Windows batch: install all deps
├── run.bat               # Windows batch: start backend + frontend dev servers
├── build.bat             # Windows batch: production frontend build
└── start.bat             # Windows batch: start production server
```

---

## Build and Run Commands

### Prerequisites
- Node.js 18+
- npm

### Install all dependencies
```bash
npm run install:all
```
This runs `npm install` in root, then `backend/`, then `frontend/`.

### Development (both backend + frontend)
```bash
npm run dev
```
- Backend runs on `http://localhost:5000`
- Frontend runs on `http://localhost:5173`
- Vite dev proxy forwards `/api` calls to port 5000 automatically.

### Frontend only
```bash
npm run dev:frontend   # cd frontend && npm run dev
```

### Backend only
```bash
npm run dev:backend    # cd backend && npm run dev (nodemon)
```

### Production build (frontend)
```bash
npm run build          # cd frontend && vite build → outputs to frontend/dist
```

### Production start (backend serves static frontend)
```bash
npm start              # cd backend && node server.js (requires frontend/dist)
```
Or use `start.bat` on Windows.

### Deploy
```bash
npm run deploy         # npm run build + firebase deploy --only hosting
npm run deploy:backend # gcloud run deploy (see DEPLOYMENT.md)
```

---

## Environment Variables

### Frontend (`frontend/.env`)
All prefixed with `VITE_` so they are exposed to the client.

| Variable | Source |
|----------|--------|
| `VITE_FIREBASE_API_KEY` | Firebase Console > Project Settings > Web App |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Console > Project Settings > Web App |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Console > General |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Console > Storage |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Console > Web App |
| `VITE_FIREBASE_APP_ID` | Firebase Console > Web App |
| `VITE_API_URL` | Backend URL in production (optional; defaults to same origin) |

### Backend (`backend/.env`)
| Variable | Purpose |
|----------|---------|
| `PORT` | Server port (default: 5000) |
| `NODE_ENV` | `development` or `production` |
| `JWT_SECRET` | Strong random string for signing JWTs |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins (optional; defaults based on NODE_ENV) |

---

## Architecture Details

### Backend Design

**Entry point:** `backend/server.js`
- Initializes Express with `helmet`, `compression`, `cors`
- JSON body parser with 50MB limit
- Static file serving for `/uploads`
- Mounts all `/api/*` routes
- Health check at `GET /api/health`
- In production (`NODE_ENV=production`), serves `frontend/dist` and handles SPA catch-all
- Global error handler (hides details in production)

**Firebase initialization (`backend/config/firebase.js`):**
- Attempts to load service account credentials in this priority:
  1. `GOOGLE_APPLICATION_CREDENTIALS` env var
  2. `backend/serviceAccountKey.json`
  3. GCP environment auto-detection (`K_SERVICE`, `GOOGLE_CLOUD_PROJECT`)
  4. Firestore emulator (`FIRESTORE_EMULATOR_HOST`)
- If no credentials are found, it logs a warning and runs in **local-only mode** (using in-memory stores).
- Exports: `{ admin, db, bucket, firebaseInitialized }`

**Firestore abstraction (`backend/utils/helpers.js`):**
- Every Firestore operation has a built-in fallback to an in-memory `Map` store.
- This means the backend **runs and functions locally even without Firebase credentials**.
- Helpers provided: `getCollection`, `getDocument`, `setDocument`, `deleteDocument`, `queryCollection`, `batchSet`, `batchDelete`.
- `addAuditLog(action, entityType, entityId, userId, details)` writes to Firestore or memory.

**Authentication (`backend/middleware/auth.js`):**
- `authenticateToken` — verifies `Authorization: Bearer <token>` JWT.
- `requireRole(...roles)` — middleware to restrict routes by role.
- `DEFAULT_USER` — hardcoded admin for initial access:
  - Email: `returnorders@vbexports.co.in`
  - Password: `XchangeC$`
  - Role: `admin`
- JWT expires in 24 hours.

**Route modules:**
Each file in `backend/routes/` is a standard Express `Router()` exported as `module.exports = router`.

| Route File | Base Path | Key Features |
|------------|-----------|--------------|
| `auth.js` | `/api/auth` | Login, `/me` token refresh |
| `consignments.js` | `/api/consignments` | CRUD, pack SKU, save box |
| `settings.js` | `/api/settings` | Admin-only: retention config, manual cleanup trigger |
| `uploads.js` | `/api/uploads` | File metadata, direct upload (multer), Firebase Storage integration |
| `productivity.js` | `/api/productivity` | Log events, stats, audit logs |
| `templates.js` | `/api/templates` | Download CSV templates |
| `packing.js` | `/api/packing` | **In-memory session-based packing station** (load, increment, decrement, save box, finish) |
| `marketplaces.js` | `/api/marketplaces` | Marketplace CRUD |
| `users.js` | `/api/users` | User CRUD, change password (admin only) |
| `auditLogs.js` | `/api/audit-logs` | Filterable audit logs (admin only), my-activity |

**Packing station sessions:**
- `packing.js` maintains a global `MEM` object mapping `consignment_id` to session state.
- Sessions are lost on server restart. They are meant for active packing workflows.
- When a box is saved, data is persisted to Firestore (`boxes`, `skus`, `consignments` collections).

### Frontend Design

**Entry point:** `frontend/src/main.jsx` → renders `<App />` inside `React.StrictMode`.

**Routing (`frontend/src/App.jsx`):**
- `BrowserRouter` with nested routes.
- `/login` is a public route; all others are protected by `<PrivateRoute>`.
- Authenticated routes render inside `<Layout>` (sidebar + main content area).
- `/packing` is a dedicated full-page route (no sidebar) for the packing station.

**State management:**
- No Redux or Zustand. Global state uses React Context:
  - `AuthContext` — token, user, login/logout, persistence in `localStorage`
  - `ToastContext` — global toast notifications

**Consignments list (`Consignments.jsx`):**
- Simplified columns (no PO Expiry, Appointment, Sch. Dispatch, QA Fail in list view)
- Inline row-expansion editing: click pencil → expandable edit row below with all tracking fields
- Export to CSV button

**Packing Station (`PackingStation.jsx`):**
- Full-screen standalone route (`/packing`) with standard Tailwind light theme
- Collapsible sidebar is hidden; Back button returns to Consignments
- Modal dialogs (duplicate box, finish, resume) use light theme
- Auto-records packing videos with timestamp overlay
- Videos queue to IndexedDB and auto-upload when online

**API layer (`frontend/src/services/api.js`):**
- Single Axios instance with base URL `/api`.
- Request interceptor injects `Authorization: Bearer <token>` from `localStorage`.
- Response interceptor catches 401, clears token, and redirects to `/login`.
- All API calls are grouped into named objects (`authAPI`, `consignmentsAPI`, etc.).

**Styling:**
- Tailwind CSS v4 with `@import "tailwindcss"` in `index.css`.
- Custom theme colors under `@theme`:
  - `primary-50` through `primary-900` (blue palette)
  - `sidebar-bg`, `sidebar-text`, `sidebar-active` (dark sidebar)
- Custom animations: `animate-fade-in`, `animate-slide-in`
- Global scrollbar styling in `index.css`
- Font: Inter / system-ui stack

**Icons:** `lucide-react` exclusively. No FontAwesome or other icon libraries.

**Firebase on frontend:**
- `frontend/src/config/firebase.js` initializes the Firebase client SDK with `VITE_*` env vars.
- Used for direct-to-Storage file uploads (`useFirebaseUpload.js`).

---

## Code Style Guidelines

- **Language:** All code, comments, and documentation are in English.
- **Backend (Node.js):**
  - Use semicolons.
  - `const` / `let` (no `var`).
  - `async/await` for asynchronous code.
  - `try/catch` blocks in route handlers with `console.error` logging.
  - Error responses: `res.status(XXX).json({ error: 'message' })`.
  - Export routers with `module.exports = router;`.
- **Frontend (React):**
  - Functional components with hooks.
  - No semicolons in frontend source (follow existing style).
  - Single quotes for JS strings; double quotes inside JSX attributes where needed.
  - PascalCase for components; camelCase for hooks, functions, variables.
  - Tailwind utility classes directly on elements.
  - Use `lucide-react` icons only.
- **Formatting:** No Prettier config found. Follow existing indentation (2 spaces).

---

## Testing Strategy

**There is currently no test suite in this project.**

No unit tests, integration tests, or end-to-end tests exist.
If you add tests, prefer:
- **Backend:** Jest + Supertest for API route testing
- **Frontend:** Vitest (already bundled with Vite) + React Testing Library

---

## Data Retention

The app includes an **admin-configurable retention policy** (`Settings` page):

| Data Type | Default Retention | Rule |
|-----------|------------------|------|
| Consignments + SKUs + Boxes + Documents | 450 days from `createdAt` | Deleted by scheduled cleanup |
| Videos | 60 days from `dateOfInward` | Deleted by scheduled cleanup |
| Videos (protected) | Infinite | **Never deleted** if consignment `marketplaceTicketId` is set |

- Cleanup script: `backend/scripts/retentionCleanup.js`
- API trigger: `POST /api/settings/cleanup` (admin only)
- Settings stored in Firestore `settings/retention` document

## Security Considerations

- **Default hardcoded credentials:** The `DEFAULT_USER` in `backend/middleware/auth.js` is convenient for first-time setup but must be removed or changed in production deployments.
- **JWT secret:** `backend/.env` must contain a strong, unique `JWT_SECRET`. The fallback secret in code is for development only.
- **Service account key:** `backend/serviceAccountKey.json` contains sensitive credentials. It is already gitignored but verify before committing.
- **CORS:** `backend/server.js` configures CORS from `ALLOWED_ORIGINS` env var in production. Update this after deployment.
- **Helmet:** Enabled for security headers.
- **File uploads:** Multer stores files temporarily in `backend/uploads/` before uploading to Firebase Storage. Max file size: 500MB.
- **Input validation:** `express-validator` can be extended to routes as needed.
- **Role-based access:** `requireRole('admin')` guards sensitive endpoints (users, audit logs).
- **Permission-based UI:** The frontend sidebar filters navigation items based on `user.permissions`.

---

## Deployment Notes

See `DEPLOYMENT.md` for step-by-step instructions. High-level:

1. **Frontend:** Build → `frontend/dist` → Firebase Hosting (`firebase deploy --only hosting`).
2. **Backend:** Options include self-hosted VPS, Docker, or Google Cloud Run (`npm run deploy:backend`).
3. **Post-deployment:** Update `ALLOWED_ORIGINS` in backend env and `VITE_API_URL` in frontend env to match production URLs.
4. **Firebase config:** Both frontend and backend require valid Firebase credentials to use cloud features. Without them, the app runs in local-only mode.

---

## Common Pitfalls for Agents

1. **Firebase not initialized:** If Firebase credentials are missing, the backend silently falls back to in-memory storage. Data will not persist across restarts. Check server logs for `[Firebase] Initialized successfully` or `[Firebase] No valid credentials found`.
2. **Frontend proxy only works in dev:** In production, the backend must serve `frontend/dist` or the frontend must call the backend directly via `VITE_API_URL`.
3. **Packing sessions are ephemeral:** `packing.js` uses a global `MEM` object. Server restarts lose active sessions. Boxes already saved to Firestore are safe.
4. **File uploads have two paths:**
   - **Preferred:** Frontend uploads directly to Firebase Storage via `useFirebaseUpload.js`, then calls `POST /api/uploads/metadata` to save metadata.
   - **Legacy:** Direct multipart upload to `POST /api/uploads` (multer + backend-to-Storage upload).
5. **No migrations or schema:** Firestore is schemaless. Data shape is defined by the route handlers and `utils/helpers.js`.

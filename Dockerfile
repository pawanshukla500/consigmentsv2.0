# ═══════════════════════════════════════════════════════════════════════════
# Youthnic Packing Station — Cloud Run Production Dockerfile
# Single-container: React frontend built + served by Express backend
# Deployed at: https://consignment.youthnic.shop
# ═══════════════════════════════════════════════════════════════════════════

# ─── Stage 1: Build Frontend (Alpine is fine — no native modules) ────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci

# frontend/.env.production has VITE_FIREBASE_* and VITE_API_URL=''
COPY frontend/ ./
RUN npm run build

# ─── Stage 2: Production Backend (slim = Debian, required for Firebase gRPC) ─
# DO NOT use node:20-alpine here — Firebase Admin SDK uses gRPC which needs
# glibc (Debian/Ubuntu). Alpine uses musl libc and breaks native modules.
FROM node:20-slim AS production

WORKDIR /app/backend

# Install production dependencies
COPY backend/package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy backend source
COPY backend/ ./

# Copy built frontend static files
# server.js expects them at ../frontend/dist relative to __dirname
COPY --from=frontend-builder /app/frontend/dist ../frontend/dist

# Cloud Run auto-injects PORT=8080
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server.js"]

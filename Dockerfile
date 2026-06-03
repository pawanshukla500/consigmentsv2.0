# ═══════════════════════════════════════════════════════════════════════════
# Youthnic Packing Station — Cloud Run Production Dockerfile
# Single-container: React frontend built + served by Express backend
# Deployed at: https://consignment.youthnic.shop
# ═══════════════════════════════════════════════════════════════════════════

# ─── Stage 1: Build Frontend ────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Install deps first (better layer caching)
COPY frontend/package*.json ./
RUN npm ci

# Copy source — frontend/.env.production is included here.
# It contains VITE_* Firebase Web SDK config (public keys, safe to bundle).
# VITE_API_URL='' so frontend uses relative /api paths on same origin.
COPY frontend/ ./

# Vite reads .env.production automatically when building
RUN npm run build

# ─── Stage 2: Production Backend ────────────────────────────────────────────
FROM node:20-alpine AS production

# Security: run as non-root
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup

WORKDIR /app/backend

# Install production dependencies only
COPY backend/package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy backend source
COPY backend/ ./

# Copy built frontend static files
# server.js expects them at ../frontend/dist relative to __dirname (backend/)
COPY --from=frontend-builder /app/frontend/dist ../frontend/dist

# ── Runtime configuration ────────────────────────────────────────────────────
# Cloud Run injects PORT=8080 automatically.
# NODE_ENV=production enables:
#   - frontend static file serving from Express
#   - production CORS origins
#   - production error messages
ENV NODE_ENV=production
ENV PORT=8080

# Firebase Admin SDK on Cloud Run uses Application Default Credentials (ADC)
# automatically — NO service account JSON file needed in production.
# The Cloud Run service account must have these IAM roles:
#   - roles/datastore.user          (Firestore read/write)
#   - roles/firebase.sdkAdminServiceAgent  (Firebase Admin)
#   - roles/storage.objectAdmin     (Firebase Storage)

EXPOSE 8080

# Non-root user for security
USER appuser

CMD ["node", "server.js"]

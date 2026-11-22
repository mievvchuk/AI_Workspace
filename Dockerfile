# One service: FastAPI serves the API and the built frontend from the same origin.

FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ENVIRONMENT=production \
    COOKIE_SECURE=true \
    STATIC_DIR=/app/static \
    DATABASE_URL=sqlite+aiosqlite:////var/data/workspace.db \
    UPLOAD_DIR=/var/data/uploads
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=web /web/dist ./static
# /var/data is the persistent disk on Render; created here so the image also runs without one.
RUN mkdir -p /var/data/uploads
EXPOSE 10000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000} --proxy-headers --forwarded-allow-ips='*'"]

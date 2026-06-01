# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Install frontend deps & build
COPY frontend/package*.json frontend/
RUN cd frontend && npm install
COPY frontend/ frontend/
RUN cd frontend && npm run build

# Backend deps
COPY backend/package*.json backend/
RUN cd backend && npm install --omit=dev

# Runtime stage
FROM node:20-alpine
WORKDIR /app

# Copy built frontend
COPY --from=builder /app/frontend/dist /app/frontend/dist

# Copy backend
COPY --from=builder /app/backend/node_modules /app/backend/node_modules
COPY backend/ /app/backend/

# Volume for persistent DB
VOLUME /app/backend/data

EXPOSE 3000

CMD ["node", "backend/server.js"]
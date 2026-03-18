# Stage 1: Build frontend
FROM node:18-alpine AS frontend-build

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: Backend with frontend dist baked in
FROM node:18-alpine

RUN apk add --no-cache git docker-cli docker-cli-compose

WORKDIR /app

COPY backend/package*.json ./
RUN npm install --production

COPY backend/src/ ./src/
COPY --from=frontend-build /frontend/dist ./public/

RUN mkdir -p /app/data

EXPOSE 3001

CMD ["node", "src/index.js"]

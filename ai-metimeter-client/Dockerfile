# Stage 1: Build
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Runtime (Node SSR)
FROM node:22-alpine AS runtime
WORKDIR /app

# Copy built app and only production deps
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY --from=build /app/package-lock.json ./
RUN npm ci --omit=dev

ENV PORT=4000
ENV API_URL=http://localhost:3000
ENV REPORTS_API_URL=http://localhost:5082
ENV ATTEMPT_API_URL=http://localhost:5136
EXPOSE 4000
CMD ["node", "dist/ai-quick-analysis/server/server.mjs"]

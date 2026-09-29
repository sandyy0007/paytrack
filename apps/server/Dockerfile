# Multi-stage production build for PayTrack API
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server
RUN npm install --workspace @paytrack/server --include-workspace-root=false --no-audit --no-fund \
 && npm run build -w @paytrack/server

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
# Only production dependencies required by externalized modules in esbuild
RUN echo '{"name":"paytrack-server-runtime","type":"module"}' > package.json && \
    npm install --omit=dev --no-audit --no-fund --ignore-scripts \
      bcryptjs@^3.0.2 cors@^2.8.5 express@^5.1.0 express-rate-limit@^8.1.0 helmet@^8.1.0 jsonwebtoken@^9.0.2 pg@^8.16.3 zod@^4.1.11
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/apps/server/migrations ./migrations
USER node
EXPOSE 4000
CMD ["node", "dist/index.js"]

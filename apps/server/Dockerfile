# Build from the monorepo root:  docker build -f apps/server/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json ./
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server
RUN npm install --workspace @paytrack/server --include-workspace-root=false --no-audit --no-fund \
 && npm run build -w @paytrack/server

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/apps/server/package.json ./
RUN npm install --omit=dev --no-audit --no-fund --ignore-scripts \
      bcryptjs cors express express-rate-limit helmet jsonwebtoken pg zod
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/apps/server/migrations ./migrations
USER node
EXPOSE 4000
CMD ["node", "dist/index.js"]

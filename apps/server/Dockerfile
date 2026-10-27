# Build from the repo root: docker build -f apps/server/Dockerfile .
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile
COPY packages/core packages/core
COPY apps/server apps/server
RUN pnpm --filter @run-coach/server build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PUBLIC_DIR=/app/public DATA_DIR=/data PORT=3020
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/server/public ./public
USER node
EXPOSE 3020
CMD ["node", "dist/index.js"]

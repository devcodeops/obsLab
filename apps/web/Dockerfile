FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/ apps/web/
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @obslab/web build

# --- Runtime ---
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/apps/web/dist ./dist
COPY apps/web/serve.js ./serve.js
EXPOSE 3000
CMD ["node", "serve.js"]

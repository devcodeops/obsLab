FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# --- Install + Build in one stage ---
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY apps/worker/ apps/worker/
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @obslab/shared build \
 && pnpm --filter @obslab/worker build

ENV NODE_ENV=production
EXPOSE 3011
CMD ["node", "apps/worker/dist/main.js"]

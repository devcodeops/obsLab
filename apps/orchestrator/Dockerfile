FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# --- Install + Build in one stage ---
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/db/ packages/db/
COPY apps/orchestrator/ apps/orchestrator/
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @obslab/shared build \
 && pnpm --filter @obslab/db prisma:generate \
 && pnpm --filter @obslab/db build \
 && pnpm --filter @obslab/orchestrator build

ENV NODE_ENV=production
EXPOSE 3001
CMD ["sh", "-c", "pnpm --filter @obslab/db prisma:deploy && node apps/orchestrator/dist/main.js"]

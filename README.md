# obsLab

Microservices chaos engineering laboratory. Simulate REST request workflows between services, inject controlled failures, and monitor execution in real time.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│  ┌──────────────┐   ┌──────────────────┐                │
│  │  web (nginx + │──▶│  orchestrator     │                │
│  │  React SPA)   │   │  (NestJS)         │                │
│  │  :3000        │   │  :3001            │                │
│  └──────────────┘   └───────┬──────────┘                │
│                              │                           │
│                    ┌─────────┼─────────┐                │
│                    ▼         ▼         ▼                │
│              ┌─────────┐ ┌────────┐ ┌────────┐         │
│              │ worker   │ │ worker │ │ worker │         │
│              │ "alpha"  │ │ "beta" │ │ "gamma"│         │
│              │ :3011    │ │ :3012  │ │ :3013  │         │
│              └─────────┘ └────────┘ └────────┘         │
│               (same binary, different SERVICE_NAME)      │
│                                                          │
│              ┌──────────┐                                │
│              │ PostgreSQL│                                │
│              │ :5432     │                                │
│              └──────────┘                                │
└─────────────────────────────────────────────────────────┘
```

### Services

| Service | Tech | Port | Role |
|---------|------|------|------|
| **web** | Vite + React + Tailwind + nginx | 3000 | Dashboard SPA + API reverse proxy |
| **orchestrator** | NestJS | 3001 | Control plane, run execution, DB |
| **worker** (svc-alpha) | NestJS | 3011 | Workflow router, calls beta/gamma |
| **worker** (svc-beta) | NestJS | 3012 | Leaf service |
| **worker** (svc-gamma) | NestJS | 3013 | Leaf service |
| **postgres** | PostgreSQL 16 | 5432 | Persistence |

### Key improvement over restLab

**3 Docker images instead of 5** — svc-alpha, svc-beta, and svc-gamma are the same binary (`apps/worker`) parameterized by `SERVICE_NAME`. No code duplication.

## Tech Stack

- **Runtime**: Node.js 22, pnpm 9.12
- **Language**: TypeScript 5.7
- **Backend**: NestJS 10
- **Frontend**: Vite 5, React 18, Tailwind CSS 3
- **Database**: PostgreSQL 16, Prisma 6
- **Containers**: Docker, Docker Compose

## Quick Start

### Docker (recommended)

```bash
cd obsLab
pnpm install
docker compose -f infra/docker-compose.yml up --build
```

### Development (hot reload)

```bash
# Start infrastructure
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up --build

# Or run locally without Docker (requires PostgreSQL running on localhost:5432):
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm dev
```

### URLs

| Service | URL |
|---------|-----|
| Dashboard | http://localhost:3000 |
| Orchestrator API | http://localhost:3001 |
| Swagger (orchestrator) | http://localhost:3001/docs |
| Swagger (svc-alpha) | http://localhost:3011/docs |
| Swagger (svc-beta) | http://localhost:3012/docs |
| Swagger (svc-gamma) | http://localhost:3013/docs |

## Usage

### 1. Create a run

Open the Dashboard and configure:
- **Workflow**: chain, fanout, fanout-fanin, or random
- **Iterations**: how many requests to execute (1–1000)
- **Concurrency**: parallel workers (1–100)
- **Payload size**: bytes per request (0–10240)
- **Client timeout**: max wait time per call in ms
- **Retry policy**: optional retries with backoff

### 2. Monitor execution

The runs table updates in real time via SSE. Click a run ID to see:
- Call graph (tree visualization)
- Individual calls with status, duration, error details
- Aggregate metrics (p50, p95 latency)

### 3. Inject chaos

Open the **Services** tab to configure chaos per service:

| Mode | Effect |
|------|--------|
| `normal` | Healthy responses |
| `forceStatus` | Always return a specific HTTP error code |
| `probabilisticError` | Random failures with configurable probability |
| `latency` | Add fixed or random latency |
| `timeout` | Probabilistic request timeouts |

### 4. Terminate services

Open the **SigKill** tab to send SIGTERM to any service and observe how the system reacts.

## Workflow Patterns

| Pattern | Description |
|---------|-------------|
| **chain** | alpha → beta → gamma (sequential) |
| **fanout** | alpha → beta + gamma (parallel) |
| **fanout-fanin** | alpha → beta + gamma → beta-join |
| **random** | alpha → 1-3 random calls to beta/gamma |

## Project Structure

```
obsLab/
├── apps/
│   ├── orchestrator/    # NestJS control plane (port 3001)
│   ├── worker/          # Unified NestJS worker (ports 3011-3013)
│   └── web/             # Vite + React SPA (port 3000)
├── packages/
│   ├── shared/          # @obslab/shared — types, logger, HTTP client, chaos
│   └── db/              # @obslab/db — Prisma client + schema
├── infra/
│   ├── docker-compose.yml
│   └── docker-compose.dev.yml
└── package.json         # Root workspace config
```

## Correlation Headers

All inter-service calls propagate:

| Header | Purpose |
|--------|---------|
| `x-request-id` | Unique trace ID per iteration |
| `x-run-id` | Run identifier |
| `x-call-id` | Individual call identifier |
| `x-parent-call-id` | Parent call for chain tracking |

Istio/OpenTelemetry headers (`traceparent`, `b3`, etc.) are also forwarded when present.

## Observability Readiness

The application is prepared for observability integration without implementing it:

- **Structured logging**: All services emit ECS-compatible JSON logs to stdout/stderr
- **Correlation**: Full distributed trace context propagation (B3, W3C traceparent)
- **Health checks**: Every service exposes `GET /health`
- **Metrics stub**: Orchestrator exposes `GET /metrics` ready for Prometheus instrumentation
- **Istio ready**: Service mesh header propagation built in

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | (required) | PostgreSQL connection string |
| `ORCHESTRATOR_PORT` | 3001 | Orchestrator listen port |
| `WORKER_PORT` | 3011 | Worker listen port |
| `SERVICE_NAME` | worker | Service identity |
| `SVC_ALPHA_URL` | http://svc-alpha:3011 | Alpha service URL |
| `SVC_BETA_URL` | http://svc-beta:3012 | Beta service URL |
| `SVC_GAMMA_URL` | http://svc-gamma:3013 | Gamma service URL |
| `ENABLE_SWAGGER` | true | Enable Swagger docs |

## Scripts

```bash
pnpm build          # Build all packages and apps
pnpm dev            # Start all services in dev mode
pnpm lint           # Lint all packages
pnpm typecheck      # Type-check all packages
pnpm docker:up      # Start production Docker stack
pnpm docker:down    # Stop Docker stack
pnpm docker:dev     # Start dev Docker stack with hot reload
pnpm prisma:generate # Generate Prisma client
pnpm prisma:migrate  # Run database migrations
pnpm prisma:seed     # Seed initial data
```

## License

[MIT](LICENSE)

-- CreateEnum
CREATE TYPE "ChaosMode" AS ENUM ('normal', 'forceStatus', 'probabilisticError', 'latency', 'timeout');

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "workflowName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "iterations" INTEGER NOT NULL,
    "concurrency" INTEGER NOT NULL,
    "payloadSize" INTEGER,
    "clientTimeoutMs" INTEGER NOT NULL,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "backoffMs" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "totalCalls" INTEGER NOT NULL DEFAULT 0,
    "successCalls" INTEGER NOT NULL DEFAULT 0,
    "errorCalls" INTEGER NOT NULL DEFAULT 0,
    "timeoutCalls" INTEGER NOT NULL DEFAULT 0,
    "p50LatencyMs" DOUBLE PRECISION,
    "p95LatencyMs" DOUBLE PRECISION,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "parentCallId" TEXT,
    "requestId" TEXT NOT NULL,
    "fromService" TEXT NOT NULL,
    "toService" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER,
    "durationMs" INTEGER NOT NULL,
    "errorType" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceChaosConfig" (
    "serviceName" TEXT NOT NULL,
    "mode" "ChaosMode" NOT NULL DEFAULT 'normal',
    "forceStatusCode" INTEGER,
    "errorProbability" DOUBLE PRECISION,
    "fixedLatencyMs" INTEGER,
    "randomLatencyMinMs" INTEGER,
    "randomLatencyMaxMs" INTEGER,
    "timeoutProbability" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceChaosConfig_pkey" PRIMARY KEY ("serviceName")
);

-- CreateIndex
CREATE INDEX "Call_runId_idx" ON "Call"("runId");

-- CreateIndex
CREATE INDEX "Call_parentCallId_idx" ON "Call"("parentCallId");

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

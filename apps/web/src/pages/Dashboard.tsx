import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost, getSseUrl } from '../lib/api';
import { useI18n } from '../lib/i18n';

interface Run {
  id: string;
  workflowName: string;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  timeoutCalls: number;
  p50LatencyMs?: number | null;
  p95LatencyMs?: number | null;
}

interface RunsResponse {
  items: Run[];
  total: number;
  page: number;
  pageSize: number;
}

const workflows = ['chain', 'fanout', 'fanout-fanin', 'random'] as const;

export default function Dashboard() {
  const { t } = useI18n();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Form state
  const [workflow, setWorkflow] = useState<string>('chain');
  const [iterations, setIterations] = useState(50);
  const [concurrency, setConcurrency] = useState(5);
  const [payloadSize, setPayloadSize] = useState(256);
  const [clientTimeoutMs, setClientTimeoutMs] = useState(2000);
  const [enableRetries, setEnableRetries] = useState(false);
  const [retries, setRetries] = useState(1);
  const [backoffMs, setBackoffMs] = useState(200);

  const sseRef = useRef<EventSource | null>(null);

  const fetchRuns = useCallback(async () => {
    try {
      const data = await apiGet<RunsResponse>('/runs?page=1&pageSize=50');
      setRuns(data.items);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  // SSE for real-time updates
  useEffect(() => {
    const es = new EventSource(getSseUrl('/runs/global/events'));
    sseRef.current = es;

    es.onmessage = () => {
      fetchRuns();
    };

    es.onerror = () => {
      es.close();
      // Reconnect after a delay
      setTimeout(() => {
        if (sseRef.current === es) {
          const newEs = new EventSource(getSseUrl('/runs/global/events'));
          newEs.onmessage = () => fetchRuns();
          sseRef.current = newEs;
        }
      }, 3000);
    };

    return () => {
      es.close();
      sseRef.current = null;
    };
  }, [fetchRuns]);

  // Refetch on tab focus
  useEffect(() => {
    const handler = () => {
      if (!document.hidden) fetchRuns();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [fetchRuns]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        workflow,
        iterations,
        concurrency,
        payloadSize,
        clientTimeoutMs,
      };
      if (enableRetries) {
        body.retryPolicy = { retries, backoffMs };
      }
      await apiPost('/runs', body);
      await fetchRuns();
    } catch (err) {
      setError(t('dashboard.createError') + ': ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = async () => {
    setShowClearConfirm(false);
    try {
      await apiPost('/runs/clear');
      await fetchRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  function formatDuration(ms?: number): string {
    if (ms === undefined || ms === null) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleTimeString();
    } catch {
      return iso;
    }
  }

  function statusBadgeClass(status: string): string {
    switch (status) {
      case 'running': return 'badge badge-running';
      case 'completed': return 'badge badge-completed';
      case 'failed': return 'badge badge-failed';
      default: return 'badge';
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>

      {/* Create Run Form */}
      <div className="card p-4 sm:p-6">
        <h2 className="text-lg font-semibold mb-4">{t('dashboard.createRun')}</h2>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="label">{t('dashboard.workflow')}</label>
              <select className="select" value={workflow} onChange={(e) => setWorkflow(e.target.value)}>
                {workflows.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t('dashboard.iterations')}</label>
              <input type="number" className="input" value={iterations} min={1} onChange={(e) => setIterations(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">{t('dashboard.concurrency')}</label>
              <input type="number" className="input" value={concurrency} min={1} onChange={(e) => setConcurrency(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">{t('dashboard.payloadSize')}</label>
              <input type="number" className="input" value={payloadSize} min={0} onChange={(e) => setPayloadSize(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">{t('dashboard.clientTimeout')}</label>
              <input type="number" className="input" value={clientTimeoutMs} min={100} onChange={(e) => setClientTimeoutMs(Number(e.target.value))} />
            </div>
          </div>

          {/* Retry Policy */}
          <div className="mt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enableRetries}
                onChange={(e) => setEnableRetries(e.target.checked)}
                className="rounded border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('dashboard.retryPolicy')}
              </span>
            </label>
            {enableRetries && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 ml-6">
                <div>
                  <label className="label">{t('dashboard.retries')}</label>
                  <input type="number" className="input" value={retries} min={1} onChange={(e) => setRetries(Number(e.target.value))} />
                </div>
                <div>
                  <label className="label">{t('dashboard.backoffMs')}</label>
                  <input type="number" className="input" value={backoffMs} min={0} onChange={(e) => setBackoffMs(Number(e.target.value))} />
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="mt-4">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? t('dashboard.submitting') : t('dashboard.submit')}
            </button>
          </div>
        </form>
      </div>

      {/* Runs Table */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold">{t('dashboard.runs')}</h2>
          {runs.length > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="btn-danger text-sm py-1.5 px-3"
            >
              {t('dashboard.clearAll')}
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            {t('common.loading')}
          </div>
        ) : runs.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            {t('dashboard.noRuns')}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700 text-left">
                    <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">{t('dashboard.id')}</th>
                    <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">{t('dashboard.workflow')}</th>
                    <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">{t('dashboard.status')}</th>
                    <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">{t('dashboard.started')}</th>
                    <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">{t('dashboard.duration')}</th>
                    <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">{t('dashboard.successRate')}</th>
                    <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">{t('dashboard.errors')}</th>
                    <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">{t('dashboard.p95')}</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run, i) => (
                    <tr
                      key={run.id}
                      className={`border-b border-gray-100 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30 ${
                        i % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-slate-800/50'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <Link to={`/runs/${run.id}`} className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-xs">
                          {run.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{run.workflowName}</td>
                      <td className="px-4 py-3">
                        <span className={statusBadgeClass(run.status)}>{run.status}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{formatDate(run.startedAt)}</td>
                      <td className="px-4 py-3">{run.finishedAt ? formatDuration(new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) : '-'}</td>
                      <td className="px-4 py-3">
                        {run.totalCalls > 0 ? `${((run.successCalls / run.totalCalls) * 100).toFixed(1)}%` : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={run.errorCalls > 0 ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
                          {run.errorCalls}
                        </span>
                      </td>
                      <td className="px-4 py-3">{run.p95LatencyMs != null ? `${run.p95LatencyMs.toFixed(0)}ms` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-200 dark:divide-slate-700">
              {runs.map((run) => (
                <div key={run.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Link to={`/runs/${run.id}`} className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-sm">
                      {run.id.slice(0, 8)}
                    </Link>
                    <span className={statusBadgeClass(run.status)}>{run.status}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">{run.workflowName}</span>
                    <span className="text-gray-500 dark:text-gray-400">{formatDate(run.startedAt)}</span>
                  </div>
                  <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span>{t('dashboard.duration')}: {run.finishedAt ? formatDuration(new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) : '-'}</span>
                    <span>{t('dashboard.successRate')}: {run.totalCalls > 0 ? `${((run.successCalls / run.totalCalls) * 100).toFixed(1)}%` : '-'}</span>
                    <span>{t('dashboard.errors')}: {run.errorCalls}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Clear confirmation modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card p-6 max-w-sm mx-4">
            <p className="text-sm mb-4">{t('dashboard.clearConfirm')}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowClearConfirm(false)} className="btn-secondary text-sm py-1.5">
                {t('common.cancel')}
              </button>
              <button onClick={handleClear} className="btn-danger text-sm py-1.5">
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiGet, getSseUrl } from '../lib/api';
import { useI18n } from '../lib/i18n';

interface Call {
  id: string;
  fromService: string;
  toService: string;
  statusCode: number | null;
  durationMs: number;
  errorType?: string | null;
  errorMessage?: string | null;
}

interface GraphNode {
  id: string;
  fromService: string;
  toService: string;
  statusCode: number | null;
  durationMs: number;
  children?: GraphNode[];
}

interface RunData {
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
  calls: Call[];
  callGraph: GraphNode[];
}

export default function RunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const { t } = useI18n();
  const [data, setData] = useState<RunData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showGraph, setShowGraph] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterService, setFilterService] = useState('all');
  const sseRef = useRef<EventSource | null>(null);

  const fetchData = useCallback(async () => {
    if (!runId) return;
    try {
      const result = await apiGet<RunData>(`/runs/${runId}`);
      setData(result);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // SSE for running runs
  useEffect(() => {
    if (!data || data.status !== 'running' || !runId) return;

    const es = new EventSource(getSseUrl(`/runs/${runId}/events`));
    sseRef.current = es;

    es.onmessage = () => {
      fetchData();
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
      sseRef.current = null;
    };
  }, [data?.status, runId, fetchData]);

  if (loading) {
    return <div className="text-center py-12 text-gray-500 dark:text-gray-400">{t('common.loading')}</div>;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link to="/" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">&larr; {t('runDetail.back')}</Link>
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const { calls, callGraph } = data;

  // Gather unique services for filter
  const services = Array.from(new Set(calls.flatMap((c) => [c.fromService, c.toService]).filter(Boolean)));

  const filteredCalls = calls.filter((c) => {
    const code = c.statusCode ?? 0;
    if (filterStatus === 'ok' && (code < 200 || code >= 300)) return false;
    if (filterStatus === 'error' && code >= 200 && code < 300) return false;
    if (filterService !== 'all' && c.fromService !== filterService && c.toService !== filterService) return false;
    return true;
  });

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
      <div className="flex items-center gap-4">
        <Link to="/" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">&larr; {t('runDetail.back')}</Link>
      </div>

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{t('runDetail.title')}</h1>
        <span className={statusBadgeClass(data.status)}>{data.status}</span>
      </div>

      {/* Metrics */}
      <div className="card p-4 sm:p-6">
        <h2 className="text-lg font-semibold mb-4">{t('runDetail.metrics')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard label={t('dashboard.workflow')} value={data.workflowName} />
          <MetricCard label={t('runDetail.status')} value={data.status} />
          <MetricCard label={t('runDetail.totalCalls')} value={data.totalCalls ?? '-'} />
          <MetricCard label={t('runDetail.successCalls')} value={data.successCalls ?? '-'} valueClass="text-green-600 dark:text-green-400" />
          <MetricCard label={t('runDetail.errorCalls')} value={data.errorCalls ?? '-'} valueClass="text-red-600 dark:text-red-400" />
          <MetricCard label={t('runDetail.timeoutCalls')} value={data.timeoutCalls ?? '-'} valueClass="text-amber-600 dark:text-amber-400" />
          <MetricCard label={t('runDetail.p50')} value={data.p50LatencyMs != null ? data.p50LatencyMs.toFixed(0) : '-'} />
          <MetricCard label={t('runDetail.p95')} value={data.p95LatencyMs != null ? data.p95LatencyMs.toFixed(0) : '-'} />
        </div>
      </div>

      {/* Call Graph */}
      {callGraph && callGraph.length > 0 && (
        <div className="card">
          <button
            onClick={() => setShowGraph(!showGraph)}
            className="w-full flex items-center justify-between p-4 text-left"
          >
            <h2 className="text-lg font-semibold">{t('runDetail.callGraph')}</h2>
            <span className="text-sm text-blue-600 dark:text-blue-400">
              {showGraph ? t('runDetail.hideGraph') : t('runDetail.showGraph')}
            </span>
          </button>
          {showGraph && (
            <div className="px-4 pb-4 overflow-x-auto">
              <div className="min-w-[400px]">
                {callGraph.map((node, i) => (
                  <GraphNodeComponent key={i} node={node} depth={0} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Calls Table */}
      <div className="card">
        <div className="p-4 border-b border-gray-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold mb-3">{t('runDetail.callsTable')}</h2>
          <div className="flex flex-wrap gap-3">
            <div>
              <label className="label">{t('runDetail.filterStatus')}</label>
              <select className="select text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">{t('runDetail.all')}</option>
                <option value="ok">{t('runDetail.ok')}</option>
                <option value="error">{t('runDetail.error')}</option>
              </select>
            </div>
            <div>
              <label className="label">{t('runDetail.filterService')}</label>
              <select className="select text-sm" value={filterService} onChange={(e) => setFilterService(e.target.value)}>
                <option value="all">{t('runDetail.all')}</option>
                {services.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {filteredCalls.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">{t('runDetail.noCalls')}</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700 text-left">
                    <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">{t('runDetail.fromService')}</th>
                    <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">{t('runDetail.toService')}</th>
                    <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">{t('runDetail.statusCode')}</th>
                    <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">{t('runDetail.durationMs')}</th>
                    <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">{t('runDetail.errorType')}</th>
                    <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">{t('runDetail.errorMessage')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCalls.map((call, i) => (
                    <tr
                      key={call.id || i}
                      className={`border-b border-gray-100 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30 ${
                        i % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-slate-800/50'
                      }`}
                    >
                      <td className="px-4 py-3">{call.fromService}</td>
                      <td className="px-4 py-3">{call.toService}</td>
                      <td className="px-4 py-3">
                        <span className={
                          call.statusCode != null && call.statusCode >= 200 && call.statusCode < 300
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400 font-medium'
                        }>
                          {call.statusCode ?? '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">{call.durationMs?.toFixed(0) ?? '-'}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{call.errorType || '-'}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-xs truncate">{call.errorMessage || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-200 dark:divide-slate-700">
              {filteredCalls.map((call, i) => (
                <div key={call.id || i} className="p-4 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">{call.fromService} &rarr; {call.toService}</span>
                    <span className={
                      call.statusCode != null && call.statusCode >= 200 && call.statusCode < 300
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400 font-medium'
                    }>
                      {call.statusCode ?? '-'}
                    </span>
                  </div>
                  <div className="text-gray-500 dark:text-gray-400">
                    {call.durationMs?.toFixed(0) ?? '-'}ms
                    {call.errorType && <span className="ml-2 text-red-500">{call.errorType}</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, valueClass }: { label: string; value: string | number; valueClass?: string }) {
  return (
    <div className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      <div className={`text-lg font-semibold ${valueClass || ''}`}>{value}</div>
    </div>
  );
}

function GraphNodeComponent({ node, depth }: { node: GraphNode; depth: number }) {
  const isSuccess = node.statusCode != null && node.statusCode >= 200 && node.statusCode < 300;

  return (
    <div style={{ marginLeft: depth * 24 }} className="py-1">
      <div className="flex items-center gap-2 text-sm">
        <span className={`w-2 h-2 rounded-full ${isSuccess ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="font-medium">{node.fromService}</span>
        <span className="text-gray-400">&rarr;</span>
        <span className="font-medium">{node.toService}</span>
        <span className={`text-xs ${isSuccess ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {node.statusCode}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{node.durationMs}ms</span>
      </div>
      {node.children?.map((child, i) => (
        <GraphNodeComponent key={i} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

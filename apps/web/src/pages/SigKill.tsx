import { useState, useEffect, useCallback, useRef } from 'react';
import { apiGet, apiPost } from '../lib/api';
import { useI18n } from '../lib/i18n';

interface KillTarget {
  name: string;
  url: string;
  healthy: boolean;
}

interface KillTargetsResponse {
  targets: KillTarget[];
}

export default function SigKill() {
  const { t } = useI18n();
  const [targets, setTargets] = useState<KillTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [terminating, setTerminating] = useState<string | null>(null);
  // Track services that were recently killed to show recovery status
  const recentlyKilledRef = useRef<Map<string, number>>(new Map());
  const [, forceUpdate] = useState(0);

  const fetchTargets = useCallback(async () => {
    try {
      const data = await apiGet<KillTargetsResponse>('/services/kill-targets');
      setTargets(data.targets);
      setError('');

      // Clean up recovered services (healthy again after being killed)
      const now = Date.now();
      for (const [name, killedAt] of recentlyKilledRef.current) {
        const target = data.targets.find((t) => t.name === name);
        if (target?.healthy && now - killedAt > 3000) {
          recentlyKilledRef.current.delete(name);
        }
        // Timeout: remove after 120s regardless
        if (now - killedAt > 120000) {
          recentlyKilledRef.current.delete(name);
        }
      }
      forceUpdate((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTargets();
    const interval = setInterval(fetchTargets, 2000);
    return () => clearInterval(interval);
  }, [fetchTargets]);

  const handleTerminate = async (name: string) => {
    setConfirmTarget(null);
    setTerminating(name);
    setError('');
    try {
      await apiPost(`/services/${name}/terminate`, { signal: 'SIGTERM' });
      recentlyKilledRef.current.set(name, Date.now());
      // Give the service time to actually die before polling
      setTimeout(fetchTargets, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTerminating(null);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500 dark:text-gray-400">{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('sigkill.title')}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('sigkill.description')}</p>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">{error}</div>
      )}

      {targets.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">{t('sigkill.noTargets')}</div>
      ) : (
        <div className="space-y-3">
          {targets.map((target) => {
            const isTerminating = terminating === target.name;
            const wasKilled = recentlyKilledRef.current.has(target.name);
            const isRecovering = wasKilled && !target.healthy;
            const hasRecovered = wasKilled && target.healthy;

            let statusColor = 'bg-green-500';
            let statusLabel = t('sigkill.healthy');
            if (isRecovering) {
              statusColor = 'bg-amber-500 animate-pulse';
              statusLabel = t('sigkill.recovering');
            } else if (!target.healthy) {
              statusColor = 'bg-red-500';
              statusLabel = t('sigkill.down');
            } else if (hasRecovered) {
              statusColor = 'bg-green-500';
              statusLabel = t('sigkill.recovered');
            }

            return (
              <div key={target.name} className="card p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full ${statusColor}`} />
                  <div>
                    <div className="font-medium">{target.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {statusLabel}
                      {isRecovering && <span className="ml-2">&mdash; {t('sigkill.waitingRestart')}</span>}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setConfirmTarget(target.name)}
                  className="btn-danger text-sm py-1.5"
                  disabled={isTerminating || isRecovering}
                >
                  {isTerminating ? t('sigkill.terminating') : t('sigkill.terminate')}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation modal */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card p-6 max-w-sm mx-4">
            <h3 className="text-lg font-semibold mb-2">{t('sigkill.confirmTitle')}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {t('sigkill.confirmMessage').replace('{name}', confirmTarget)}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmTarget(null)} className="btn-secondary text-sm py-1.5">
                {t('common.cancel')}
              </button>
              <button onClick={() => handleTerminate(confirmTarget)} className="btn-danger text-sm py-1.5">
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

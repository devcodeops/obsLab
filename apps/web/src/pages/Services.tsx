import { useState, useEffect, useCallback, useRef } from 'react';
import { apiGet, apiPost } from '../lib/api';
import { useI18n } from '../lib/i18n';

interface ChaosConfig {
  mode: string;
  forceStatusCode?: number;
  errorProbability?: number;
  fixedLatencyMs?: number;
  randomLatencyMinMs?: number;
  randomLatencyMaxMs?: number;
  timeoutProbability?: number;
}

interface Service {
  name: string;
  url: string;
  healthy: boolean;
  chaosConfig?: ChaosConfig;
}

interface ServicesResponse {
  services: Service[];
}

const chaosModes = ['normal', 'forceStatus', 'probabilisticError', 'latency', 'timeout'] as const;

export default function Services() {
  const { t } = useI18n();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Track which cards have user edits (dirty state)
  const dirtyRef = useRef<Set<string>>(new Set());

  const fetchServices = useCallback(async () => {
    try {
      const data = await apiGet<ServicesResponse>('/services');
      setServices((prev) => {
        // Preserve dirty form states
        if (prev.length === 0) return data.services;
        return data.services.map((s) => {
          if (dirtyRef.current.has(s.name)) {
            const existing = prev.find((p) => p.name === s.name);
            if (existing) return { ...s, chaosConfig: existing.chaosConfig };
          }
          return s;
        });
      });
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServices();
    const interval = setInterval(fetchServices, 3000);
    return () => clearInterval(interval);
  }, [fetchServices]);

  if (loading) {
    return <div className="text-center py-12 text-gray-500 dark:text-gray-400">{t('common.loading')}</div>;
  }

  if (error && services.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t('services.title')}</h1>
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('services.title')}</h1>

      {services.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">{t('services.noServices')}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {services.map((service) => (
            <ServiceCard
              key={service.name}
              service={service}
              dirtyRef={dirtyRef}
              onUpdate={fetchServices}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceCard({
  service,
  dirtyRef,
  onUpdate,
}: {
  service: Service;
  dirtyRef: React.RefObject<Set<string>>;
  onUpdate: () => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState(service.chaosConfig?.mode || 'normal');
  const [forceStatusCode, setForceStatusCode] = useState(service.chaosConfig?.forceStatusCode ?? 500);
  const [errorProbability, setErrorProbability] = useState(service.chaosConfig?.errorProbability ?? 0.5);
  const [fixedLatencyMs, setFixedLatencyMs] = useState(service.chaosConfig?.fixedLatencyMs ?? 500);
  const [randomLatencyMinMs, setRandomLatencyMinMs] = useState(service.chaosConfig?.randomLatencyMinMs ?? 100);
  const [randomLatencyMaxMs, setRandomLatencyMaxMs] = useState(service.chaosConfig?.randomLatencyMaxMs ?? 2000);
  const [timeoutProbability, setTimeoutProbability] = useState(service.chaosConfig?.timeoutProbability ?? 0.5);
  const [applying, setApplying] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [cardError, setCardError] = useState('');

  // Sync from props when not dirty
  useEffect(() => {
    if (!dirtyRef.current?.has(service.name)) {
      setMode(service.chaosConfig?.mode || 'normal');
      setForceStatusCode(service.chaosConfig?.forceStatusCode ?? 500);
      setErrorProbability(service.chaosConfig?.errorProbability ?? 0.5);
      setFixedLatencyMs(service.chaosConfig?.fixedLatencyMs ?? 500);
      setRandomLatencyMinMs(service.chaosConfig?.randomLatencyMinMs ?? 100);
      setRandomLatencyMaxMs(service.chaosConfig?.randomLatencyMaxMs ?? 2000);
      setTimeoutProbability(service.chaosConfig?.timeoutProbability ?? 0.5);
    }
  }, [service, dirtyRef]);

  const markDirty = () => {
    dirtyRef.current?.add(service.name);
  };

  const handleApply = async () => {
    setApplying(true);
    setCardError('');
    try {
      const body: ChaosConfig = { mode };
      if (mode === 'forceStatus') body.forceStatusCode = forceStatusCode;
      if (mode === 'probabilisticError') body.errorProbability = errorProbability;
      if (mode === 'latency') {
        body.fixedLatencyMs = fixedLatencyMs;
        body.randomLatencyMinMs = randomLatencyMinMs;
        body.randomLatencyMaxMs = randomLatencyMaxMs;
      }
      if (mode === 'timeout') body.timeoutProbability = timeoutProbability;

      await apiPost(`/services/${service.name}/chaos`, body);
      dirtyRef.current?.delete(service.name);
      onUpdate();
    } catch (err) {
      setCardError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    setCardError('');
    try {
      await apiPost(`/services/${service.name}/chaos/reset`);
      dirtyRef.current?.delete(service.name);
      onUpdate();
    } catch (err) {
      setCardError(err instanceof Error ? err.message : String(err));
    } finally {
      setResetting(false);
    }
  };

  const isHealthy = service.healthy;

  return (
    <div className="card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">{service.name}</h3>
        <span className={`badge ${isHealthy ? 'badge-healthy' : 'badge-unhealthy'}`}>
          <span className={`w-2 h-2 rounded-full mr-1.5 ${isHealthy ? 'bg-green-500' : 'bg-red-500'}`} />
          {isHealthy ? t('services.healthy') : t('services.unhealthy')}
        </span>
      </div>

      {/* Current mode */}
      <div className="text-sm text-gray-500 dark:text-gray-400">
        {t('services.currentMode')}: <span className="font-medium text-gray-700 dark:text-gray-300">{service.chaosConfig?.mode || 'normal'}</span>
      </div>

      {/* Chaos mode selector */}
      <div>
        <label className="label">{t('services.chaosMode')}</label>
        <select
          className="select"
          value={mode}
          onChange={(e) => { setMode(e.target.value); markDirty(); }}
        >
          {chaosModes.map((m) => (
            <option key={m} value={m}>{t(`services.${m}`)}</option>
          ))}
        </select>
      </div>

      {/* Conditional fields */}
      {mode === 'forceStatus' && (
        <div>
          <label className="label">{t('services.forceStatusCode')}</label>
          <input
            type="number"
            className="input"
            value={forceStatusCode}
            min={400}
            max={599}
            onChange={(e) => { setForceStatusCode(Number(e.target.value)); markDirty(); }}
          />
        </div>
      )}

      {mode === 'probabilisticError' && (
        <div>
          <label className="label">{t('services.errorProbability')}</label>
          <input
            type="number"
            className="input"
            value={errorProbability}
            min={0}
            max={1}
            step={0.1}
            onChange={(e) => { setErrorProbability(Number(e.target.value)); markDirty(); }}
          />
        </div>
      )}

      {mode === 'latency' && (
        <div className="space-y-3">
          <div>
            <label className="label">{t('services.fixedLatencyMs')}</label>
            <input
              type="number"
              className="input"
              value={fixedLatencyMs}
              min={0}
              onChange={(e) => { setFixedLatencyMs(Number(e.target.value)); markDirty(); }}
            />
          </div>
          <div>
            <label className="label">{t('services.randomLatencyMinMs')}</label>
            <input
              type="number"
              className="input"
              value={randomLatencyMinMs}
              min={0}
              onChange={(e) => { setRandomLatencyMinMs(Number(e.target.value)); markDirty(); }}
            />
          </div>
          <div>
            <label className="label">{t('services.randomLatencyMaxMs')}</label>
            <input
              type="number"
              className="input"
              value={randomLatencyMaxMs}
              min={0}
              onChange={(e) => { setRandomLatencyMaxMs(Number(e.target.value)); markDirty(); }}
            />
          </div>
        </div>
      )}

      {mode === 'timeout' && (
        <div>
          <label className="label">{t('services.timeoutProbability')}</label>
          <input
            type="number"
            className="input"
            value={timeoutProbability}
            min={0}
            max={1}
            step={0.1}
            onChange={(e) => { setTimeoutProbability(Number(e.target.value)); markDirty(); }}
          />
        </div>
      )}

      {cardError && (
        <div className="p-2 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs">{cardError}</div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button onClick={handleApply} className="btn-primary text-sm py-1.5 flex-1" disabled={applying}>
          {applying ? t('services.applying') : t('services.apply')}
        </button>
        <button onClick={handleReset} className="btn-secondary text-sm py-1.5" disabled={resetting}>
          {resetting ? t('services.resetting') : t('services.reset')}
        </button>
      </div>
    </div>
  );
}

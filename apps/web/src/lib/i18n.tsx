import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type Locale = 'en' | 'es';

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

type Dict = { [key: string]: string | Dict };

const en: Dict = {
  nav: {
    dashboard: 'Dashboard',
    services: 'Services',
    sigkill: 'SigKill',
  },
  dashboard: {
    title: 'Dashboard',
    createRun: 'Create Run',
    workflow: 'Workflow',
    iterations: 'Iterations',
    concurrency: 'Concurrency',
    payloadSize: 'Payload Size (bytes)',
    clientTimeout: 'Client Timeout (ms)',
    retryPolicy: 'Retry Policy',
    enableRetries: 'Enable retries',
    retries: 'Retries',
    backoffMs: 'Backoff (ms)',
    submit: 'Start Run',
    submitting: 'Starting...',
    runs: 'Runs',
    clearAll: 'Clear All',
    clearConfirm: 'Are you sure you want to delete all runs? This cannot be undone.',
    cleared: 'All runs cleared',
    id: 'ID',
    status: 'Status',
    started: 'Started',
    duration: 'Duration',
    successRate: 'Success %',
    errors: 'Errors',
    p95: 'P95 (ms)',
    noRuns: 'No runs yet. Create one above.',
    createError: 'Failed to create run',
  },
  runDetail: {
    title: 'Run Detail',
    back: 'Back to Dashboard',
    metrics: 'Metrics',
    status: 'Status',
    totalCalls: 'Total Calls',
    successCalls: 'Successful',
    errorCalls: 'Errors',
    timeoutCalls: 'Timeouts',
    p50: 'P50 (ms)',
    p95: 'P95 (ms)',
    callGraph: 'Call Graph',
    showGraph: 'Show Call Graph',
    hideGraph: 'Hide Call Graph',
    callsTable: 'Calls',
    filterStatus: 'Filter by status',
    filterService: 'Filter by service',
    all: 'All',
    ok: 'OK',
    error: 'Error',
    fromService: 'From',
    toService: 'To',
    statusCode: 'Status Code',
    durationMs: 'Duration (ms)',
    errorType: 'Error Type',
    errorMessage: 'Error Message',
    noCalls: 'No calls recorded.',
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
  },
  services: {
    title: 'Services',
    health: 'Health',
    healthy: 'Healthy',
    unhealthy: 'Unhealthy',
    chaosMode: 'Chaos Mode',
    currentMode: 'Current mode',
    normal: 'Normal',
    forceStatus: 'Force Status',
    probabilisticError: 'Probabilistic Error',
    latency: 'Latency',
    timeout: 'Timeout',
    forceStatusCode: 'Status Code (400-599)',
    errorProbability: 'Error Probability (0-1)',
    fixedLatencyMs: 'Fixed Latency (ms)',
    randomLatencyMinMs: 'Random Min (ms)',
    randomLatencyMaxMs: 'Random Max (ms)',
    timeoutProbability: 'Timeout Probability (0-1)',
    apply: 'Apply',
    reset: 'Reset',
    applying: 'Applying...',
    resetting: 'Resetting...',
    noServices: 'No services found.',
  },
  sigkill: {
    title: 'SigKill',
    description: 'Terminate worker services to test fault tolerance. Services will automatically restart (simulating Kubernetes self-healing). Watch the health status recover in real time.',
    terminate: 'Terminate',
    terminating: 'Sending...',
    confirmTitle: 'Confirm Termination',
    confirmMessage: 'Are you sure you want to terminate "{name}"? The container will restart automatically.',
    noTargets: 'No kill targets available.',
    healthy: 'Healthy',
    down: 'Down',
    recovering: 'Recovering',
    recovered: 'Recovered',
    waitingRestart: 'waiting for container restart',
  },
  common: {
    loading: 'Loading...',
    error: 'An error occurred',
    noData: 'No data',
    confirm: 'Confirm',
    cancel: 'Cancel',
    close: 'Close',
  },
};

const es: Dict = {
  nav: {
    dashboard: 'Panel',
    services: 'Servicios',
    sigkill: 'SigKill',
  },
  dashboard: {
    title: 'Panel',
    createRun: 'Crear Ejecucion',
    workflow: 'Flujo de trabajo',
    iterations: 'Iteraciones',
    concurrency: 'Concurrencia',
    payloadSize: 'Tamano de carga (bytes)',
    clientTimeout: 'Tiempo limite del cliente (ms)',
    retryPolicy: 'Politica de reintentos',
    enableRetries: 'Habilitar reintentos',
    retries: 'Reintentos',
    backoffMs: 'Espera (ms)',
    submit: 'Iniciar Ejecucion',
    submitting: 'Iniciando...',
    runs: 'Ejecuciones',
    clearAll: 'Borrar Todo',
    clearConfirm: 'Estas seguro de que quieres borrar todas las ejecuciones? Esta accion no se puede deshacer.',
    cleared: 'Todas las ejecuciones borradas',
    id: 'ID',
    status: 'Estado',
    started: 'Inicio',
    duration: 'Duracion',
    successRate: 'Exito %',
    errors: 'Errores',
    p95: 'P95 (ms)',
    noRuns: 'No hay ejecuciones. Crea una arriba.',
    createError: 'Error al crear la ejecucion',
  },
  runDetail: {
    title: 'Detalle de Ejecucion',
    back: 'Volver al Panel',
    metrics: 'Metricas',
    status: 'Estado',
    totalCalls: 'Llamadas Totales',
    successCalls: 'Exitosas',
    errorCalls: 'Errores',
    timeoutCalls: 'Tiempos de espera',
    p50: 'P50 (ms)',
    p95: 'P95 (ms)',
    callGraph: 'Grafo de Llamadas',
    showGraph: 'Mostrar Grafo',
    hideGraph: 'Ocultar Grafo',
    callsTable: 'Llamadas',
    filterStatus: 'Filtrar por estado',
    filterService: 'Filtrar por servicio',
    all: 'Todos',
    ok: 'OK',
    error: 'Error',
    fromService: 'Origen',
    toService: 'Destino',
    statusCode: 'Codigo de Estado',
    durationMs: 'Duracion (ms)',
    errorType: 'Tipo de Error',
    errorMessage: 'Mensaje de Error',
    noCalls: 'No hay llamadas registradas.',
    running: 'En ejecucion',
    completed: 'Completado',
    failed: 'Fallido',
  },
  services: {
    title: 'Servicios',
    health: 'Salud',
    healthy: 'Saludable',
    unhealthy: 'No saludable',
    chaosMode: 'Modo Caos',
    currentMode: 'Modo actual',
    normal: 'Normal',
    forceStatus: 'Forzar Estado',
    probabilisticError: 'Error Probabilistico',
    latency: 'Latencia',
    timeout: 'Tiempo de espera',
    forceStatusCode: 'Codigo de Estado (400-599)',
    errorProbability: 'Probabilidad de Error (0-1)',
    fixedLatencyMs: 'Latencia Fija (ms)',
    randomLatencyMinMs: 'Latencia Min Aleatoria (ms)',
    randomLatencyMaxMs: 'Latencia Max Aleatoria (ms)',
    timeoutProbability: 'Probabilidad de Timeout (0-1)',
    apply: 'Aplicar',
    reset: 'Restablecer',
    applying: 'Aplicando...',
    resetting: 'Restableciendo...',
    noServices: 'No se encontraron servicios.',
  },
  sigkill: {
    title: 'SigKill',
    description: 'Termina servicios worker para probar tolerancia a fallos. Los servicios se reiniciaran automaticamente (simulando auto-recuperacion de Kubernetes). Observa la recuperacion del estado en tiempo real.',
    terminate: 'Terminar',
    terminating: 'Enviando...',
    confirmTitle: 'Confirmar Terminacion',
    confirmMessage: 'Estas seguro de que quieres terminar "{name}"? El contenedor se reiniciara automaticamente.',
    noTargets: 'No hay objetivos disponibles.',
    healthy: 'Saludable',
    down: 'Caido',
    recovering: 'Recuperando',
    recovered: 'Recuperado',
    waitingRestart: 'esperando reinicio del contenedor',
  },
  common: {
    loading: 'Cargando...',
    error: 'Ocurrio un error',
    noData: 'Sin datos',
    confirm: 'Confirmar',
    cancel: 'Cancelar',
    close: 'Cerrar',
  },
};

const dictionaries: Record<Locale, Dict> = { en, es };

function resolve(dict: Dict, key: string): string {
  const parts = key.split('.');
  let current: Dict | string = dict;
  for (const part of parts) {
    if (typeof current === 'string') return key;
    current = current[part];
    if (current === undefined) return key;
  }
  return typeof current === 'string' ? current : key;
}

function detectLocale(): Locale {
  const stored = localStorage.getItem('obslab-locale');
  if (stored === 'en' || stored === 'es') return stored;
  const browserLang = navigator.language.slice(0, 2);
  return browserLang === 'es' ? 'es' : 'en';
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('obslab-locale', l);
  }, []);

  const t = useCallback(
    (key: string) => resolve(dictionaries[locale], key),
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within LocaleProvider');
  return ctx;
}

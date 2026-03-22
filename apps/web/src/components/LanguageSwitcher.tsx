import { useI18n, type Locale } from '../lib/i18n';

const locales: Locale[] = ['en', 'es'];

export default function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-slate-600">
      {locales.map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          className={`px-2.5 py-1 text-xs font-medium transition-colors ${
            locale === l
              ? 'bg-blue-600 text-white'
              : 'bg-white dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-600'
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

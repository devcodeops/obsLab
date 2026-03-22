import { Link, useLocation } from 'react-router-dom';
import { useI18n } from '../lib/i18n';
import ThemeToggle from './ThemeToggle';
import LanguageSwitcher from './LanguageSwitcher';

const navItems = [
  { path: '/', labelKey: 'nav.dashboard' },
  { path: '/services', labelKey: 'nav.services' },
  { path: '/sigkill', labelKey: 'nav.sigkill' },
] as const;

export default function AppHeader() {
  const { t } = useI18n();
  const location = useLocation();

  function isActive(path: string) {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  }

  return (
    <header className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2">
              <span className="text-xl font-bold text-blue-600 dark:text-blue-400">obs</span>
              <span className="text-xl font-bold text-gray-900 dark:text-gray-100">Lab</span>
            </Link>

            <nav className="hidden sm:flex items-center gap-1">
              {navItems.map(({ path, labelKey }) => (
                <Link
                  key={path}
                  to={path}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive(path)
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {t(labelKey)}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>

        {/* Mobile nav */}
        <nav className="flex sm:hidden items-center gap-1 pb-2 overflow-x-auto">
          {navItems.map(({ path, labelKey }) => (
            <Link
              key={path}
              to={path}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                isActive(path)
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              {t(labelKey)}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

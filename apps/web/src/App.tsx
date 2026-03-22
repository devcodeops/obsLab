import { Routes, Route } from 'react-router-dom';
import AppHeader from './components/AppHeader';
import Dashboard from './pages/Dashboard';
import RunDetail from './pages/RunDetail';
import Services from './pages/Services';
import SigKill from './pages/SigKill';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/runs/:runId" element={<RunDetail />} />
          <Route path="/services" element={<Services />} />
          <Route path="/sigkill" element={<SigKill />} />
        </Routes>
      </main>
    </div>
  );
}

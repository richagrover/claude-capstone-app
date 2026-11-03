import { NavLink, Route, Routes } from 'react-router-dom';
import { BoardPage } from './pages/BoardPage';
import { SyncHealthPage } from './pages/SyncHealthPage';

export function App() {
  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white border-b px-4 py-2 flex gap-4">
        <NavLink
          to="/"
          className={({ isActive }) => `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600'}`}
        >
          Board
        </NavLink>
        <NavLink
          to="/sync-health"
          className={({ isActive }) => `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600'}`}
        >
          Sync Health
        </NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<BoardPage />} />
        <Route path="/sync-health" element={<SyncHealthPage />} />
      </Routes>
    </div>
  );
}

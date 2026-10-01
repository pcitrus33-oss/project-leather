import { Route, Routes } from 'react-router';
import GlobePage from './pages/GlobePage';
import CountryPage from './pages/CountryPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<GlobePage />} />
      <Route path="/country/:iso" element={<CountryPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<GlobePage />} />
    </Routes>
  );
}

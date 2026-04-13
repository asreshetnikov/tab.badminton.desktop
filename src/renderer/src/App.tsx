import { HashRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { Dashboard } from './app/routes/Dashboard'
import { TournamentNew } from './app/routes/TournamentNew'
import { TournamentDetail } from './app/routes/TournamentDetail'
import { Players } from './app/routes/Players'
import { Teams } from './app/routes/Teams'

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-muted-foreground">{title}</p>
    </div>
  )
}

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tournaments/new" element={<TournamentNew />} />
          <Route path="/tournaments/:id" element={<TournamentDetail />} />
          <Route path="/players" element={<Players />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/settings" element={<Placeholder title="Settings" />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App

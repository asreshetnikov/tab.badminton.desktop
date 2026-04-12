import { HashRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'

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
          <Route path="/" element={<Placeholder title="Dashboard" />} />
          <Route path="/players" element={<Placeholder title="Players" />} />
          <Route path="/teams" element={<Placeholder title="Teams" />} />
          <Route path="/settings" element={<Placeholder title="Settings" />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App

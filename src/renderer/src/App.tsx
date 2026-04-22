import { HashRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { Dashboard } from './app/routes/Dashboard'
import { TournamentNew } from './app/routes/TournamentNew'
import { TournamentDetail } from './app/routes/TournamentDetail'
import { Players } from './app/routes/Players'
import { Teams } from './app/routes/Teams'
import { TournamentPlayers } from './app/routes/TournamentPlayers'
import { TournamentTeams } from './app/routes/TournamentTeams'
import { TournamentRounds } from './app/routes/TournamentRounds'
import { GroupsView } from './app/routes/GroupsView'
import { PlayoffBracket } from './app/routes/PlayoffBracket'
import { TournamentSchedule } from './app/routes/TournamentSchedule'
import { TournamentPlayerDetail } from './app/routes/TournamentPlayerDetail'

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
          <Route path="/tournaments/:id/players" element={<TournamentPlayers />} />
          <Route path="/tournaments/:id/players/:playerId" element={<TournamentPlayerDetail />} />
          <Route path="/tournaments/:id/teams" element={<TournamentTeams />} />
          <Route path="/tournaments/:id/rounds" element={<TournamentRounds />} />
          <Route path="/tournaments/:id/events/:eid/rounds/:rid/groups" element={<GroupsView />} />
          <Route path="/tournaments/:id/events/:eid/rounds/:rid/playoff" element={<PlayoffBracket />} />
          <Route path="/tournaments/:id/schedule" element={<TournamentSchedule />} />
          <Route path="/players" element={<Players />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/settings" element={<Placeholder title="Settings" />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App

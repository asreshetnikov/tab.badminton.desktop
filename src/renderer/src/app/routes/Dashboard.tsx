import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trophy } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { useTournamentStore } from '@renderer/lib/store/tournament.store'
import { TournamentCard } from '@renderer/features/tournament/TournamentCard'

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="rounded-full bg-muted p-4">
        <Trophy className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium">No tournaments yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Create your first tournament to get started.
        </p>
      </div>
      <Button onClick={onCreateClick}>
        <Plus />
        New Tournament
      </Button>
    </div>
  )
}

export function Dashboard() {
  const { tournaments, isLoading, load } = useTournamentStore()
  const navigate = useNavigate()

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tournaments</h1>
        <Button onClick={() => navigate('/tournaments/new')}>
          <Plus />
          New Tournament
        </Button>
      </div>

      {isLoading ? (
        <div className="py-24 text-center text-sm text-muted-foreground">Loading...</div>
      ) : tournaments.length === 0 ? (
        <EmptyState onCreateClick={() => navigate('/tournaments/new')} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tournaments.map((t) => (
            <TournamentCard key={t.id} tournament={t} />
          ))}
        </div>
      )}
    </div>
  )
}

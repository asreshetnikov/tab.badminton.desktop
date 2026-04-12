// IPC contract between main and renderer processes.
// All API namespaces are defined here and extended as features are added.
// Renderer calls window.api.* — never ipcRenderer.invoke directly.

export interface AppAPI {
  ping(): Promise<string>

  // Namespaces added per step:
  // tournament: TournamentAPI
  // players: PlayersAPI
  // teams: TeamsAPI
  // ...
}

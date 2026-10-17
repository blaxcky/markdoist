// React-Anbindung: zustand-Store über dem Repository (läuft unter React DOM und React Native).
import { createStore } from "zustand/vanilla";
import type { Repository, RepoState } from "./repository";

export function createRepoStore(repo: Repository) {
  const store = createStore<RepoState>(() => repo.getState());
  repo.subscribe(() => store.setState(repo.getState(), true));
  return store;
}

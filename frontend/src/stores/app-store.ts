import { create } from "zustand";

interface AppState {
  soundEnabled: boolean;
  toggleSound: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  soundEnabled: true,
  toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),
}));

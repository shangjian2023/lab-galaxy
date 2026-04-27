import { create } from "zustand";
import type { InsightEvent } from "@/lib/api";

interface AppState {
  activeInsight: InsightEvent | null;
  soundEnabled: boolean;
  setActiveInsight: (insight: InsightEvent | null) => void;
  toggleSound: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeInsight: null,
  soundEnabled: true,
  setActiveInsight: (insight) => set({ activeInsight: insight }),
  toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),
}));

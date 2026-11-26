import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type UiState = {
  sidebarCollapsed: boolean;
  quickAddOpen: boolean;
  createTaskOpen: boolean;
  paletteOpen: boolean;
  toggleSidebar: () => void;
  setQuickAddOpen: (open: boolean) => void;
  setCreateTaskOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      quickAddOpen: false,
      createTaskOpen: false,
      paletteOpen: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setQuickAddOpen: (open) => set({ quickAddOpen: open }),
      setCreateTaskOpen: (open) => set({ createTaskOpen: open }),
      setPaletteOpen: (open) => set({ paletteOpen: open }),
    }),
    { name: 'lifehub.ui', partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }) },
  ),
);

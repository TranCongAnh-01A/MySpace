import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type UiState = {
  sidebarCollapsed: boolean;
  quickAddOpen: boolean;
  createTaskOpen: boolean;
  paletteOpen: boolean;
  createProjectOpen: boolean;
  toggleSidebar: () => void;
  setQuickAddOpen: (open: boolean) => void;
  setCreateTaskOpen: (open: boolean, projectId?: string) => void;
  createTaskProjectId: string | undefined;
  setPaletteOpen: (open: boolean) => void;
  setCreateProjectOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      quickAddOpen: false,
      createTaskOpen: false,
      createTaskProjectId: undefined,
      paletteOpen: false,
      createProjectOpen: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setQuickAddOpen: (open) => set({ quickAddOpen: open }),
      setCreateTaskOpen: (open, projectId) =>
        set({ createTaskOpen: open, createTaskProjectId: open ? projectId : undefined }),
      setPaletteOpen: (open) => set({ paletteOpen: open }),
      setCreateProjectOpen: (open) => set({ createProjectOpen: open }),
    }),
    { name: 'lifehub.ui', partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }) },
  ),
);

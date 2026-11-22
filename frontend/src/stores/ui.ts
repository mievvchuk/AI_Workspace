import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { Space } from "@/lib/types";

/** Client-only UI state. Server state lives in TanStack Query, never here. */

export type Theme = "system" | "light" | "dark";
export type ContextPanel = { kind: "materials"; subjectId: string } | { kind: "files"; projectId: string } | { kind: "session"; sessionId: string } | { kind: "process"; requestId: string } | null;

interface UIState {
  theme: Theme;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  space: Space;
  panel: ContextPanel;
  drafts: Record<string, string>;
  setTheme: (t: Theme) => void;
  toggleSidebar: () => void;
  setMobileNav: (open: boolean) => void;
  setSpace: (s: Space) => void;
  openPanel: (p: ContextPanel) => void;
  setDraft: (key: string, text: string) => void;
}

const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage unavailable (private mode / quota): drafts just won't persist */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      theme: "system",
      sidebarCollapsed: false,
      mobileNavOpen: false,
      space: "study",
      panel: null,
      drafts: {},
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileNav: (mobileNavOpen) => set({ mobileNavOpen }),
      setSpace: (space) => set({ space }),
      openPanel: (panel) => set({ panel }),
      setDraft: (key, text) =>
        set((s) => {
          const drafts = { ...s.drafts };
          if (text) drafts[key] = text.slice(0, 20_000);
          else delete drafts[key];
          return { drafts };
        }),
    }),
    {
      name: "aiw-ui",
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ theme: s.theme, sidebarCollapsed: s.sidebarCollapsed, space: s.space, drafts: s.drafts }),
    },
  ),
);

export function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

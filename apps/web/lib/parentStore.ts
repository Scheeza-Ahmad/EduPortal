import { create } from 'zustand';

export interface Child {
  id: string; // StudentProfile.id
  userId: string;
  name: string;
  rollNo: string;
  photoUrl: string | null;
  class: { id: string; number: number; section: string };
}

interface ParentState {
  children: Child[];
  selectedChildId: string | null;
  setChildren: (children: Child[]) => void;
  selectChild: (id: string) => void;
}

export const useParentStore = create<ParentState>((set) => ({
  children: [],
  selectedChildId: null,
  setChildren: (children) =>
    set((state) => ({
      children,
      // Keep the current selection if it's still valid, else default to the first child.
      selectedChildId:
        state.selectedChildId && children.some((c) => c.id === state.selectedChildId)
          ? state.selectedChildId
          : (children[0]?.id ?? null),
    })),
  selectChild: (id) => set({ selectedChildId: id }),
}));

'use client';

// Studio state store — the single source of truth both the manual controls and
// the agent write to. Native React context + reducer (no new deps per the fork's
// CLAUDE.md). Every mutation flows through a typed action so the action/capability
// layer (studio.capabilities.ts) is the one path for both human and agent.

import {
  createContext,
  useContext,
  useReducer,
  ReactNode,
  Dispatch,
  FC,
} from 'react';
import {
  StudioState,
  StudioTab,
  StudioModel,
  StudioResolution,
  StudioResult,
  STUDIO_SLOT_COUNT,
} from '@gitroom/frontend/components/studio/studio.types';

export type StudioAction =
  | { type: 'SET_TAB'; tab: StudioTab }
  | { type: 'SET_PROMPT'; prompt: string }
  | { type: 'SET_MODEL'; model: StudioModel }
  | { type: 'SET_ASPECT_RATIO'; aspectRatio: string }
  | { type: 'SET_RESOLUTION'; resolution: StudioResolution }
  | { type: 'SET_STATUS'; status: StudioState['status']; error?: string }
  | { type: 'ADD_RESULT'; result: StudioResult }
  | { type: 'PLACE_IN_SLOT'; index: number; result: StudioResult | null }
  | { type: 'RESET' };

export const initialStudioState: StudioState = {
  activeTab: 'images',
  prompt: '',
  model: 'nano_banana_flash',
  aspectRatio: '1:1',
  resolution: '1k',
  slots: Array.from({ length: STUDIO_SLOT_COUNT }, () => null),
  status: 'idle',
  error: undefined,
  results: [],
};

export function studioReducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, activeTab: action.tab };
    case 'SET_PROMPT':
      return { ...state, prompt: action.prompt };
    case 'SET_MODEL':
      return { ...state, model: action.model };
    case 'SET_ASPECT_RATIO':
      return { ...state, aspectRatio: action.aspectRatio };
    case 'SET_RESOLUTION':
      return { ...state, resolution: action.resolution };
    case 'SET_STATUS':
      return { ...state, status: action.status, error: action.error };
    case 'ADD_RESULT':
      return { ...state, results: [action.result, ...state.results] };
    case 'PLACE_IN_SLOT': {
      const slots = state.slots.slice();
      slots[action.index] = action.result;
      return { ...state, slots };
    }
    case 'RESET':
      return { ...initialStudioState };
    default:
      return state;
  }
}

interface StudioContextValue {
  state: StudioState;
  dispatch: Dispatch<StudioAction>;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export const StudioProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(studioReducer, initialStudioState);
  return (
    <StudioContext.Provider value={{ state, dispatch }}>
      {children}
    </StudioContext.Provider>
  );
};

export const useStudio = (): StudioContextValue => {
  const ctx = useContext(StudioContext);
  if (!ctx) {
    throw new Error('useStudio must be used within a StudioProvider');
  }
  return ctx;
};

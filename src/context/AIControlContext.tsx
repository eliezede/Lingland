import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AIControlService, AIControlState } from '../services/aiControlService';

interface AIControlContextValue {
  state: AIControlState | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastUpdatedAt: Date | null;
  refresh: (quiet?: boolean) => Promise<AIControlState | null>;
}

const AIControlContext = createContext<AIControlContextValue | null>(null);

const cleanError = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'AI state is unavailable.';
  return message
    .replace(/^Firebase:\s*/i, '')
    .replace(/^.*?\(functions\/[a-z-]+\)\.\s*/i, '')
    .slice(0, 220);
};

export const AIControlProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<AIControlState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setRefreshing(true);
    try {
      const next = await AIControlService.getState(150);
      setState(next);
      setError(null);
      setLastUpdatedAt(new Date());
      return next;
    } catch (caught) {
      setError(cleanError(caught));
      return null;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(true), 45000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh(true);
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refresh]);

  const value = useMemo<AIControlContextValue>(() => ({
    state,
    loading,
    refreshing,
    error,
    lastUpdatedAt,
    refresh,
  }), [error, lastUpdatedAt, loading, refresh, refreshing, state]);

  return <AIControlContext.Provider value={value}>{children}</AIControlContext.Provider>;
};

export const useAIControl = () => {
  const context = useContext(AIControlContext);
  if (!context) throw new Error('useAIControl must be used inside AIControlProvider.');
  return context;
};

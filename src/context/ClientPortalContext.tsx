import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  ClientHierarchyService,
  type ClientPortalContext as ClientPortalAccess,
} from '../services/clientHierarchyService';

interface ClientPortalContextValue {
  access: ClientPortalAccess | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}

const ClientPortalContext = createContext<ClientPortalContextValue | null>(null);

export const ClientPortalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [access, setAccess] = useState<ClientPortalAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setAccess(null);
      setError('');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const nextAccess = await ClientHierarchyService.getMyPortalContext();
      setAccess(nextAccess);
      setError('');
    } catch (cause) {
      console.error('Failed to resolve client portal access', cause);
      setAccess(null);
      setError('Your client access could not be resolved. Contact Lingland before continuing.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ access, loading, error, refresh }), [access, error, loading, refresh]);
  return <ClientPortalContext.Provider value={value}>{children}</ClientPortalContext.Provider>;
};

export const useClientPortal = () => {
  const context = useContext(ClientPortalContext);
  if (!context) throw new Error('useClientPortal must be used inside ClientPortalProvider.');
  return context;
};

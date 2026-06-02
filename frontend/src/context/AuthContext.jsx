import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as api from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveId] = useState(api.getActiveWorkspaceId() || null);
  const [loading, setLoading] = useState(true);

  // Decide which workspace to be "active" — keep stored one if still valid,
  // else fall back to the first the user belongs to.
  const reconcileActive = (wsList, preferredId) => {
    const list = wsList || [];
    if (list.length === 0) {
      api.setActiveWorkspaceId(null);
      setActiveId(null);
      return null;
    }
    const id = preferredId && list.some(w => w.id === preferredId) ? preferredId : list[0].id;
    api.setActiveWorkspaceId(id);
    setActiveId(id);
    return id;
  };

  // On mount, if we have a token, fetch /me to validate it.
  useEffect(() => {
    if (!api.getToken()) { setLoading(false); return; }
    api.getMe()
      .then((res) => {
        setUser(res.data);
        const ws = res.data.workspaces || [];
        setWorkspaces(ws);
        reconcileActive(ws, api.getActiveWorkspaceId());
      })
      .catch(() => { api.setToken(null); api.setActiveWorkspaceId(null); })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.login(email, password);
    api.setToken(res.data.token);
    setUser(res.data.user);
    const ws = res.data.workspaces || [];
    setWorkspaces(ws);
    reconcileActive(ws, api.getActiveWorkspaceId());
    return res.data.user;
  }, []);

  const register = useCallback(async (email, password, name, workspaceName) => {
    return api.register(email, password, name, workspaceName);
  }, []);

  const logout = useCallback(() => {
    api.setToken(null);
    api.setActiveWorkspaceId(null);
    setUser(null);
    setWorkspaces([]);
    setActiveId(null);
  }, []);

  const switchWorkspace = useCallback((id) => {
    if (workspaces.some(w => w.id === id)) {
      api.setActiveWorkspaceId(id);
      setActiveId(id);
    }
  }, [workspaces]);

  const refreshWorkspaces = useCallback(async () => {
    const res = await api.getMyWorkspaces();
    const ws = res.data || [];
    setWorkspaces(ws);
    reconcileActive(ws, activeWorkspaceId);
    return ws;
  }, [activeWorkspaceId]);

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || null;
  const activeRole = activeWorkspace?.role || null;

  return (
    <AuthContext.Provider value={{
      user, workspaces, activeWorkspaceId, activeWorkspace, activeRole,
      loading, login, register, logout, switchWorkspace, refreshWorkspaces,
      isAuthenticated: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

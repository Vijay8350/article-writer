import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as api from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount, if we have a token, validate it by loading the current user.
  useEffect(() => {
    if (!api.getToken()) {
      setLoading(false);
      return;
    }
    api.getMe()
      .then((res) => setUser(res.data))
      .catch(() => api.setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.login(email, password);
    api.setToken(res.data.token);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  // New accounts are 'pending' — registration does NOT log you in. Returns the
  // server response so the UI can show the "awaiting approval" message.
  const register = useCallback(async (email, password, name) => {
    return api.register(email, password, name);
  }, []);

  const logout = useCallback(() => {
    api.setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

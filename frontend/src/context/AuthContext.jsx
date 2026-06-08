import React, { createContext, useContext, useState, useEffect } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut as fbSignOut } from 'firebase/auth';
import { auth as fbAuth } from '../config/firebase';
import { authAPI } from '../services/api';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const response = await authAPI.me();
          setUser(response.data.user);
        } catch (error) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  /**
   * Login via Firebase Auth.
   *  1. signInWithEmailAndPassword (Firebase verifies credentials)
   *  2. Get the Firebase ID token
   *  3. Exchange it for our app JWT at /api/auth/firebase-login
   *
   * Falls back to legacy JWT login only if the user explicitly has no Firebase
   * Auth account yet (e.g. very first run before the admin is mirrored).
   */
  const login = async (email, password) => {
    try {
      const cred = await signInWithEmailAndPassword(fbAuth, email, password);
      const idToken = await cred.user.getIdToken();
      const res = await api.post('/auth/firebase-login', { idToken });
      const { token, user } = res.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      setUser(user);
      return user;
    } catch (err) {
      // Map common Firebase errors to friendly messages
      const code = err?.code || '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        const e = new Error('Invalid email or password.');
        e.response = { data: { error: 'Invalid email or password.' } };
        throw e;
      }
      if (code === 'auth/too-many-requests') {
        const e = new Error('Too many failed attempts. Please try again later or reset your password.');
        e.response = { data: { error: e.message } };
        throw e;
      }
      if (code === 'auth/network-request-failed') {
        const e = new Error('Network error. Check your internet connection.');
        e.response = { data: { error: e.message } };
        throw e;
      }
      // Fallback path: backend may not have Firebase yet — try legacy login once
      if (!code) {
        try {
          const response = await authAPI.login(email, password);
          const { token, user } = response.data;
          localStorage.setItem('token', token);
          localStorage.setItem('user', JSON.stringify(user));
          setUser(user);
          return user;
        } catch (legacyErr) { throw legacyErr; }
      }
      throw err;
    }
  };

  /** Send Firebase password-reset email using your verified youthnic.shop template. */
  const sendPasswordReset = async (email) => {
    await sendPasswordResetEmail(fbAuth, email);
  };

  const logout = async () => {
    try { await fbSignOut(fbAuth); } catch (_) {}
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const value = { user, login, logout, sendPasswordReset, loading, isAuthenticated: !!user };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

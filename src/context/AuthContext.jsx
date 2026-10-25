import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check current session context on initial load
  const refreshUser = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        setUser(data.user || null);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Failed to fetch authentication context:', err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Authenticate customer credentials
  const login = async (email, password) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMessage = data.message || (response.status === 401 ? 'Invalid email or password.' : 'Login failed. Please check your credentials.');
      throw new Error(errorMessage);
    }

    if (!data.user) {
      throw new Error('Authentication succeeded but user profile was not returned.');
    }

    setUser(data.user);
    return data;
  };

  // Register new customer account
  const register = async (registrationData) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(registrationData)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMessage = data.details?.[0]?.message || data.message || 'Registration failed.';
      throw new Error(errorMessage);
    }

    return data;
  };

  // Invalidate server session and clear local user context
  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        credentials: 'include'
      });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setUser(null);
    }
  };

  // Verify email address via cryptographic token
  const verifyEmail = async (token) => {
    const response = await fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ token })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || 'Email verification failed.');
    }

    if (data.user) {
      setUser(data.user);
    } else {
      await refreshUser();
    }

    return data;
  };

  // Resend email verification token securely
  const resendVerification = async (email) => {
    const targetEmail = email || user?.email;
    const response = await fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ email: targetEmail })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || 'Failed to resend verification email.');
    }

    return data;
  };

  // Development-only testing helper to fetch the raw verification token
  const getDevToken = async (email) => {
    try {
      const targetEmail = email || user?.email;
      if (!targetEmail) return null;
      const response = await fetch('/api/auth/dev-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ email: targetEmail })
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        return data.devVerificationToken || null;
      }
    } catch (err) {
      // Dev token unavailable outside development
    }
    return null;
  };

  const value = {
    user,
    loading,
    isAuthenticated: Boolean(user),
    isAdmin: Boolean(user && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')),
    isSuperAdmin: Boolean(user && user.role === 'SUPER_ADMIN'),
    isEmailVerified: Boolean(user?.emailVerified),
    login,
    register,
    logout,
    refreshUser,
    verifyEmail,
    resendVerification,
    getDevToken
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

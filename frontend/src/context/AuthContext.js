// frontend/src/context/AuthContext.js
import React, { createContext, useState, useEffect, useContext } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch (e) {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const response = await authAPI.getProfile();
        const userData = response.data;
        if (userData && userData.role) {
          userData.role = userData.role.toLowerCase().trim();
        }
        // Ensure token is attached for consistency
        userData.token = token;
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
      } catch (error) {
        // Only clear token and session if the backend explicitly rejected the token (401 or 403)
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        } else {
          // If network glitch or temporary connection error, preserve cached user from localStorage
          const savedUser = localStorage.getItem('user');
          if (savedUser) {
            try {
              const parsed = JSON.parse(savedUser);
              parsed.token = token;
              setUser(parsed);
            } catch (e) {
              setUser(null);
            }
          }
        }
      }
    } else {
      localStorage.removeItem('user');
      setUser(null);
    }
    setLoading(false);
  };


  const login = async (credentials) => {
    try {
      const normalized = {
        ...credentials,
        email: credentials.email ? credentials.email.trim().toLowerCase() : ''
      };
      const response = await authAPI.login(normalized);
      const userData = response.data;
      if (userData && userData.role) {
        userData.role = userData.role.toLowerCase().trim();
      }
      localStorage.setItem('token', userData.token);
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      return { success: true, user: userData };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.error || 'Login failed' 
      };
    }
  };

  const register = async (userDataInput) => {
    try {
      const normalized = {
        ...userDataInput,
        email: userDataInput.email ? userDataInput.email.trim().toLowerCase() : ''
      };
      const response = await authAPI.register(normalized);
      const userData = response.data;
      if (userData && userData.role) {
        userData.role = userData.role.toLowerCase().trim();
      }
      localStorage.setItem('token', userData.token);
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      return { success: true, user: userData };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.error || 'Registration failed' 
      };
    }
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch (e) {
      // Ignore network errors on logout
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const updateUser = (updatedData) => {
    setUser(prev => {
      const merged = prev ? { ...prev, ...updatedData } : updatedData;
      if (merged && merged.role) {
        merged.role = merged.role.toLowerCase().trim();
      }
      localStorage.setItem('user', JSON.stringify(merged));
      return merged;
    });
  };

  const role = (user?.role || '').toLowerCase().trim();
  const isCustomer = role === 'customer';
  const isAdmin = role === 'admin';
  const isStaff = ['admin', 'staff', 'manager', 'finance', 'housekeeping', 'maintenance'].includes(role);

  const value = {
    user,
    role,
    loading,
    login,
    register,
    logout,
    updateUser,
    isAuthenticated: !!user,
    isAdmin,
    isCustomer,
    isStaff
  };

  if (loading) {
    return (
      <div 
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--c-forest-deep, #0B2B26)',
          color: '#FDFCF7',
          fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif"
        }}
      >
        <div 
          className="spinner" 
          style={{ 
            width: '42px', 
            height: '42px', 
            border: '3px solid rgba(197, 160, 89, 0.25)', 
            borderTopColor: 'var(--c-brass, #C5A059)', 
            borderRadius: '50%', 
            animation: 'spin 0.8s linear infinite' 
          }} 
        />
        <div style={{ marginTop: '1.25rem', fontSize: '0.95rem', letterSpacing: '0.04em', color: '#E2E8F0', fontWeight: 500 }}>
          Restoring your session...
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
// frontend/src/pages/Login.js
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import { 
  FaEnvelope, 
  FaLock, 
  FaEye, 
  FaEyeSlash, 
  FaArrowRight, 
  FaShieldAlt, 
  FaExclamationCircle,
  FaMapMarkerAlt
} from 'react-icons/fa';

import { authContent } from '../config/authImages';
import './Login.css';

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const content = authContent.login;

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    if (errorMessage) {
      setErrorMessage('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanEmail = (formData.email || '').trim().toLowerCase();
    const cleanPassword = formData.password;

    if (!cleanEmail || !cleanPassword) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    setLoading(true);

    const result = await login({ email: cleanEmail, password: cleanPassword });
    
    if (result.success) {
      sessionStorage.setItem('serendib_show_login_welcome', 'true');
      toast.success('Welcome back to Serendib Sanctuary.');
      const userRole = (result.user?.role || '').toLowerCase().trim();
      if (userRole === 'customer') {
        navigate('/');
      } else if (userRole === 'super_admin') {
        navigate('/super-admin/dashboard');
      } else {
        navigate('/admin-dashboard');
      }
    } else {
      const errorText = result.error || 'Unable to sign in. Please verify your credentials.';
      setErrorMessage(errorText);
      toast.error(errorText);
    }
    
    setLoading(false);
  };

  const handleForgotPassword = () => {
    toast.info('To reset your credentials, please contact the sanctuary front desk or concierge.');
  };

  return (
    <div className="auth-page-root layout-login">
      {/* ----------------------------------------------------
          Left Pane: Editorial Sri Lankan Photography (Desktop)
          ---------------------------------------------------- */}
      <div className="auth-photo-pane">
        <div 
          className="auth-photo-bg"
          style={{ backgroundImage: `url(${content.image})` }}
          aria-hidden="true"
        />
        <div className="auth-photo-overlay" aria-hidden="true" />
        <div className="auth-gold-accent-flare" aria-hidden="true" />

        {/* Top Header */}
        <div className="auth-photo-header">
          <Link to="/" className="auth-photo-brand">
            <div className="auth-photo-emblem" aria-hidden="true">🇱🇰</div>
            <div className="auth-photo-brand-text">
              <span className="auth-photo-brand-name">Serendib Sanctuary</span>
              <span className="auth-photo-brand-tagline">Hotels & Resorts • Sri Lanka</span>
            </div>
          </Link>
        </div>

        {/* Bottom Caption Card */}
        <div className="auth-photo-footer">
          <div className="auth-caption-card">
            <span className="auth-caption-eyebrow">
              {content.eyebrow}
            </span>
            <h2 className="auth-caption-title">
              {content.title}
            </h2>
            <p className="auth-caption-quote">
              &ldquo;{content.quote}&rdquo;
            </p>
            <div className="auth-caption-location">
              <FaMapMarkerAlt size={12} />
              <span>{content.location}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------
          Right Pane: Clean Authentication Form
          ---------------------------------------------------- */}
      <div className="auth-form-pane">
        {/* Return to Sanctuary Link */}
        <Link to="/" className="auth-back-link">
          &larr; Back to Hotel
        </Link>

        <div className="auth-form-card">
          {/* Brand Heading */}
          <div className="auth-form-brand">
            <h3 className="auth-form-brand-title">Serendib Sanctuary</h3>
            <div className="auth-form-brand-sub">Sri Lanka • Guest Sign In</div>
          </div>

          <h1 className="auth-heading">Welcome Back</h1>
          <p className="auth-subheading">
            Sign in to continue your journey with us.
          </p>

          {/* Inline Error Banner */}
          {errorMessage && (
            <div className="auth-error-banner" role="alert">
              <FaExclamationCircle />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Email Address Field */}
            <div className="auth-field-group">
              <label className="auth-field-label" htmlFor="login-email">
                <span>Email Address <span className="req-star">*</span></span>
              </label>
              <div className="auth-input-wrapper">
                <FaEnvelope className="auth-input-icon" aria-hidden="true" />
                <input
                  id="login-email"
                  type="email"
                  name="email"
                  className="auth-input"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  autoFocus
                  placeholder="guest@serendib.com"
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="auth-field-group">
              <label className="auth-field-label" htmlFor="login-password">
                <span>Password <span className="req-star">*</span></span>
              </label>
              <div className="auth-input-wrapper">
                <FaLock className="auth-input-icon" aria-hidden="true" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  className="auth-input"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>

            {/* Options Bar: Remember Me & Forgot Password */}
            <div className="auth-options-bar">
              <label className="auth-checkbox-label">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Remember me</span>
              </label>

              <button
                type="button"
                className="auth-forgot-btn"
                onClick={handleForgotPassword}
              >
                Forgot Password?
              </button>
            </div>

            {/* Primary Action Button: SIGN IN */}
            <button 
              type="submit" 
              className="auth-submit-btn" 
              disabled={loading}
              id="login-submit-button"
            >
              {loading ? (
                <>
                  <span className="auth-spinner" aria-hidden="true" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <FaArrowRight size={13} aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          {/* Navigation Prompt: Switch to Create Account */}
          <div className="auth-switch-prompt">
            Don&apos;t have an account?
            <Link to="/register" className="auth-switch-link">
              CREATE ACCOUNT
            </Link>
          </div>

          {/* Trust & Security Stamp */}
          <div className="auth-security-stamp">
            <FaShieldAlt aria-hidden="true" />
            <span>256-Bit SSL Encrypted • Direct Guest Reservation Protection</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;

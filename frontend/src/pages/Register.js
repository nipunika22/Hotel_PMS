// frontend/src/pages/Register.js
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import { 
  FaUser, 
  FaEnvelope, 
  FaLock, 
  FaPhone, 
  FaEye, 
  FaEyeSlash, 
  FaArrowRight, 
  FaShieldAlt, 
  FaExclamationCircle,
  FaMapMarkerAlt
} from 'react-icons/fa';

import { authContent } from '../config/authImages';
import './Login.css';

const Register = () => {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    agreeTerms: true
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const content = authContent.register;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    if (errorMessage) {
      setErrorMessage('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!formData.firstName.trim()) {
      setErrorMessage('Please enter your first name.');
      return;
    }

    if (!formData.email.trim()) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (!formData.phone.trim()) {
      setErrorMessage('Please enter your contact phone number.');
      return;
    }

    if (formData.password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify your password entry.');
      return;
    }

    if (!formData.agreeTerms) {
      setErrorMessage('Please agree to the Terms & Conditions to complete account registration.');
      return;
    }

    setLoading(true);

    const fullName = `${formData.firstName.trim()} ${formData.lastName.trim()}`.trim();

    const registrationPayload = {
      name: fullName,
      email: formData.email.trim().toLowerCase(),
      phone: formData.phone.trim(),
      password: formData.password
    };

    const result = await register(registrationPayload);

    if (result.success) {
      sessionStorage.setItem('serendib_show_login_welcome', 'true');
      toast.success('Your guest account has been created. Welcome to Serendib Sanctuary!');
      navigate('/');
    } else {
      const errorText = result.error || 'Failed to create your account. Please check your information.';
      setErrorMessage(errorText);
      toast.error(errorText);
    }

    setLoading(false);
  };

  return (
    <div className="auth-page-root layout-register">
      {/* ----------------------------------------------------
          Left Pane (Desktop): Clean Registration Form
          (Form on Left, Image on Right creates elegant variation)
          ---------------------------------------------------- */}
      <div className="auth-form-pane">
        {/* Back to Hotel Navigation Link */}
        <Link to="/" className="auth-back-link">
          &larr; Back to Hotel
        </Link>

        <div className="auth-form-card" style={{ maxWidth: '480px' }}>
          {/* Brand Heading */}
          <div className="auth-form-brand">
            <h3 className="auth-form-brand-title">Serendib Sanctuary</h3>
            <div className="auth-form-brand-sub">Sri Lanka • Create Account</div>
          </div>

          <h1 className="auth-heading">Create Your Account</h1>
          <p className="auth-subheading">
            Begin your journey with us.
          </p>

          {/* Inline Error Alert */}
          {errorMessage && (
            <div className="auth-error-banner" role="alert">
              <FaExclamationCircle />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* First & Last Name Grid */}
            <div className="auth-field-grid">
              <div className="auth-field-group">
                <label className="auth-field-label" htmlFor="reg-first-name">
                  <span>First Name <span className="req-star">*</span></span>
                </label>
                <div className="auth-input-wrapper">
                  <FaUser className="auth-input-icon" aria-hidden="true" />
                  <input
                    id="reg-first-name"
                    type="text"
                    name="firstName"
                    className="auth-input"
                    value={formData.firstName}
                    onChange={handleChange}
                    required
                    placeholder="Maya"
                    autoComplete="given-name"
                  />
                </div>
              </div>

              <div className="auth-field-group">
                <label className="auth-field-label" htmlFor="reg-last-name">
                  <span>Last Name</span>
                </label>
                <div className="auth-input-wrapper">
                  <input
                    id="reg-last-name"
                    type="text"
                    name="lastName"
                    className="auth-input"
                    style={{ paddingLeft: '1rem' }}
                    value={formData.lastName}
                    onChange={handleChange}
                    placeholder="Senanayake"
                    autoComplete="family-name"
                  />
                </div>
              </div>
            </div>

            {/* Email Address Field */}
            <div className="auth-field-group">
              <label className="auth-field-label" htmlFor="reg-email">
                <span>Email Address <span className="req-star">*</span></span>
              </label>
              <div className="auth-input-wrapper">
                <FaEnvelope className="auth-input-icon" aria-hidden="true" />
                <input
                  id="reg-email"
                  type="email"
                  name="email"
                  className="auth-input"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  placeholder="maya@example.com"
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Contact Phone Field */}
            <div className="auth-field-group">
              <label className="auth-field-label" htmlFor="reg-phone">
                <span>Phone Number <span className="req-star">*</span></span>
              </label>
              <div className="auth-input-wrapper">
                <FaPhone className="auth-input-icon" aria-hidden="true" />
                <input
                  id="reg-phone"
                  type="tel"
                  name="phone"
                  className="auth-input"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                  placeholder="+94 77 123 4567"
                  autoComplete="tel"
                />
              </div>
            </div>

            {/* Password & Confirm Password Grid */}
            <div className="auth-field-grid">
              <div className="auth-field-group">
                <label className="auth-field-label" htmlFor="reg-password">
                  <span>Password <span className="req-star">*</span></span>
                </label>
                <div className="auth-input-wrapper">
                  <FaLock className="auth-input-icon" aria-hidden="true" />
                  <input
                    id="reg-password"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    className="auth-input"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    placeholder="Min 6 chars"
                    autoComplete="new-password"
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

              <div className="auth-field-group">
                <label className="auth-field-label" htmlFor="reg-confirm-password">
                  <span>Confirm <span className="req-star">*</span></span>
                </label>
                <div className="auth-input-wrapper">
                  <FaLock className="auth-input-icon" aria-hidden="true" />
                  <input
                    id="reg-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    className="auth-input"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
                    placeholder="Repeat password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    title={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </div>
            </div>

            {/* Terms and Conditions Checkbox */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label className="auth-checkbox-label">
                <input
                  type="checkbox"
                  name="agreeTerms"
                  checked={formData.agreeTerms}
                  onChange={handleChange}
                />
                <span>I agree to the Terms & Conditions and Guest Privacy Policy</span>
              </label>
            </div>

            {/* Primary Action Button: CREATE ACCOUNT */}
            <button 
              type="submit" 
              className="auth-submit-btn" 
              disabled={loading}
              id="register-submit-button"
            >
              {loading ? (
                <>
                  <span className="auth-spinner" aria-hidden="true" />
                  <span>Creating account...</span>
                </>
              ) : (
                <>
                  <span>Create Account</span>
                  <FaArrowRight size={13} aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          {/* Navigation Prompt: Switch to Sign In */}
          <div className="auth-switch-prompt">
            Already have an account?
            <Link to="/login" className="auth-switch-link">
              SIGN IN
            </Link>
          </div>

          {/* Trust & Security Stamp */}
          <div className="auth-security-stamp">
            <FaShieldAlt aria-hidden="true" />
            <span>256-Bit SSL Encrypted • Direct Guest Reservation Protection</span>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------
          Right Pane (Desktop): Editorial Sri Lankan Photography
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
    </div>
  );
};

export default Register;
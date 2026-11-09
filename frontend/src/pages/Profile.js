// frontend/src/pages/Profile.js
import React, { useState, useEffect } from 'react';
import { 
  FaUser, 
  FaEnvelope, 
  FaPhone, 
  FaMapMarkerAlt, 
  FaLock, 
  FaShieldAlt, 
  FaSave, 
  FaKey,
  FaCalendarAlt
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import { toast } from 'react-toastify';
import { format } from 'date-fns';

const Profile = () => {
  const { user, updateUser } = useAuth();

  // Profile form state
  const [profileData, setProfileData] = useState({
    name: '',
    email: '',
    phone: '',
    address: ''
  });
  const [profileLoading, setProfileLoading] = useState(false);

  // Password form state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: ''
  });
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setProfileData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        address: user.address || ''
      });
    }
  }, [user]);

  const handleProfileChange = (e) => {
    setProfileData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handlePasswordChange = (e) => {
    setPasswordData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileLoading(true);

    try {
      const response = await authAPI.updateProfile({
        name: profileData.name,
        phone: profileData.phone,
        address: profileData.address
      });

      if (updateUser) {
        updateUser(response.data);
      }
      toast.success('Profile updated successfully!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();

    if (passwordData.newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmNewPassword) {
      toast.error('New passwords do not match');
      return;
    }

    setPasswordLoading(true);

    try {
      await authAPI.changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      });

      toast.success('Password changed successfully!');
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: ''
      });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  };

  const memberSince = user?.createdAt 
    ? format(new Date(user.createdAt), 'MMMM d, yyyy')
    : 'N/A';

  return (
    <div className="content-wrapper">
      <div className="dashboard-greeting">
        <h1>My Profile</h1>
        <p>Manage your personal account details and security settings.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-6)' }}>
        {/* Left Column: Account Overview & Edit Profile */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Account Overview Badge Card */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <FaUser /> Account Overview
              </h2>
            </div>
            <div className="card-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'var(--color-primary)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                  fontWeight: 'bold'
                }}>
                  {user?.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U'}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{user?.name}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <span className="badge badge-info" style={{ textTransform: 'capitalize' }}>
                      <FaShieldAlt style={{ marginRight: '0.25rem' }} />
                      Role: {user?.role || 'Customer'} (Read-Only)
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Email:</span>
                  <span style={{ fontWeight: 500 }}>{user?.email}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Phone:</span>
                  <span style={{ fontWeight: 500 }}>{user?.phone || 'Not provided'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Address:</span>
                  <span style={{ fontWeight: 500 }}>{user?.address || 'Not provided'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.25rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Member Since:</span>
                  <span style={{ fontWeight: 500 }}>{memberSince}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Edit Profile Form */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <FaUser /> Edit Personal Details
              </h2>
            </div>
            <div className="card-body">
              <form onSubmit={handleProfileSubmit}>
                <div className="form-group">
                  <label className="form-label" htmlFor="profile-name">Full Name</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="profile-name"
                      type="text"
                      name="name"
                      className="form-control"
                      value={profileData.name}
                      onChange={handleProfileChange}
                      required
                      placeholder="Your full name"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="profile-email">Email Address (Read-Only)</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="profile-email"
                      type="email"
                      name="email"
                      className="form-control"
                      value={profileData.email}
                      disabled
                      style={{ background: '#f1f5f9', cursor: 'not-allowed', color: '#64748b' }}
                    />
                  </div>
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                    Email is linked to your login identity and cannot be edited.
                  </small>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="profile-phone">Phone Number</label>
                  <input
                    id="profile-phone"
                    type="tel"
                    name="phone"
                    className="form-control"
                    value={profileData.phone}
                    onChange={handleProfileChange}
                    required
                    placeholder="e.g. +1 555-0199"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="profile-address">Address</label>
                  <textarea
                    id="profile-address"
                    name="address"
                    className="form-control"
                    rows="3"
                    value={profileData.address}
                    onChange={handleProfileChange}
                    placeholder="Street, City, Country"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">System Role</label>
                  <input
                    type="text"
                    className="form-control"
                    value={user?.role || 'Customer'}
                    disabled
                    style={{ background: '#f1f5f9', cursor: 'not-allowed', color: '#64748b', textTransform: 'capitalize' }}
                  />
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                    Role is assigned by administration and is strictly read-only.
                  </small>
                </div>

                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={profileLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <FaSave />
                  {profileLoading ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Right Column: Security & Change Password */}
        <div>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <FaLock style={{ color: 'var(--color-primary)' }} />
                Change Password
              </h2>
            </div>
            <div className="card-body">
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                Ensure your account is using a secure password. You must verify your current password before setting a new one.
              </p>

              <form onSubmit={handlePasswordSubmit}>
                <div className="form-group">
                  <label className="form-label" htmlFor="current-password">Current Password</label>
                  <input
                    id="current-password"
                    type="password"
                    name="currentPassword"
                    className="form-control"
                    value={passwordData.currentPassword}
                    onChange={handlePasswordChange}
                    required
                    placeholder="Enter current password"
                    autoComplete="current-password"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="new-password">New Password</label>
                  <input
                    id="new-password"
                    type="password"
                    name="newPassword"
                    className="form-control"
                    value={passwordData.newPassword}
                    onChange={handlePasswordChange}
                    required
                    minLength="6"
                    placeholder="Min 6 characters"
                    autoComplete="new-password"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="confirm-new-password">Confirm New Password</label>
                  <input
                    id="confirm-new-password"
                    type="password"
                    name="confirmNewPassword"
                    className="form-control"
                    value={passwordData.confirmNewPassword}
                    onChange={handlePasswordChange}
                    required
                    placeholder="Repeat new password"
                    autoComplete="new-password"
                  />
                </div>

                <button 
                  type="submit" 
                  className="btn btn-warning"
                  disabled={passwordLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', justifyContent: 'center' }}
                >
                  <FaKey />
                  {passwordLoading ? 'Updating Password...' : 'Update Password'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;

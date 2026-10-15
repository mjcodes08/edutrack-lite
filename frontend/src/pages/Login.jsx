import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [roleMode, setRoleMode] = useState('STUDENT'); // 'STUDENT' or 'ADMIN'
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, logout } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!identifier.trim() || !password.trim()) {
      setError(`Please enter your ${roleMode === 'ADMIN' ? 'Admin ID / Email' : 'Student ID / Email'} and Password.`);
      return;
    }

    setLoading(true);
    try {
      const loggedUser = await login(identifier.trim(), password.trim());

      // Role verification against selected login mode
      if (roleMode === 'ADMIN') {
        if (loggedUser.role !== 'ADMIN') {
          await logout();
          setError('Access Denied: Account does not have administrator privileges. Please use Student Login.');
          return;
        }
        navigate('/admin');
      } else {
        // Student login selected
        if (loggedUser.role === 'ADMIN') {
          // If an admin logs in via Student mode, safely redirect to admin console
          navigate('/admin');
        } else {
          navigate('/dashboard');
        }
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemoStudent = () => {
    setRoleMode('STUDENT');
    setIdentifier('STU101');
    setPassword('StudentPassword123!');
    setError('');
  };

  const fillDemoAdmin = () => {
    setRoleMode('ADMIN');
    setIdentifier('admin@edutrack.edu');
    setPassword('AdminPassword123!');
    setError('');
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <div className="brand-icon">E</div>
            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)' }}>EduTrack</span>
          </div>
          <h1>{roleMode === 'ADMIN' ? 'Admin Login' : 'Student Login'}</h1>
          <p>
            {roleMode === 'ADMIN'
              ? 'Administrator console for student records & academics'
              : 'Access your academic records and Smart Attendance Planner'}
          </p>
        </div>

        {/* Role Selection Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', background: 'var(--bg-card-subtle)', padding: '4px', borderRadius: 'var(--radius-md)' }}>
          <button
            type="button"
            className={`btn btn-sm ${roleMode === 'STUDENT' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, border: 'none' }}
            onClick={() => {
              setRoleMode('STUDENT');
              setError('');
            }}
          >
            👨‍🎓 Student Login
          </button>
          <button
            type="button"
            className={`btn btn-sm ${roleMode === 'ADMIN' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, border: 'none' }}
            onClick={() => {
              setRoleMode('ADMIN');
              setError('');
            }}
          >
            🔐 Admin Login
          </button>
        </div>

        {error && (
          <div className="alert alert-danger" role="alert">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="identifier">
              {roleMode === 'ADMIN' ? 'Admin ID or Email Address' : 'Student ID or College Email'}
            </label>
            <input
              id="identifier"
              type="text"
              className="form-input"
              placeholder={roleMode === 'ADMIN' ? 'e.g. ADMIN001 or admin@edutrack.edu' : 'e.g. STU101 or john.doe@edutrack.edu'}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <label className="form-label" htmlFor="password" style={{ marginBottom: 0 }}>
                Password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary)',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  padding: 0,
                  fontWeight: 600,
                }}
              >
                {showPassword ? '👁 Hide Password' : '🔒 Show Password'}
              </button>
            </div>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              className="form-input"
              placeholder="Enter your registered password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem' }}
            disabled={loading}
          >
            {loading ? 'Authenticating...' : roleMode === 'ADMIN' ? 'Login as Administrator' : 'Login as Student'}
          </button>
        </form>

        {roleMode === 'STUDENT' && (
          <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.875rem' }}>
            New student?{' '}
            <Link to="/register" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
              Register here
            </Link>
          </div>
        )}

        <div className="demo-credentials-box">
          <div style={{ fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-main)' }}>
            Viva Quick-Fill Credentials:
          </div>
          <div>Student: <code>STU101</code> / <code>StudentPassword123!</code></div>
          <div>Admin: <code>admin@edutrack.edu</code> / <code>AdminPassword123!</code></div>
          <div className="demo-btn-group">
            <button type="button" onClick={fillDemoStudent} className="btn btn-secondary btn-sm" style={{ flex: 1 }}>
              Fill Student
            </button>
            <button type="button" onClick={fillDemoAdmin} className="btn btn-secondary btn-sm" style={{ flex: 1 }}>
              Fill Admin
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

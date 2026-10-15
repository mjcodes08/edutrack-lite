import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';

export default function StudentDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const getInitialTab = () => {
    if (location.pathname === '/assignments') return 'assignments';
    if (location.pathname === '/marks-attendance') return 'attendance';
    if (location.pathname === '/profile') return 'profile';
    return 'overview';
  };

  // Navigation tab state
  const [activeTab, setActiveTab] = useState(getInitialTab);

  useEffect(() => {
    if (location.pathname === '/assignments') setActiveTab('assignments');
    else if (location.pathname === '/marks-attendance') setActiveTab('attendance');
    else if (location.pathname === '/profile') setActiveTab('profile');
    else if (location.pathname === '/dashboard') setActiveTab('overview');
  }, [location.pathname]);

  // Core Data States
  const [summary, setSummary] = useState(null);
  const [attendanceList, setAttendanceList] = useState([]);
  const [marksList, setMarksList] = useState([]);
  const [assignmentList, setAssignmentList] = useState([]);
  const [profileData, setProfileData] = useState(null);

  // Loading & Feedback
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modals & Details
  const [detailModal, setDetailModal] = useState({ isOpen: false, type: '', data: null });

  // Attendance Filters
  const [attendanceSubjectFilter, setAttendanceSubjectFilter] = useState('ALL');

  // Assignment Filters & Search
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState('ALL');
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [updatingAssignmentId, setUpdatingAssignmentId] = useState(null);

  // Assignment Submission States
  const [selectedFile, setSelectedFile] = useState(null);
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [showSubmitForm, setShowSubmitForm] = useState(false);

  // Smart Attendance Planner States (MAIN USP)
  const [plannerSubjectId, setPlannerSubjectId] = useState('');
  const [targetPercentage, setTargetPercentage] = useState('75');
  const [projectFutureCount, setProjectFutureCount] = useState('5');
  const [plannerResult, setPlannerResult] = useState(null);
  const [projectionResult, setProjectionResult] = useState(null);

  // Fetch all initial data for authenticated student
  useEffect(() => {
    fetchAllStudentData();
  }, []);

  const fetchAllStudentData = async () => {
    setLoading(true);
    setError('');
    try {
      const [sumRes, attRes, markRes, assignRes, profRes] = await Promise.all([
        api.get('/student/dashboard').catch(() => null),
        api.get('/student/attendance').catch(() => null),
        api.get('/student/marks').catch(() => null),
        api.get('/student/assignments').catch(() => null),
        api.get('/student/profile').catch(() => null),
      ]);

      if (sumRes && sumRes.success) setSummary(sumRes.data);
      if (attRes && attRes.success) {
        setAttendanceList(attRes.data || []);
        if (attRes.data && attRes.data.length > 0 && !plannerSubjectId) {
          setPlannerSubjectId(String(attRes.data[0].subjectId));
        }
      }
      if (markRes && markRes.success) setMarksList(markRes.data || []);
      if (assignRes && assignRes.success) setAssignmentList(assignRes.data || []);
      if (profRes && profRes.success) setProfileData(profRes.data);
    } catch (err) {
      setError(err.message || 'Error fetching student data from database.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshAttendance = async () => {
    setError('');
    try {
      const res = await api.get('/student/attendance');
      if (res && res.success) {
        setAttendanceList(res.data || []);
        setSuccess('Attendance records refreshed!');
        setTimeout(() => setSuccess(''), 2500);
      }
    } catch (err) {
      setError(err.message || 'Failed to refresh attendance.');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // ========================================================
  // SMART ATTENDANCE PLANNER LOGIC (MAIN USP)
  // Let:
  //   A = classes attended
  //   C = total classes conducted
  //   T = target attendance as a decimal (e.g. 0.75 for 75%)
  //   x = additional consecutive classes attended
  // Condition: (A + x) / (C + x) >= T
  // => x * (1 - T) >= T * C - A
  // => x = ceil((T * C - A) / (1 - T))
  // ========================================================
  const handleCalculatePlanner = (e) => {
    if (e) e.preventDefault();
    setError('');

    const targetNum = parseFloat(targetPercentage);
    if (isNaN(targetNum) || targetNum <= 0 || targetNum > 100) {
      setError('Please enter a valid attendance target between 1% and 100%.');
      return;
    }

    const selectedAtt = attendanceList.find(
      (a) => String(a.subjectId) === String(plannerSubjectId)
    );

    if (!selectedAtt) {
      setError('Please select a valid subject.');
      return;
    }

    const A = selectedAtt.classesAttended || 0;
    const C = selectedAtt.totalClasses || 0;
    const currentPct = C > 0 ? (A / C) * 100 : 0;
    const T = targetNum / 100;

    let result = {
      subjectName: selectedAtt.subjectName,
      subjectCode: selectedAtt.subjectCode,
      classesAttended: A,
      totalClasses: C,
      currentPercentage: currentPct.toFixed(1),
      target: targetNum,
      status: '', // 'ZERO_CLASSES', 'ALREADY_MET', 'NEEDS_CLASSES', 'IMPOSSIBLE'
      consecutiveNeeded: 0,
      safeMissCount: 0,
      message: '',
    };

    if (C === 0) {
      result.status = 'ZERO_CLASSES';
      result.message = 'No classes have been conducted yet for this subject. Attend the first scheduled class to maintain 100% attendance.';
    } else if (currentPct >= targetNum) {
      result.status = 'ALREADY_MET';
      // Safe miss calculation: A / (C + y) >= T => C + y <= A / T => y = floor(A / T - C)
      const maxMiss = Math.floor(A / T - C);
      result.safeMissCount = Math.max(0, maxMiss);
      result.message = `Target reached! Your current attendance (${currentPct.toFixed(1)}%) already satisfies the ${targetNum}% threshold.`;
    } else {
      // Current attendance is below target
      if (T >= 1.0) {
        // Target is 100% but student has already missed classes (A < C)
        result.status = 'IMPOSSIBLE';
        result.message = `A 100% attendance target cannot be reached because ${C - A} class(es) have already been missed.`;
      } else {
        const numerator = T * C - A;
        const denominator = 1 - T;
        const x = Math.ceil(numerator / denominator);
        result.status = 'NEEDS_CLASSES';
        result.consecutiveNeeded = Math.max(0, x);
        result.message = `You must attend the next ${result.consecutiveNeeded} consecutive class${result.consecutiveNeeded === 1 ? '' : 'es'} without missing any to reach ${targetNum}%.`;
      }
    }

    setPlannerResult(result);
  };

  const handleProjectClasses = (e) => {
    if (e) e.preventDefault();
    setError('');

    const futureN = parseInt(projectFutureCount, 10);
    if (isNaN(futureN) || futureN <= 0) {
      setError('Please enter a positive number of future classes to project.');
      return;
    }

    const selectedAtt = attendanceList.find(
      (a) => String(a.subjectId) === String(plannerSubjectId)
    );

    if (!selectedAtt) {
      setError('Please select a subject to project.');
      return;
    }

    const A = selectedAtt.classesAttended || 0;
    const C = selectedAtt.totalClasses || 0;

    const attendAllPct = (((A + futureN) / (C + futureN)) * 100).toFixed(1);
    const missAllPct = ((A / (C + futureN)) * 100).toFixed(1);

    setProjectionResult({
      futureN,
      attendAllPct,
      missAllPct,
      newTotalClasses: C + futureN,
      newAttendedIfAttended: A + futureN,
    });
  };

  const handleResetPlanner = () => {
    setTargetPercentage('75');
    setProjectFutureCount('5');
    setPlannerResult(null);
    setProjectionResult(null);
    setError('');
  };

  // Toggle Assignment Status
  const handleToggleAssignmentStatus = async (assignmentId, currentStatus) => {
    setUpdatingAssignmentId(assignmentId);
    setError('');
    const newStatus = currentStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    try {
      const res = await api.patch(`/student/assignments/${assignmentId}/status`, {
        status: newStatus,
      });
      if (res && res.success) {
        setAssignmentList((prev) =>
          prev.map((a) => (a.id === assignmentId ? { ...a, status: newStatus } : a))
        );
        // Refresh dashboard summary counts
        api.get('/student/dashboard').then((r) => {
          if (r && r.success) setSummary(r.data);
        });
        setSuccess(`Assignment marked as ${newStatus}!`);
        setTimeout(() => setSuccess(''), 2500);
      }
    } catch (err) {
      setError(err.message || 'Failed to update assignment status.');
    } finally {
      setUpdatingAssignmentId(null);
    }
  };

  // Format bytes into readable file size (KB / MB)
  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Format submission date/time
  const formatDateTime = (dtStr) => {
    if (!dtStr) return 'N/A';
    try {
      const d = new Date(dtStr);
      return isNaN(d.getTime()) ? dtStr : d.toLocaleString();
    } catch (e) {
      return dtStr;
    }
  };

  // Validate and select file for assignment submission
  const handleFileSelect = (e) => {
    setUploadError('');
    const file = e.target.files && e.target.files[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const allowedExtensions = ['.pdf', '.doc', '.docx'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      setUploadError('Invalid file type! Only PDF, DOC, and DOCX documents are allowed.');
      e.target.value = '';
      setSelectedFile(null);
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10 MB limit
    if (file.size > maxSize) {
      setUploadError(`File exceeds maximum size limit of 10 MB (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
      e.target.value = '';
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  // Upload student assignment file to Spring Boot backend
  const handleFileUpload = async (assignmentId) => {
    if (!selectedFile) {
      setUploadError('Please choose a file to submit.');
      return;
    }

    setIsSubmitting(true);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (submissionNotes && submissionNotes.trim()) {
        formData.append('notes', submissionNotes.trim());
      }

      const res = await fetch(`/api/student/assignments/${assignmentId}/submit`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to submit assignment');
      }

      // Refresh student assignments and dashboard summary
      const [assignRes, sumRes] = await Promise.all([
        api.get('/student/assignments'),
        api.get('/student/dashboard'),
      ]);

      if (assignRes && assignRes.success) {
        setAssignmentList(assignRes.data || []);
        const updated = (assignRes.data || []).find((a) => a.id === assignmentId);
        if (updated) {
          setDetailModal((prev) => ({ ...prev, data: updated }));
        }
      }
      if (sumRes && sumRes.success) {
        setSummary(sumRes.data);
      }

      setShowSubmitForm(false);
      setSelectedFile(null);
      setSubmissionNotes('');
      setSuccess('Assignment submitted successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setUploadError(err.message || 'Submission failed. Please check file format and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Securely download student's submitted file
  const handleDownloadSubmission = async (assignmentId, filename) => {
    try {
      const res = await fetch(`/api/student/assignments/${assignmentId}/download`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to download file');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'assignment_submission';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err.message || 'Error downloading submission file');
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
          Loading your student profile and academic records...
        </p>
      </div>
    );
  }

  // Filtered Attendance List
  const filteredAttendance = attendanceList.filter((a) => {
    if (attendanceSubjectFilter === 'ALL') return true;
    return String(a.subjectId) === String(attendanceSubjectFilter);
  });

  // Filtered & Searched Assignments
  const filteredAssignments = assignmentList.filter((a) => {
    if (assignmentStatusFilter !== 'ALL' && a.status !== assignmentStatusFilter) {
      return false;
    }
    if (assignmentSearch.trim()) {
      const q = assignmentSearch.toLowerCase();
      const matchTitle = (a.title || '').toLowerCase().includes(q);
      const matchSub = (a.subjectName || '').toLowerCase().includes(q) || (a.subjectCode || '').toLowerCase().includes(q);
      return matchTitle || matchSub;
    }
    return true;
  });

  const studentName = summary?.name || profileData?.name || user?.name || 'Student';
  const studentId = summary?.studentId || profileData?.studentId || user?.studentId || 'STU101';
  const branch = summary?.branch || profileData?.branch || user?.branch || 'Engineering';
  const semester = summary?.semester || profileData?.semester || user?.semester || 1;
  const avgMarks = summary?.averageMarks ?? 0;
  const overallAtt = summary?.attendancePercentage ?? 0;
  const pendingCount = summary?.pendingAssignments ?? 0;
  const completedCount = summary?.completedAssignments ?? 0;

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Top Banner */}
      <div className="card" style={{ marginBottom: '1.25rem', background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.25rem' }}>
              <div className="brand-icon">E</div>
              <h1 style={{ fontSize: '1.65rem' }}>Student Portal</h1>
              <span className="badge badge-info">{studentId}</span>
              <span className={`badge ${overallAtt >= 75 ? 'badge-success' : 'badge-danger'}`}>
                {overallAtt >= 75 ? 'Eligible (>=75%)' : 'Attendance Shortage'}
              </span>
            </div>
            <p style={{ fontSize: '0.875rem' }}>
              Welcome back, <strong>{studentName}</strong> &bull; Dept: <strong>{branch}</strong> &bull; Semester: <strong>Sem {semester}</strong>
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={fetchAllStudentData} className="btn btn-secondary btn-sm" title="Refresh all records">
              ↻ Refresh
            </button>
            <button onClick={handleLogout} className="btn btn-outline-danger btn-sm" title="End student session">
              🚪 Logout
            </button>
          </div>
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="alert alert-danger" role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')} className="btn btn-sm" style={{ background: 'transparent', border: 'none', color: 'inherit' }}>✕</button>
        </div>
      )}

      {success && (
        <div className="alert alert-success" role="alert">
          <span>{success}</span>
          <button onClick={() => setSuccess('')} className="btn btn-sm" style={{ background: 'transparent', border: 'none', color: 'inherit' }}>✕</button>
        </div>
      )}

      {/* Navigation Bar / Tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.65rem', overflowX: 'auto' }}>
        <button
          className={`btn ${activeTab === 'overview' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('overview')}
        >
          🏠 Overview
        </button>
        <button
          className={`btn ${activeTab === 'attendance' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('attendance')}
        >
          📅 My Attendance ({attendanceList.length})
        </button>
        <button
          className={`btn ${activeTab === 'planner' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          style={activeTab === 'planner' ? { background: '#2563eb' } : {}}
          onClick={() => setActiveTab('planner')}
        >
          🎯 Smart Attendance Planner (USP)
        </button>
        <button
          className={`btn ${activeTab === 'assignments' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('assignments')}
        >
          📋 Assignments ({assignmentList.length})
        </button>
        <button
          className={`btn ${activeTab === 'progress' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('progress')}
        >
          📊 My Progress
        </button>
        <button
          className={`btn ${activeTab === 'profile' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('profile')}
        >
          👤 My Profile
        </button>
      </div>

      {/* ======================================================== */}
      {/* SECTION A: OVERVIEW                                      */}
      {/* ======================================================== */}
      {activeTab === 'overview' && (
        <div>
          {/* 4 Stat Cards */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-header">
                <span>ATTENDANCE STATUS</span>
                <span>📅</span>
              </div>
              <div className="stat-value" style={{ color: overallAtt >= 75 ? 'var(--success)' : 'var(--danger)' }}>
                {overallAtt}%
              </div>
              <div className="progress-bar-bg">
                <div
                  className={`progress-bar-fill ${overallAtt >= 75 ? 'success' : 'danger'}`}
                  style={{ width: `${Math.min(overallAtt, 100)}%` }}
                />
              </div>
              <div className="stat-subtext" style={{ marginTop: '0.45rem' }}>
                {overallAtt >= 75 ? 'Meets college 75% examination criteria' : '⚠️ Below 75% target — use Smart Planner!'}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <span>AVERAGE MARKS</span>
                <span>📊</span>
              </div>
              <div className="stat-value">{avgMarks}%</div>
              <div className="progress-bar-bg">
                <div
                  className={`progress-bar-fill ${avgMarks >= 75 ? 'success' : avgMarks >= 50 ? 'primary' : 'danger'}`}
                  style={{ width: `${Math.min(avgMarks, 100)}%` }}
                />
              </div>
              <div className="stat-subtext" style={{ marginTop: '0.45rem' }}>
                {avgMarks >= 75 ? 'Distinction' : avgMarks >= 50 ? 'Satisfactory' : 'Needs attention'}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <span>PENDING ASSIGNMENTS</span>
                <span>⏳</span>
              </div>
              <div className="stat-value" style={{ color: pendingCount > 0 ? 'var(--warning)' : 'var(--success)' }}>
                {pendingCount}
              </div>
              <div className="stat-subtext">
                {pendingCount === 0 ? 'All assignments completed!' : `${pendingCount} submission(s) pending`}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <span>COMPLETED ASSIGNMENTS</span>
                <span>✅</span>
              </div>
              <div className="stat-value" style={{ color: 'var(--success)' }}>
                {completedCount}
              </div>
              <div className="stat-subtext">Total verified submissions</div>
            </div>
          </div>

          {/* Feature Highlights & Recent Marks */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
            {/* Smart Planner USP Spotlight */}
            <div className="card" style={{ borderLeft: '4px solid var(--primary)', background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)' }}>
              <div className="card-header">
                <div>
                  <h3 className="card-title">🎯 Smart Attendance Planner</h3>
                  <p style={{ fontSize: '0.8rem' }}>Project's Core Differentiating Feature</p>
                </div>
                <button onClick={() => setActiveTab('planner')} className="btn btn-primary btn-sm">
                  Open Planner &rarr;
                </button>
              </div>
              <p style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
                Calculate the exact minimum number of consecutive classes required to reach your target attendance, or project your percentage across upcoming lectures.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span className="badge badge-info">Target: 75% Default</span>
                <span className="badge badge-success">Consecutive Class Math</span>
              </div>
            </div>

            {/* Quick Profile Summary */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">👤 Student Identification</h3>
                <button onClick={() => setActiveTab('profile')} className="btn btn-secondary btn-sm">
                  View Profile
                </button>
              </div>
              <div style={{ fontSize: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div><strong>Full Name:</strong> {studentName}</div>
                <div><strong>Student ID:</strong> <code>{studentId}</code></div>
                <div><strong>Department:</strong> {branch}</div>
                <div><strong>Current Semester:</strong> Semester {semester}</div>
                <div><strong>Account Role:</strong> <span className="role-pill student">STUDENT</span></div>
              </div>
            </div>
          </div>

          {/* Recent Marks Quick Snapshot */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Recent Marks Snapshot</h3>
              <button onClick={() => setActiveTab('progress')} className="btn btn-secondary btn-sm">
                View Full Progress &rarr;
              </button>
            </div>
            {marksList.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No marks recorded yet.</p>
            ) : (
              <div className="table-responsive">
                <table className="data-table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>Subject Code</th>
                      <th>Subject Name</th>
                      <th>Marks Obtained</th>
                      <th>Max Marks</th>
                      <th>Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marksList.slice(0, 4).map((m) => (
                      <tr key={m.subjectId}>
                        <td><span className="badge badge-info">{m.subjectCode}</span></td>
                        <td>{m.subjectName}</td>
                        <td style={{ fontWeight: 600 }}>{m.marksObtained}</td>
                        <td>{m.maxMarks}</td>
                        <td>
                          <span className={`badge ${m.percentage >= 75 ? 'badge-success' : 'badge-warning'}`}>
                            {m.percentage}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION B: MY ATTENDANCE                                 */}
      {/* ======================================================== */}
      {activeTab === 'attendance' && (
        <div className="card">
          <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 className="card-title">My Subject-wise Attendance</h2>
              <p style={{ fontSize: '0.85rem' }}>Verified attendance records from database</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Subject Filter */}
              <select
                className="form-select"
                style={{ width: 'auto', fontSize: '0.85rem' }}
                value={attendanceSubjectFilter}
                onChange={(e) => setAttendanceSubjectFilter(e.target.value)}
              >
                <option value="ALL">All Subjects ({attendanceList.length})</option>
                {attendanceList.map((a) => (
                  <option key={a.subjectId} value={a.subjectId}>
                    {a.subjectCode} - {a.subjectName}
                  </option>
                ))}
              </select>
              <button onClick={handleRefreshAttendance} className="btn btn-secondary btn-sm" title="Refresh records">
                ↻ Refresh
              </button>
              <button onClick={() => setActiveTab('overview')} className="btn btn-secondary btn-sm">
                &larr; Back to Overview
              </button>
            </div>
          </div>

          {attendanceList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 0' }}>
              <p style={{ color: 'var(--text-muted)' }}>No attendance records found for your student ID.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Subject Code</th>
                    <th>Subject Name</th>
                    <th>Conducted</th>
                    <th>Attended</th>
                    <th>Attendance %</th>
                    <th>Target</th>
                    <th>Progress Indicator</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAttendance.map((a) => {
                    const attended = a.classesAttended || 0;
                    const total = a.totalClasses || 0;
                    const pct = total > 0 ? ((attended / total) * 100).toFixed(1) : 0;
                    const isEligible = pct >= 75;

                    return (
                      <tr key={a.subjectId}>
                        <td>
                          <span className="badge badge-info">{a.subjectCode}</span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{a.subjectName}</td>
                        <td>{total}</td>
                        <td style={{ fontWeight: 600 }}>{attended}</td>
                        <td>
                          <strong style={{ color: isEligible ? 'var(--success)' : 'var(--danger)' }}>
                            {pct}%
                          </strong>
                        </td>
                        <td>75% Target</td>
                        <td style={{ minWidth: 140 }}>
                          <div className="progress-bar-bg" style={{ margin: 0 }}>
                            <div
                              className={`progress-bar-fill ${isEligible ? 'success' : 'danger'}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span style={{ fontSize: '0.72rem', color: isEligible ? 'var(--success)' : 'var(--danger)' }}>
                            {total === 0 ? 'No classes yet' : isEligible ? '● Eligible' : '● Shortage'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                            <button
                              onClick={() => setDetailModal({ isOpen: true, type: 'attendance', data: a })}
                              className="btn btn-secondary btn-sm"
                              title="View full subject breakdown"
                            >
                              View Details
                            </button>
                            <button
                              onClick={() => {
                                setPlannerSubjectId(String(a.subjectId));
                                setActiveTab('planner');
                              }}
                              className="btn btn-primary btn-sm"
                              title="Plan attendance for this subject"
                            >
                              Plan
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION C: SMART ATTENDANCE PLANNER — MAIN USP            */}
      {/* ======================================================== */}
      {activeTab === 'planner' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
          {/* Planner Controls Form */}
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Smart Attendance Planner</h2>
                <p style={{ fontSize: '0.85rem' }}>Calculate consecutive classes needed to satisfy attendance targets</p>
              </div>
              <button onClick={() => setActiveTab('overview')} className="btn btn-secondary btn-sm">
                &larr; Back to Overview
              </button>
            </div>

            {/* Subject Selector */}
            <div className="form-group">
              <label className="form-label">Select Subject</label>
              <select
                className="form-select"
                value={plannerSubjectId}
                onChange={(e) => {
                  setPlannerSubjectId(e.target.value);
                  setPlannerResult(null);
                  setProjectionResult(null);
                }}
              >
                {attendanceList.map((a) => (
                  <option key={a.subjectId} value={a.subjectId}>
                    {a.subjectCode} — {a.subjectName} ({a.classesAttended}/{a.totalClasses} classes, {a.attendancePercentage}%)
                  </option>
                ))}
              </select>
            </div>

            {/* Attendance Target */}
            <div className="form-group">
              <label className="form-label">Required Attendance Target (%)</label>
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                className="form-input"
                placeholder="College Target (e.g. 75)"
                value={targetPercentage}
                onChange={(e) => setTargetPercentage(e.target.value)}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Standard university criteria is 75%. Editable if department specifies a custom threshold.
              </span>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <button onClick={handleCalculatePlanner} className="btn btn-primary btn-sm" style={{ flex: 2 }}>
                🎯 Calculate Consecutive Classes Needed
              </button>
              <button onClick={handleResetPlanner} className="btn btn-secondary btn-sm" style={{ flex: 1 }}>
                ↺ Reset
              </button>
            </div>

            {/* Projection Controls */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.4rem' }}>Project Next Classes</h4>
              <p style={{ fontSize: '0.75rem', marginBottom: '0.75rem' }}>
                Simulate your percentage if you attend vs. miss the next upcoming classes.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="number"
                  min="1"
                  max="50"
                  className="form-input"
                  style={{ width: '100px' }}
                  value={projectFutureCount}
                  onChange={(e) => setProjectFutureCount(e.target.value)}
                />
                <button onClick={handleProjectClasses} className="btn btn-secondary btn-sm" style={{ flex: 1 }}>
                  🔮 Project Next {projectFutureCount} Classes
                </button>
              </div>
            </div>
          </div>

          {/* Planner Results Display */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Planner Output & Estimates</h2>
              <span className="badge badge-info">Formula: (A + x) / (C + x) &gt;= T</span>
            </div>

            {!plannerResult && !projectionResult ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎯</div>
                <h4 style={{ color: 'var(--text-main)', marginBottom: '0.4rem' }}>No Calculation Executed Yet</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Select a subject on the left and click <strong>Calculate Consecutive Classes Needed</strong> to view requirements.
                </p>
              </div>
            ) : (
              <div>
                {/* Result Block */}
                {plannerResult && (
                  <div style={{ marginBottom: '1.5rem', padding: '1rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-card-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span className="badge badge-info">{plannerResult.subjectCode}</span>
                      <span className={`badge ${plannerResult.status === 'ALREADY_MET' ? 'badge-success' : plannerResult.status === 'NEEDS_CLASSES' ? 'badge-warning' : 'badge-danger'}`}>
                        Current: {plannerResult.currentPercentage}%
                      </span>
                    </div>

                    <h3 style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>{plannerResult.subjectName}</h3>

                    <div style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                      Classes Attended: <strong>{plannerResult.classesAttended}</strong> / Conducted: <strong>{plannerResult.totalClasses}</strong>
                    </div>

                    {/* Status Highlights */}
                    {plannerResult.status === 'ALREADY_MET' && (
                      <div className="alert alert-success" style={{ margin: 0 }}>
                        <div>
                          <strong>✓ Attendance Target Satisfied!</strong>
                          <p style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                            {plannerResult.message} You can safely miss up to <strong>{plannerResult.safeMissCount}</strong> upcoming class(es) while staying at or above {plannerResult.target}%.
                          </p>
                        </div>
                      </div>
                    )}

                    {plannerResult.status === 'NEEDS_CLASSES' && (
                      <div className="alert alert-danger" style={{ margin: 0 }}>
                        <div>
                          <div style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.25rem' }}>
                            🚨 {plannerResult.consecutiveNeeded} Additional Consecutive Class(es) Needed
                          </div>
                          <p style={{ fontSize: '0.825rem', marginTop: '0.25rem' }}>
                            {plannerResult.message}
                          </p>
                          <div style={{ fontSize: '0.75rem', marginTop: '0.4rem', color: '#7f1d1d' }}>
                            Verification: ({plannerResult.classesAttended} + {plannerResult.consecutiveNeeded}) / ({plannerResult.totalClasses} + {plannerResult.consecutiveNeeded}) = {(((plannerResult.classesAttended + plannerResult.consecutiveNeeded) / (plannerResult.totalClasses + plannerResult.consecutiveNeeded)) * 100).toFixed(1)}% &gt;= {plannerResult.target}%
                          </div>
                        </div>
                      </div>
                    )}

                    {plannerResult.status === 'ZERO_CLASSES' && (
                      <div className="alert alert-info" style={{ margin: 0 }}>
                        <span>{plannerResult.message}</span>
                      </div>
                    )}

                    {plannerResult.status === 'IMPOSSIBLE' && (
                      <div className="alert alert-danger" style={{ margin: 0 }}>
                        <span>{plannerResult.message}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Projection Block */}
                {projectionResult && (
                  <div style={{ padding: '1rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-card-subtle)' }}>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                      Projection for Next {projectionResult.futureN} Scheduled Classes:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
                      <div style={{ padding: '0.75rem', borderRadius: 'var(--radius-sm)', background: 'var(--success-light)', border: '1px solid #a7f3d0' }}>
                        <div style={{ color: '#065f46', fontWeight: 600 }}>If Attended (100%):</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#065f46' }}>
                          {projectionResult.attendAllPct}%
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#047857' }}>
                          {projectionResult.newAttendedIfAttended} / {projectionResult.newTotalClasses} classes
                        </div>
                      </div>

                      <div style={{ padding: '0.75rem', borderRadius: 'var(--radius-sm)', background: 'var(--danger-light)', border: '1px solid #fecaca' }}>
                        <div style={{ color: '#991b1b', fontWeight: 600 }}>If Missed (0%):</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#991b1b' }}>
                          {projectionResult.missAllPct}%
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#b91c1c' }}>
                          Drops from current percentage
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.85rem' }}>
                  ℹ️ <em>Disclaimer: Predictions are mathematical estimates assuming future classes are strictly attended or missed consecutively. Real outcomes depend on final schedule changes.</em>
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION D: ASSIGNMENTS                                   */}
      {/* ======================================================== */}
      {activeTab === 'assignments' && (
        <div className="card">
          <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 className="card-title">My Assignments & Submissions</h2>
              <p style={{ fontSize: '0.85rem' }}>Track assigned coursework and update submission statuses</p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Search */}
              <input
                type="text"
                className="form-input"
                style={{ width: 180, fontSize: '0.8rem' }}
                placeholder="Search title or subject..."
                value={assignmentSearch}
                onChange={(e) => setAssignmentSearch(e.target.value)}
              />

              {/* Status Filter */}
              <div style={{ display: 'flex', background: 'var(--bg-card-subtle)', borderRadius: 'var(--radius-md)', padding: 2, flexWrap: 'wrap', gap: '2px' }}>
                {['ALL', 'PENDING', 'SUBMITTED', 'LATE', 'COMPLETED', 'OVERDUE'].map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`btn btn-sm ${assignmentStatusFilter === status ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ border: 'none', fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                    onClick={() => setAssignmentStatusFilter(status)}
                  >
                    {status}
                  </button>
                ))}
              </div>

              <button onClick={() => setActiveTab('overview')} className="btn btn-secondary btn-sm">
                &larr; Back to Overview
              </button>
            </div>
          </div>

          {filteredAssignments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 0' }}>
              <p style={{ color: 'var(--text-muted)' }}>No assignments match your search/filter criteria.</p>
              {(assignmentSearch || assignmentStatusFilter !== 'ALL') && (
                <button
                  onClick={() => {
                    setAssignmentSearch('');
                    setAssignmentStatusFilter('ALL');
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: '0.5rem' }}
                >
                  Reset Filters
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
              {filteredAssignments.map((a) => (
                <div key={a.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'var(--bg-card)' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <span className="badge badge-info">{a.subjectCode}</span>
                      <span className={`badge ${
                        a.status === 'SUBMITTED' ? 'badge-success' :
                        a.status === 'LATE' ? 'badge-warning' :
                        a.status === 'COMPLETED' ? 'badge-success' :
                        a.status === 'OVERDUE' ? 'badge-danger' : 'badge-warning'
                      }`}>
                        {a.status === 'SUBMITTED' ? '✓ Submitted' :
                         a.status === 'LATE' ? '⚠️ Late Submission' :
                         a.status === 'COMPLETED' ? '✓ Completed' :
                         a.status === 'OVERDUE' ? '⚠️ Overdue' : '⏳ Pending'}
                      </span>
                    </div>

                    <h3 style={{ fontSize: '1rem', marginBottom: '0.35rem' }}>{a.title}</h3>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                      Subject: {a.subjectName}
                    </div>

                    <p style={{ fontSize: '0.825rem', color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                      {a.description ? (a.description.length > 90 ? `${a.description.substring(0, 90)}...` : a.description) : 'No description provided.'}
                    </p>

                    {a.submittedFilename && (
                      <div style={{ fontSize: '0.75rem', color: '#047857', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem', background: '#ecfdf5', padding: '0.25rem 0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid #a7f3d0' }}>
                        <span>📎</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.submittedFilename}</span>
                      </div>
                    )}
                  </div>

                  <div style={{ paddingTop: '0.65rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Due: <strong>{a.dueDate}</strong>
                    </span>

                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => {
                          setSelectedFile(null);
                          setSubmissionNotes('');
                          setUploadError('');
                          setShowSubmitForm(false);
                          setDetailModal({ isOpen: true, type: 'assignment', data: a });
                        }}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.75rem' }}
                        title="View full assignment details"
                      >
                        View Assignment
                      </button>

                      {(!a.submittedFilename && a.status !== 'SUBMITTED' && a.status !== 'LATE') ? (
                        <button
                          onClick={() => {
                            setSelectedFile(null);
                            setSubmissionNotes('');
                            setUploadError('');
                            setShowSubmitForm(true);
                            setDetailModal({ isOpen: true, type: 'assignment', data: a });
                          }}
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: '0.75rem' }}
                          title="Submit assignment file"
                        >
                          📤 Submit
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDownloadSubmission(a.id, a.submittedFilename)}
                          className="btn btn-outline-primary btn-sm"
                          style={{ fontSize: '0.75rem' }}
                          title="Download submitted file"
                        >
                          📥 Download
                        </button>
                      )}

                      <button
                        onClick={() => handleToggleAssignmentStatus(a.id, a.status)}
                        className={`btn btn-sm ${a.status === 'COMPLETED' ? 'btn-secondary' : 'btn-success'}`}
                        style={{ fontSize: '0.75rem' }}
                        disabled={updatingAssignmentId === a.id}
                      >
                        {updatingAssignmentId === a.id ? 'Saving...' : a.status === 'COMPLETED' ? 'Mark Pending' : '✓ Mark Complete'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION E: MY PROGRESS                                   */}
      {/* ======================================================== */}
      {activeTab === 'progress' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {/* Marks Table */}
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Subject-wise Marks</h2>
                <p style={{ fontSize: '0.85rem' }}>Coursework & examination performance</p>
              </div>
              <button onClick={() => setActiveTab('overview')} className="btn btn-secondary btn-sm">
                &larr; Back to Overview
              </button>
            </div>

            {marksList.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No marks recorded in database.</p>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Marks</th>
                      <th>Max</th>
                      <th>Percentage</th>
                      <th>Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marksList.map((m) => (
                      <tr key={m.subjectId}>
                        <td>
                          <strong>{m.subjectCode}</strong>: {m.subjectName}
                        </td>
                        <td style={{ fontWeight: 600 }}>{m.marksObtained}</td>
                        <td>{m.maxMarks}</td>
                        <td><strong>{m.percentage}%</strong></td>
                        <td>
                          <span className={`badge ${m.percentage >= 75 ? 'badge-success' : m.percentage >= 60 ? 'badge-info' : m.percentage >= 40 ? 'badge-warning' : 'badge-danger'}`}>
                            {m.percentage >= 75 ? 'Distinction' : m.percentage >= 60 ? 'First Class' : m.percentage >= 40 ? 'Pass' : 'Needs Help'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Academic Summary Card */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Academic Standing Summary</h2>
              <span className="badge badge-success">Verified Data</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ padding: '1rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-card-subtle)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>OVERALL AVERAGE SCORE</div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)' }}>
                  {avgMarks}%
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Computed across {marksList.length} enrolled subjects
                </div>
              </div>

              <div style={{ padding: '1rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-card-subtle)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>OVERALL ATTENDANCE</div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: overallAtt >= 75 ? 'var(--success)' : 'var(--danger)' }}>
                  {overallAtt}%
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {overallAtt >= 75 ? 'Eligible for end-semester exams' : '⚠️ Shortage! Attend classes to reach 75%'}
                </div>
              </div>

              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Total assignments tracked: <strong>{assignmentList.length}</strong> ({completedCount} completed, {pendingCount} pending).
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION F: MY PROFILE                                    */}
      {/* ======================================================== */}
      {activeTab === 'profile' && (
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Student Profile Details</h2>
                <p style={{ fontSize: '0.85rem' }}>Personal identification & department enrollment</p>
              </div>
              <button onClick={() => setActiveTab('overview')} className="btn btn-secondary btn-sm">
                &larr; Back to Overview
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Student ID</label>
                  <input type="text" className="form-input" value={studentId} disabled />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Account Role</label>
                  <input type="text" className="form-input" value="STUDENT" disabled />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Full Name</label>
                <input type="text" className="form-input" value={studentName} disabled />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">College Email Address</label>
                <input type="email" className="form-input" value={profileData?.email || user?.email || 'student@edutrack.edu'} disabled />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Department / Branch</label>
                  <input type="text" className="form-input" value={branch} disabled />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Semester</label>
                  <input type="text" className="form-input" value={`Semester ${semester}`} disabled />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button onClick={() => setActiveTab('overview')} className="btn btn-primary btn-sm">
                  Back to Dashboard Overview
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* DETAIL MODAL (ATTENDANCE & ASSIGNMENTS)                   */}
      {/* ======================================================== */}
      {detailModal.isOpen && (
        <Modal
          isOpen={detailModal.isOpen}
          onClose={() => setDetailModal({ isOpen: false, type: '', data: null })}
          title={detailModal.type === 'attendance' ? `Attendance Details: ${detailModal.data?.subjectCode}` : `Assignment: ${detailModal.data?.title}`}
        >
          {detailModal.type === 'attendance' && detailModal.data && (
            <div>
              <h4 style={{ fontSize: '1.1rem', marginBottom: '0.4rem' }}>{detailModal.data.subjectName}</h4>
              <p style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>Subject Code: <strong>{detailModal.data.subjectCode}</strong></p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ padding: '0.75rem', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card-subtle)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CLASSES ATTENDED</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{detailModal.data.classesAttended}</div>
                </div>
                <div style={{ padding: '0.75rem', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card-subtle)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TOTAL CONDUCTED</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{detailModal.data.totalClasses}</div>
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span>Percentage: <strong>{detailModal.data.attendancePercentage}%</strong></span>
                  <span>Target: <strong>75%</strong></span>
                </div>
                <div className="progress-bar-bg">
                  <div
                    className={`progress-bar-fill ${detailModal.data.attendancePercentage >= 75 ? 'success' : 'danger'}`}
                    style={{ width: `${Math.min(detailModal.data.attendancePercentage, 100)}%` }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    const subId = detailModal.data.subjectId;
                    setDetailModal({ isOpen: false, type: '', data: null });
                    setPlannerSubjectId(String(subId));
                    setActiveTab('planner');
                  }}
                  className="btn btn-primary btn-sm"
                >
                  Open in Smart Planner &rarr;
                </button>
                <button
                  type="button"
                  onClick={() => setDetailModal({ isOpen: false, type: '', data: null })}
                  className="btn btn-secondary btn-sm"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {detailModal.type === 'assignment' && detailModal.data && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span className="badge badge-info">{detailModal.data.subjectCode} - {detailModal.data.subjectName}</span>
                <span className={`badge ${
                  detailModal.data.status === 'SUBMITTED' ? 'badge-success' :
                  detailModal.data.status === 'LATE' ? 'badge-warning' :
                  detailModal.data.status === 'COMPLETED' ? 'badge-success' :
                  detailModal.data.status === 'OVERDUE' ? 'badge-danger' : 'badge-warning'
                }`}>
                  {detailModal.data.status === 'SUBMITTED' ? '✓ Submitted' :
                   detailModal.data.status === 'LATE' ? '⚠️ Late Submission' :
                   detailModal.data.status === 'COMPLETED' ? '✓ Completed' :
                   detailModal.data.status === 'OVERDUE' ? '⚠️ Overdue' : '⏳ Pending'}
                </span>
              </div>

              <h4 style={{ fontSize: '1.15rem', marginBottom: '0.35rem' }}>{detailModal.data.title}</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                📅 Due Date: <strong>{detailModal.data.dueDate}</strong>
              </p>

              <div style={{ padding: '0.85rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-card-subtle)', marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Description & Guidelines:</div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', margin: 0, whiteSpace: 'pre-line' }}>
                  {detailModal.data.description || 'No specific instructions provided.'}
                </p>
              </div>

              {/* Saved Submission Record (if exists) */}
              {detailModal.data.submittedFilename && (
                <div style={{ padding: '0.85rem', borderRadius: 'var(--radius-md)', background: '#ecfdf5', border: '1px solid #a7f3d0', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.25rem' }}>
                    <div style={{ fontWeight: 600, color: '#065f46', fontSize: '0.9rem' }}>
                      ✓ Your Saved Submission
                    </div>
                    <span className={`badge ${detailModal.data.status === 'LATE' ? 'badge-warning' : 'badge-success'}`}>
                      {detailModal.data.status === 'LATE' ? 'Submitted Late' : 'Submitted on Time'}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.825rem', color: '#047857', marginBottom: '0.35rem' }}>
                    <strong>📁 File:</strong> {detailModal.data.submittedFilename} ({formatFileSize(detailModal.data.fileSize)})
                  </div>
                  <div style={{ fontSize: '0.825rem', color: '#047857', marginBottom: '0.35rem' }}>
                    <strong>🕒 Submitted At:</strong> {formatDateTime(detailModal.data.submittedAt)}
                  </div>
                  {detailModal.data.submissionNotes && (
                    <div style={{ fontSize: '0.825rem', color: '#047857', marginBottom: '0.5rem' }}>
                      <strong>📝 Notes:</strong> {detailModal.data.submissionNotes}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleDownloadSubmission(detailModal.data.id, detailModal.data.submittedFilename)}
                      className="btn btn-primary btn-sm"
                      style={{ fontSize: '0.8rem' }}
                    >
                      📥 Download Submission
                    </button>
                    {!showSubmitForm && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowSubmitForm(true);
                          setUploadError('');
                        }}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.8rem' }}
                      >
                        🔄 Resubmit Assignment
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Upload Error Banner */}
              {uploadError && (
                <div className="alert alert-danger" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Submission Form */}
              {(showSubmitForm || !detailModal.data.submittedFilename) && (
                <div style={{ padding: '1rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-card-subtle)', border: '1px dashed var(--border)', marginBottom: '1.25rem' }}>
                  <h4 style={{ fontSize: '0.925rem', marginBottom: '0.35rem' }}>
                    {detailModal.data.submittedFilename ? 'Resubmit Assignment' : 'Submit Assignment'}
                  </h4>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    Allowed file types: <strong>PDF (.pdf), DOC (.doc), DOCX (.docx)</strong>. Max file size: <strong>10 MB</strong>.
                  </p>

                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Choose File</label>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx"
                      className="form-input"
                      onChange={handleFileSelect}
                      disabled={isSubmitting}
                      style={{ fontSize: '0.85rem', padding: '0.4rem' }}
                    />
                    {selectedFile && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-main)', marginTop: '0.35rem' }}>
                        Selected: <strong>{selectedFile.name}</strong> ({formatFileSize(selectedFile.size)})
                      </div>
                    )}
                  </div>

                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Comments / Submission Notes (Optional)</label>
                    <textarea
                      rows="2"
                      className="form-textarea"
                      placeholder="Add any comments or remarks for the instructor..."
                      value={submissionNotes}
                      onChange={(e) => setSubmissionNotes(e.target.value)}
                      disabled={isSubmitting}
                      style={{ fontSize: '0.85rem' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => handleFileUpload(detailModal.data.id)}
                      disabled={isSubmitting || !selectedFile}
                      className="btn btn-primary btn-sm"
                    >
                      {isSubmitting ? 'Uploading...' : '📤 Upload & Submit'}
                    </button>
                    {detailModal.data.submittedFilename && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowSubmitForm(false);
                          setSelectedFile(null);
                          setUploadError('');
                        }}
                        disabled={isSubmitting}
                        className="btn btn-secondary btn-sm"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Modal Footer Controls */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    handleToggleAssignmentStatus(detailModal.data.id, detailModal.data.status);
                    setDetailModal({ isOpen: false, type: '', data: null });
                  }}
                  className={`btn btn-sm ${detailModal.data.status === 'COMPLETED' ? 'btn-secondary' : 'btn-success'}`}
                >
                  {detailModal.data.status === 'COMPLETED' ? 'Mark as Pending' : '✓ Mark as Completed'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDetailModal({ isOpen: false, type: '', data: null });
                    setShowSubmitForm(false);
                    setSelectedFile(null);
                    setUploadError('');
                  }}
                  className="btn btn-secondary btn-sm"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

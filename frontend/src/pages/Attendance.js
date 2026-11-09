import React, { useEffect, useState } from 'react';
import { attendanceAPI, superAdminAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import './Attendance.css';

const dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const message = (error) => error?.response?.data?.error || 'The attendance request could not be completed.';

export default function Attendance({ adminView = false, superAdminView = false }) {
  const { user } = useAuth();
  const [properties, setProperties] = useState([]);
  const [propertyId, setPropertyId] = useState('');
  const [mine, setMine] = useState(null);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [staffOptions, setStaffOptions] = useState([]);
  const [date, setDate] = useState(dayKey(new Date()));
  const [month, setMonth] = useState(dayKey(new Date()).slice(0, 7));
  const [staffId, setStaffId] = useState('');
  const [status, setStatus] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [correction, setCorrection] = useState(null);
  const [reason, setReason] = useState('');
  const [correctStatus, setCorrectStatus] = useState('Present');
  const [newAbsence, setNewAbsence] = useState({ staffId: '', attendanceDate: dayKey(new Date()), status: 'Absent', reason: '' });
  const api = (adminView || superAdminView) ? superAdminAPI : null;

  useEffect(() => {
    (superAdminView ? superAdminAPI.getProperties({ page: 1, pageSize: 100 }) : attendanceAPI.getProperties())
      .then((response) => { const items = response.data.items || []; setProperties(items); if (items.length === 1) setPropertyId(String(items[0]._id)); }).catch((error) => toast.error(message(error)));
  }, [superAdminView]);

  useEffect(() => {
    if (adminView || superAdminView) return;
    let alive = true;
    attendanceAPI.getMine(propertyId ? { propertyId } : {}).then((res) => { if (alive) setMine(res.data); })
      .catch((error) => { if (alive) setMine({ error: message(error) }); });
    return () => { alive = false; };
  }, [adminView, superAdminView, propertyId, refresh]);

  useEffect(() => {
    if (!adminView && !superAdminView) return;
    let alive = true;
    const params = { page: 1, pageSize: 100, ...(month ? { month } : { from: date, to: date }), ...(propertyId ? { propertyId } : {}), ...(status ? { status } : {}), ...(staffId ? { staffId } : {}) };
    Promise.all([api.getAttendance(params), api.getAttendanceSummary({ ...(propertyId ? { propertyId } : {}), ...(month ? { month } : {}) }), api.getAttendanceStaff(propertyId ? { propertyId } : {})])
      .then(([list, totals, staffList]) => { if (alive) { setRows(list.data.items || []); setSummary(totals.data); setStaffOptions(staffList.data.items || []); } })
      .catch((error) => { if (alive) toast.error(message(error)); });
    return () => { alive = false; };
  }, [adminView, superAdminView, api, date, month, status, propertyId, staffId, refresh]);

  const act = async (action) => {
    setBusy(true);
    try { await (action === 'in' ? attendanceAPI.checkIn({ propertyId: propertyId || undefined }) : attendanceAPI.checkOut({ propertyId: propertyId || undefined })); toast.success(action === 'in' ? 'Check-in recorded.' : 'Check-out recorded.'); setRefresh((n) => n + 1); }
    catch (error) { toast.error(message(error)); }
    finally { setBusy(false); }
  };
  const saveCorrection = async (event) => {
    event.preventDefault(); setBusy(true);
    try { await api.correctAttendance(correction._id, { status: correctStatus, reason }); toast.success('Attendance correction recorded.'); setCorrection(null); setReason(''); setRefresh((n) => n + 1); }
    catch (error) { toast.error(message(error)); }
    finally { setBusy(false); }
  };
  const recordAbsence = async (event) => {
    event.preventDefault(); setBusy(true);
    try { await api.createAttendanceCorrection({ ...newAbsence, propertyId }); toast.success('Attendance status recorded.'); setNewAbsence((old) => ({ ...old, staffId: '', reason: '' })); setRefresh((n) => n + 1); }
    catch (error) { toast.error(message(error)); }
    finally { setBusy(false); }
  };

  if (!adminView && !superAdminView) return <main className="attendance-page"><h1>My Attendance</h1><p>Check in and out records are timestamped by the server using your assigned property timezone.</p>
    {properties.length > 1 && <label>Property <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}><option value="">Select property</option>{properties.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select></label>}
    {mine?.error ? <p role="alert">{mine.error}</p> : mine && <><h2>{mine.property?.name} · {mine.attendanceDate}</h2><p>Status: {mine.today?.status || 'No check-in recorded'}{mine.today?.checkIn ? ` · In ${new Date(mine.today.checkIn).toLocaleTimeString()}` : ''}{mine.today?.checkOut ? ` · Out ${new Date(mine.today.checkOut).toLocaleTimeString()}` : ''}</p>
      <button disabled={busy || Boolean(mine.today)} onClick={() => act('in')}>Check in</button> <button disabled={busy || !mine.today?.checkIn || Boolean(mine.today?.checkOut)} onClick={() => act('out')}>Check out</button><p>{mine.policy}</p>
      <h2>Recent attendance</h2><table><thead><tr><th>Date</th><th>Status</th><th>Check in</th><th>Check out</th></tr></thead><tbody>{mine.history?.map((r) => <tr key={r._id}><td>{r.attendanceDate}</td><td>{r.status}</td><td>{r.checkIn ? new Date(r.checkIn).toLocaleString() : '—'}</td><td>{r.checkOut ? new Date(r.checkOut).toLocaleString() : '—'}</td></tr>)}</tbody></table></>}
  </main>;

  return <main className="attendance-page"><h1>{superAdminView ? 'Portfolio Attendance' : 'Staff Attendance'}</h1><p>Attendance and corrections are scoped to authorized properties. No shift schedule exists, so absence and lateness are never inferred.</p>
    <div className="attendance-filters"><label>Date <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setMonth(''); }} /></label><label>Month <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label><label>Property <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}><option value="">All assigned properties</option>{properties.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select></label><label>Staff member / ID <select value={staffId} onChange={(e) => setStaffId(e.target.value)}><option value="">All staff</option>{staffOptions.map((item) => <option key={item._id} value={item.staffId || item._id}>{item.name} · {item.staffId || item.role}</option>)}</select></label><label>Status <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{['Present', 'Late', 'On Leave', 'Absent'].map((s) => <option key={s}>{s}</option>)}</select></label><button onClick={() => setRefresh((n) => n + 1)}>Refresh</button></div>
    {summary && <><div className="attendance-summary">{Object.entries(summary.counts).map(([key, value]) => <span key={key}><strong>{value}</strong> {key} today</span>)}<span><strong>{summary.missingCheckouts}</strong> Missing check-outs today</span></div>{summary.monthly && <><h2>Monthly summary · {summary.monthly.month}</h2><div className="attendance-summary">{Object.entries(summary.monthly.counts).map(([key, value]) => <span key={key}><strong>{value}</strong> {key}</span>)}</div></>}</>}
    <table><thead><tr><th>Staff / ID</th><th>Department / title</th><th>Role</th><th>Property</th><th>Date</th><th>Status</th><th>Check in</th><th>Check out</th><th>Action</th></tr></thead><tbody>{rows.map((r) => <tr key={r._id}><td>{r.staff?.name}<small>{r.staff?.staffId}</small></td><td>{r.staff?.department || '—'}{r.staff?.jobTitle ? ` · ${r.staff.jobTitle}` : ''}</td><td>{r.staff?.role}</td><td>{r.property?.name}</td><td>{r.attendanceDate}</td><td>{r.status}</td><td>{r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : '—'}</td><td>{r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : '—'}</td><td><button onClick={() => { setCorrection(r); setCorrectStatus(r.status); }}>Correct</button></td></tr>)}</tbody></table>
    {(adminView || superAdminView) && <form onSubmit={recordAbsence} className="attendance-correction-form"><h2>Record leave or absence</h2><label>Property<select required value={propertyId} onChange={(e) => setPropertyId(e.target.value)}><option value="">Select property</option>{properties.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select></label><label>Staff member<select required value={newAbsence.staffId} onChange={(e) => setNewAbsence({ ...newAbsence, staffId: e.target.value })}><option value="">Select active staff</option>{staffOptions.map((item) => <option key={item._id} value={item._id}>{item.name} · {item.role}</option>)}</select></label><label>Date<input required type="date" value={newAbsence.attendanceDate} onChange={(e) => setNewAbsence({ ...newAbsence, attendanceDate: e.target.value })} /></label><label>Status<select value={newAbsence.status} onChange={(e) => setNewAbsence({ ...newAbsence, status: e.target.value })}><option>Absent</option><option>On Leave</option></select></label><label>Reason<input required minLength="5" maxLength="500" value={newAbsence.reason} onChange={(e) => setNewAbsence({ ...newAbsence, reason: e.target.value })} /></label><button disabled={busy || !propertyId}>Record for selected property</button></form>}
    {correction && <form onSubmit={saveCorrection} className="attendance-correction-form"><h2>Correct attendance: {correction.staff?.name}</h2><label>Status<select value={correctStatus} onChange={(e) => setCorrectStatus(e.target.value)}>{['Present', 'Late', 'On Leave', 'Absent'].map((s) => <option key={s}>{s}</option>)}</select></label><label>Reason<input required minLength="5" maxLength="500" value={reason} onChange={(e) => setReason(e.target.value)} /></label><button disabled={busy}>Save correction</button><button type="button" onClick={() => setCorrection(null)}>Cancel</button></form>}
  </main>;
}

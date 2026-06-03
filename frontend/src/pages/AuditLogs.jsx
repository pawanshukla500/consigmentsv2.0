import React, { useState, useEffect, useCallback } from 'react';
import { ClipboardList, Search, Filter, Loader2, User, Calendar } from 'lucide-react';
import { auditLogsAPI, usersAPI } from '../services/api';
import { useToast } from '../context/ToastContext';

const ACTION_COLORS = {
  create: 'bg-emerald-100 text-emerald-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
  pack: 'bg-purple-100 text-purple-700',
  save_box: 'bg-amber-100 text-amber-700',
  finish: 'bg-slate-100 text-slate-700',
  login: 'bg-cyan-100 text-cyan-700',
  upload: 'bg-pink-100 text-pink-700',
};

export default function AuditLogs() {
  const { addToast } = useToast();
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [logsRes, usersRes] = await Promise.all([
        auditLogsAPI.getAll(),
        usersAPI.getAll().catch(() => ({ data: { users: [] } }))
      ]);
      setLogs(logsRes.data.logs || []);
      setUsers(usersRes.data.users || []);
    } catch (error) { addToast('Failed to load logs', 'error'); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getUserName = (id) => users.find(u => u.id === id)?.name || id;

  let filtered = [...logs];
  if (filterUser) filtered = filtered.filter(l => l.userId === filterUser);
  if (filterAction) filtered = filtered.filter(l => l.action === filterAction);
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(l =>
      l.action?.toLowerCase().includes(s) ||
      l.entityType?.toLowerCase().includes(s) ||
      getUserName(l.userId)?.toLowerCase().includes(s)
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Audit Logs</h1>
          <p className="text-slate-500 mt-1">Track all user activity across the system</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search actions, entities..." className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-slate-400" />
            <select value={filterUser} onChange={e => setFilterUser(e.target.value)} className="px-4 py-2.5 border border-slate-200 rounded-lg outline-none bg-white"><option value="">All Users</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
            <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className="px-4 py-2.5 border border-slate-200 rounded-lg outline-none bg-white"><option value="">All Actions</option>
              <option value="create">Create</option><option value="update">Update</option><option value="delete">Delete</option>
              <option value="pack">Pack</option><option value="save_box">Save Box</option><option value="finish">Finish</option>
              <option value="login">Login</option><option value="upload">Upload</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50"><tr>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase px-6 py-4">Time</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase px-6 py-4">User</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase px-6 py-4">Action</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase px-6 py-4">Entity</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase px-6 py-4">Details</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan="5" className="py-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary-600" /></td></tr>
              : filtered.length > 0 ? filtered.map((log, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap"><div className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(log.timestamp).toLocaleString()}</div></td>
                  <td className="px-6 py-4"><div className="flex items-center gap-2"><User className="w-3.5 h-3.5 text-slate-400" /><span className="text-sm font-medium text-slate-900">{getUserName(log.userId)}</span></div></td>
                  <td className="px-6 py-4"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${ACTION_COLORS[log.action] || 'bg-slate-100 text-slate-700'}`}>{log.action}</span></td>
                  <td className="px-6 py-4 text-sm text-slate-600">{log.entityType} <span className="text-xs text-slate-400 font-mono">{log.entityId?.slice(0, 12)}...</span></td>
                  <td className="px-6 py-4 text-xs text-slate-500 max-w-[300px] truncate">{JSON.stringify(log.details || {})}</td>
                </tr>
              )) : <tr><td colSpan="5" className="py-12 text-center text-slate-400"><ClipboardList className="w-12 h-12 mx-auto mb-3 text-slate-300" /><p>No logs found</p></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

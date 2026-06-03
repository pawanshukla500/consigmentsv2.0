import React, { useState, useEffect, useCallback } from 'react';
import { Users as UsersIcon, Plus, Search, Trash2, Loader2, AlertCircle, Edit2, X, Check, Shield, KeyRound, Eye, EyeOff } from 'lucide-react';
import { usersAPI } from '../services/api';
import { useToast } from '../context/ToastContext';

const PERMISSIONS = [
  { key: 'consignments', label: 'Consignments' },
  { key: 'packing', label: 'Packing Station' },

  { key: 'productivity', label: 'Productivity' },
  { key: 'marketplaces', label: 'Marketplaces' },
  { key: 'users', label: 'Users' },
  { key: 'auditLogs', label: 'Audit Logs' },
];

export default function Users() {
  const { addToast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [selected, setSelected] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', role: 'user', permissions: {} });
  const [showChangePwd, setShowChangePwd] = useState(null);
  const [pwdForm, setPwdForm] = useState({ newPassword: '', confirmPassword: '' });

  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'user',
    permissions: { consignments: true, packing: true, productivity: false, marketplaces: false, users: false, auditLogs: false }
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await usersAPI.getAll();
      let data = res.data.users || [];
      if (search) {
        const s = search.toLowerCase();
        data = data.filter(u => u.name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s));
      }
      setUsers(data);
    } catch (error) { addToast('Failed to load users', 'error'); }
    finally { setLoading(false); }
  }, [search, addToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) return;
    setIsSubmitting(true);
    try {
      await usersAPI.create(form);
      addToast('User created', 'success');
      setShowCreate(false);
      setForm({ name: '', email: '', password: '', role: 'user', permissions: { consignments: true, packing: true, productivity: false, marketplaces: false, users: false, auditLogs: false } });
      fetchData();
    } catch (error) { addToast(error.response?.data?.error || 'Failed', 'error'); }
    setIsSubmitting(false);
  };

  const handleDelete = async () => {
    if (!selected) return;
    setIsSubmitting(true);
    try { await usersAPI.delete(selected.id); addToast('Deleted', 'success'); setShowDelete(false); fetchData(); }
    catch (error) { addToast('Failed', 'error'); }
    setIsSubmitting(false);
  };

  const startEdit = (u) => {
    setEditing(u.id);
    setEditForm({
      name: u.name,
      email: u.email,
      role: u.role || 'user',
      permissions: { ...u.permissions }
    });
  };
  const cancelEdit = () => { setEditing(null); };

  const saveEdit = async (id) => {
    setIsSubmitting(true);
    try {
      await usersAPI.update(id, editForm);
      addToast('Updated', 'success');
      setEditing(null);
      fetchData();
    } catch (error) { addToast('Failed', 'error'); }
    setIsSubmitting(false);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!showChangePwd) return;
    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
      addToast('Passwords do not match', 'error'); return;
    }
    if (pwdForm.newPassword.length < 4) {
      addToast('Password too short', 'error'); return;
    }
    setIsSubmitting(true);
    try {
      await usersAPI.changePassword(showChangePwd.id, { newPassword: pwdForm.newPassword });
      addToast('Password changed', 'success');
      setShowChangePwd(null);
      setPwdForm({ newPassword: '', confirmPassword: '' });
    } catch (error) { addToast(error.response?.data?.error || 'Failed', 'error'); }
    setIsSubmitting(false);
  };

  const togglePerm = (permKey, isEdit = false) => {
    if (isEdit) {
      setEditForm(prev => ({ ...prev, permissions: { ...prev.permissions, [permKey]: !prev.permissions[permKey] } }));
    } else {
      setForm(prev => ({ ...prev, permissions: { ...prev.permissions, [permKey]: !prev.permissions[permKey] } }));
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Users</h1>
          <p className="text-slate-500 mt-1">Manage team members and permissions</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"><Plus className="w-4 h-4" />New User</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users..." className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50"><tr>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase px-6 py-4">User</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase px-6 py-4">Role</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase px-6 py-4">Permissions</th>
              <th className="text-right text-xs font-semibold text-slate-500 uppercase px-6 py-4">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan="4" className="py-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary-600" /></td></tr>
              : users.length > 0 ? users.map(u => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    {editing === u.id ? (
                      <div className="space-y-2">
                        <input value={editForm.name} onChange={e => setEditForm({...editForm,name:e.target.value})} className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Name" />
                        <input value={editForm.email} onChange={e => setEditForm({...editForm,email:e.target.value})} className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Email" />
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-2"><UsersIcon className="w-4 h-4 text-primary-600" /><span className="text-sm font-medium text-slate-900">{u.name}</span>{u.isDefault && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">DEFAULT</span>}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{u.email}</div>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {editing === u.id ? (
                      <select value={editForm.role} onChange={e => setEditForm({...editForm,role:e.target.value})} className="px-3 py-1.5 border border-slate-200 rounded text-sm bg-white outline-none">
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${u.role==='admin'?'bg-purple-100 text-purple-800':'bg-slate-100 text-slate-700'}`}><Shield className="w-3 h-3 mr-1" />{u.role}</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {editing === u.id ? (
                      <div className="flex flex-wrap gap-1.5">
                        {PERMISSIONS.map(p => (
                          <button key={p.key} type="button" onClick={() => togglePerm(p.key, true)} className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors ${editForm.permissions[p.key]?'bg-primary-50 border-primary-300 text-primary-700':'bg-white border-slate-200 text-slate-500'}`}>
                            {editForm.permissions[p.key]?<Check className="w-3 h-3" />:<X className="w-3 h-3" />}{p.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {PERMISSIONS.filter(p => u.permissions?.[p.key]).map(p => (
                          <span key={p.key} className="inline-flex items-center text-[10px] bg-primary-50 text-primary-700 px-2 py-0.5 rounded border border-primary-200">{p.label}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {editing === u.id ? (
                        <>
                          <button onClick={() => saveEdit(u.id)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" disabled={isSubmitting}><Check className="w-4 h-4" /></button>
                          <button onClick={cancelEdit} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
                        </>
                      ) : (
                        <>
                          {!u.isDefault && <button onClick={() => { setShowChangePwd(u); setPwdForm({ newPassword: '', confirmPassword: '' }); }} className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" title="Change Password"><KeyRound className="w-4 h-4" /></button>}
                          <button onClick={() => startEdit(u)} className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                          {!u.isDefault && <button onClick={()=>{setSelected(u);setShowDelete(true);}} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )) : <tr><td colSpan="4" className="py-12 text-center text-slate-400"><UsersIcon className="w-12 h-12 mx-auto mb-3 text-slate-300" /><p>No users found</p></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-fade-in p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">New User</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-2">Name *</label><input type="text" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-2">Email *</label><input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-2">Password *</label>
                <div className="relative">
                  <input type={showPassword?'text':'password'} required value={form.password} onChange={e=>setForm({...form,password:e.target.value})} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none pr-10" />
                  <button type="button" onClick={()=>setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showPassword?<EyeOff className="w-4 h-4" />:<Eye className="w-4 h-4" />}</button>
                </div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-2">Role</label>
                <select value={form.role} onChange={e=>setForm({...form,role:e.target.value})} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg outline-none bg-white">
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-2">Permissions</label>
                <div className="flex flex-wrap gap-2">
                  {PERMISSIONS.map(p => (
                    <button key={p.key} type="button" onClick={() => togglePerm(p.key)} className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded border transition-colors ${form.permissions[p.key]?'bg-primary-50 border-primary-300 text-primary-700':'bg-white border-slate-200 text-slate-500'}`}>
                      {form.permissions[p.key]?<Check className="w-3.5 h-3.5" />:<X className="w-3.5 h-3.5" />}{p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={()=>setShowCreate(false)} className="px-6 py-2.5 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50" disabled={isSubmitting}>Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">{isSubmitting&&<Loader2 className="w-4 h-4 animate-spin"/>}Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDelete && selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-fade-in">
            <div className="flex items-center gap-3 mb-4"><div className="p-3 bg-red-100 rounded-full"><AlertCircle className="w-6 h-6 text-red-600" /></div><h2 className="text-xl font-bold text-slate-900">Delete User</h2></div>
            <p className="text-slate-600 mb-6">Delete <strong>{selected.name}</strong> ({selected.email})? This cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={()=>setShowDelete(false)} className="px-6 py-2.5 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50" disabled={isSubmitting}>Cancel</button>
              <button onClick={handleDelete} disabled={isSubmitting} className="px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">{isSubmitting&&<Loader2 className="w-4 h-4 animate-spin"/>}Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showChangePwd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-fade-in">
            <h2 className="text-xl font-bold text-slate-900 mb-1">Change Password</h2>
            <p className="text-sm text-slate-500 mb-4">{showChangePwd.name} ({showChangePwd.email})</p>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-2">New Password</label>
                <div className="relative">
                  <input type={showPassword?'text':'password'} required value={pwdForm.newPassword} onChange={e=>setPwdForm({...pwdForm,newPassword:e.target.value})} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none pr-10" minLength={4} />
                  <button type="button" onClick={()=>setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showPassword?<EyeOff className="w-4 h-4" />:<Eye className="w-4 h-4" />}</button>
                </div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-2">Confirm Password</label><input type="password" required value={pwdForm.confirmPassword} onChange={e=>setPwdForm({...pwdForm,confirmPassword:e.target.value})} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" minLength={4} /></div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={()=>setShowChangePwd(null)} className="px-6 py-2.5 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50" disabled={isSubmitting}>Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">{isSubmitting&&<Loader2 className="w-4 h-4 animate-spin"/>}Change</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

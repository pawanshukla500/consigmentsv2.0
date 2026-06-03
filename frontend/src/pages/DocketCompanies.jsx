import React, { useState, useEffect, useCallback } from 'react';
import { Truck, Plus, Search, Trash2, Loader2, AlertCircle, Edit2, X, Check } from 'lucide-react';
import { docketCompaniesAPI } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useDebounce } from '../hooks/useDebounce';

export default function DocketCompanies() {
  const { addToast } = useToast();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [selected, setSelected] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ name: '' });
  const debouncedSearch = useDebounce(search, 400);

  const [form, setForm] = useState({ name: '' });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await docketCompaniesAPI.getAll();
      let data = res.data.companies || [];
      if (debouncedSearch) {
        const s = debouncedSearch.toLowerCase();
        data = data.filter(m => m.name?.toLowerCase().includes(s));
      }
      setCompanies(data);
    } catch (error) { addToast('Failed to load', 'error'); }
    finally { setLoading(false); }
  }, [debouncedSearch, addToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setIsSubmitting(true);
    try {
      await docketCompaniesAPI.create(form);
      addToast('Docket company created', 'success');
      setShowCreate(false);
      setForm({ name: '' });
      fetchData();
    } catch (error) { addToast(error.response?.data?.error || 'Failed', 'error'); }
    setIsSubmitting(false);
  };

  const handleDelete = async () => {
    if (!selected) return;
    setIsSubmitting(true);
    try { await docketCompaniesAPI.delete(selected.id); addToast('Deleted', 'success'); setShowDelete(false); fetchData(); }
    catch (error) { addToast('Failed', 'error'); }
    setIsSubmitting(false);
  };

  const startEdit = (m) => { setEditing(m.id); setEditForm({ name: m.name }); };
  const cancelEdit = () => { setEditing(null); setEditForm({ name: '' }); };

  const saveEdit = async (id) => {
    if (!editForm.name.trim()) return;
    setIsSubmitting(true);
    try {
      await docketCompaniesAPI.update(id, editForm);
      addToast('Updated', 'success');
      setEditing(null);
      fetchData();
    } catch (error) { addToast('Failed', 'error'); }
    setIsSubmitting(false);
  };

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Docket Companies</h1>
          <p className="text-slate-500 mt-1">Manage logistics and courier partners</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"><Plus className="w-4 h-4" />New</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies..." className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50"><tr>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase px-6 py-4">Name</th>
              <th className="text-right text-xs font-semibold text-slate-500 uppercase px-6 py-4">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan="2" className="py-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary-600" /></td></tr>
              : companies.length > 0 ? companies.map(m => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    {editing === m.id ? (
                      <input value={editForm.name} onChange={e => setEditForm({...editForm,name:e.target.value})} className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none" autoFocus />
                    ) : (
                      <div className="flex items-center gap-2"><Truck className="w-4 h-4 text-primary-600" /><span className="text-sm font-medium text-slate-900">{m.name}</span></div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {editing === m.id ? (
                        <>
                          <button onClick={() => saveEdit(m.id)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" disabled={isSubmitting}><Check className="w-4 h-4" /></button>
                          <button onClick={cancelEdit} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(m)} className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={()=>{setSelected(m);setShowDelete(true);}} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )) : <tr><td colSpan="2" className="py-12 text-center text-slate-400"><Truck className="w-12 h-12 mx-auto mb-3 text-slate-300" /><p>No companies found</p></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-fade-in">
            <h2 className="text-xl font-bold text-slate-900 mb-4">New Docket Company</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-2">Name *</label><input type="text" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" placeholder="e.g., Delhivery" /></div>
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
            <div className="flex items-center gap-3 mb-4"><div className="p-3 bg-red-100 rounded-full"><AlertCircle className="w-6 h-6 text-red-600" /></div><h2 className="text-xl font-bold text-slate-900">Delete Company</h2></div>
            <p className="text-slate-600 mb-6">Delete <strong>{selected.name}</strong>? This cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={()=>setShowDelete(false)} className="px-6 py-2.5 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50" disabled={isSubmitting}>Cancel</button>
              <button onClick={handleDelete} disabled={isSubmitting} className="px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">{isSubmitting&&<Loader2 className="w-4 h-4 animate-spin"/>}Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { Store, Plus, Search, Trash2, Loader2, AlertCircle, Edit2, X, Check, Warehouse } from 'lucide-react';
import { marketplacesAPI } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useDebounce } from '../hooks/useDebounce';

export default function Marketplaces() {
  const { addToast } = useToast();
  const [marketplaces, setMarketplaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [selected, setSelected] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', warehouses: [] });
  const debouncedSearch = useDebounce(search, 400);

  const [form, setForm] = useState({ name: '', warehouses: [] });
  const [newWh, setNewWh] = useState('');
  const [editNewWh, setEditNewWh] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await marketplacesAPI.getAll();
      let data = res.data.marketplaces || [];
      if (debouncedSearch) {
        const s = debouncedSearch.toLowerCase();
        data = data.filter(m => m.name?.toLowerCase().includes(s) || m.warehouses?.some(w => w.toLowerCase().includes(s)));
      }
      setMarketplaces(data);
    } catch (error) { addToast('Failed to load', 'error'); }
    finally { setLoading(false); }
  }, [debouncedSearch, addToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const addWarehouse = () => {
    const w = newWh.trim();
    if (!w) return;
    if (form.warehouses.includes(w)) { addToast('Warehouse already exists', 'warning'); return; }
    setForm({ ...form, warehouses: [...form.warehouses, w] });
    setNewWh('');
  };

  const removeWarehouse = (idx) => {
    setForm({ ...form, warehouses: form.warehouses.filter((_, i) => i !== idx) });
  };

  const addEditWarehouse = () => {
    const w = editNewWh.trim();
    if (!w) return;
    if (editForm.warehouses.includes(w)) { addToast('Warehouse already exists', 'warning'); return; }
    setEditForm({ ...editForm, warehouses: [...editForm.warehouses, w] });
    setEditNewWh('');
  };

  const removeEditWarehouse = (idx) => {
    setEditForm({ ...editForm, warehouses: editForm.warehouses.filter((_, i) => i !== idx) });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setIsSubmitting(true);
    try {
      await marketplacesAPI.create({ name: form.name, warehouses: form.warehouses });
      addToast('Marketplace created', 'success');
      setShowCreate(false);
      setForm({ name: '', warehouses: [] });
      setNewWh('');
      fetchData();
    } catch (error) { addToast(error.response?.data?.error || 'Failed', 'error'); }
    setIsSubmitting(false);
  };

  const handleDelete = async () => {
    if (!selected) return;
    setIsSubmitting(true);
    try { await marketplacesAPI.delete(selected.id); addToast('Deleted', 'success'); setShowDelete(false); fetchData(); }
    catch (error) { addToast('Failed', 'error'); }
    setIsSubmitting(false);
  };

  const startEdit = (m) => { setEditing(m.id); setEditForm({ name: m.name, warehouses: m.warehouses || [] }); setEditNewWh(''); };
  const cancelEdit = () => { setEditing(null); setEditForm({ name: '', warehouses: [] }); };

  const saveEdit = async (id) => {
    if (!editForm.name.trim()) return;
    setIsSubmitting(true);
    try {
      await marketplacesAPI.update(id, { name: editForm.name, warehouses: editForm.warehouses });
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
          <h1 className="text-3xl font-bold text-slate-900">Marketplaces</h1>
          <p className="text-slate-500 mt-1">Manage marketplace platforms and their warehouses</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"><Plus className="w-4 h-4" />New</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search marketplaces or warehouses..." className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50"><tr>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase px-6 py-4">Name</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase px-6 py-4">Warehouses</th>
              <th className="text-right text-xs font-semibold text-slate-500 uppercase px-6 py-4">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan="3" className="py-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary-600" /></td></tr>
              : marketplaces.length > 0 ? marketplaces.map(m => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    {editing === m.id ? (
                      <input value={editForm.name} onChange={e => setEditForm({...editForm,name:e.target.value})} className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none" autoFocus />
                    ) : (
                      <div className="flex items-center gap-2"><Store className="w-4 h-4 text-primary-600" /><span className="text-sm font-medium text-slate-900">{m.name}</span></div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {editing === m.id ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input value={editNewWh} onChange={e => setEditNewWh(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEditWarehouse())} placeholder="Add warehouse..." className="flex-1 px-3 py-1.5 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                          <button type="button" onClick={addEditWarehouse} className="px-3 py-1.5 bg-primary-600 text-white rounded text-sm hover:bg-primary-700"><Plus className="w-3.5 h-3.5" /></button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {editForm.warehouses.map((w, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs">
                              <Warehouse className="w-3 h-3" />{w}
                              <button onClick={() => removeEditWarehouse(i)} className="text-slate-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {m.warehouses?.length > 0 ? m.warehouses.map((w, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs"><Warehouse className="w-3 h-3" />{w}</span>
                        )) : <span className="text-sm text-slate-400">— <span className="text-[10px] text-slate-400">(click ✏️ to add)</span></span>}
                      </div>
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
              )) : <tr><td colSpan="3" className="py-12 text-center text-slate-400"><Store className="w-12 h-12 mx-auto mb-3 text-slate-300" /><p>No marketplaces found</p></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-fade-in">
            <h2 className="text-xl font-bold text-slate-900 mb-4">New Marketplace</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Name *</label>
                <input type="text" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" placeholder="e.g., Amazon India" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Warehouses</label>
                <div className="flex gap-2 mb-2">
                  <input type="text" value={newWh} onChange={e=>setNewWh(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addWarehouse())} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" placeholder="e.g., DEL1, BLR2" />
                  <button type="button" onClick={addWarehouse} className="px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-1"><Plus className="w-4 h-4" /></button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {form.warehouses.map((w, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-sm">
                      <Warehouse className="w-3.5 h-3.5" />{w}
                      <button type="button" onClick={() => removeWarehouse(i)} className="text-slate-400 hover:text-red-500 ml-0.5"><X className="w-3.5 h-3.5" /></button>
                    </span>
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
            <div className="flex items-center gap-3 mb-4"><div className="p-3 bg-red-100 rounded-full"><AlertCircle className="w-6 h-6 text-red-600" /></div><h2 className="text-xl font-bold text-slate-900">Delete Marketplace</h2></div>
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

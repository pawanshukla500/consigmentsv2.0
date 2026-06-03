import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Package, Plus, Search, Filter, Trash2, Eye, Download, Loader2, AlertCircle, Store, Upload, Pencil, CheckCircle2, X, FileSpreadsheet, ChevronDown, ChevronUp } from 'lucide-react';
import { consignmentsAPI, templatesAPI, marketplacesAPI, docketCompaniesAPI } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useDebounce } from '../hooks/useDebounce';

export default function Consignments() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [consignments, setConsignments] = useState([]);
  const [marketplaces, setMarketplaces] = useState([]);
  const [docketCompanies, setDocketCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [mpFilter, setMpFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [selected, setSelected] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [editForm, setEditForm] = useState({});
  const debouncedSearch = useDebounce(search, 400);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [form, setForm] = useState({
    id: '', shipmentNo: '', internalShipmentNo: '', name: '', description: '', expectedDate: '', marketplaceId: '', warehouse: '',
    poExpiryDate: '', appointmentDate: '', scheduledDispatchDate: '', actualDispatchDate: '', dateOfInward: '',
    forwardInvoiceNo: '', docketCompany: '', docketNo: '', marketplaceTicketId: '', shipmentStatus: 'Planned',
    unitsShipped: '', unitsReceived: '', unitsInwarded: '', qaFailExcessQty: '',
    skus: [{ marketplaceSku: '', internalSku: '', requiredQty: '' }]
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [consRes, mpRes, dcRes] = await Promise.all([
        consignmentsAPI.getAll({ status: statusFilter || undefined, marketplaceId: mpFilter || undefined, search: debouncedSearch || undefined }),
        marketplacesAPI.getAll(),
        docketCompaniesAPI.getAll()
      ]);
      setConsignments(consRes.data.consignments || []);
      setMarketplaces(mpRes.data.marketplaces || []);
      setDocketCompanies(dcRes.data.companies || []);
    } catch (error) { addToast('Failed to load', 'error'); }
    finally { setLoading(false); }
  }, [statusFilter, mpFilter, debouncedSearch, addToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        ...form,
        unitsShipped: parseInt(form.unitsShipped) || 0,
        unitsReceived: parseInt(form.unitsReceived) || 0,
        unitsInwarded: parseInt(form.unitsInwarded) || 0,
        qaFailExcessQty: parseInt(form.qaFailExcessQty) || 0,
        skus: form.skus.filter(s => s.marketplaceSku || s.internalSku).map(s => ({
          marketplaceSku: s.marketplaceSku,
          internalSku: s.internalSku,
          requiredQty: parseInt(s.requiredQty) || 0
        }))
      };
      await consignmentsAPI.create(payload);
      addToast('Consignment created', 'success');
      setShowCreate(false);
      setForm({ id: '', shipmentNo: '', internalShipmentNo: '', name: '', description: '', expectedDate: '', marketplaceId: '', warehouse: '', poExpiryDate: '', appointmentDate: '', scheduledDispatchDate: '', actualDispatchDate: '', dateOfInward: '', forwardInvoiceNo: '', docketCompany: '', docketNo: '', marketplaceTicketId: '', shipmentStatus: 'Planned', unitsShipped: '', unitsReceived: '', unitsInwarded: '', qaFailExcessQty: '', skus: [{ marketplaceSku: '', internalSku: '', requiredQty: '' }] });
      fetchData();
    } catch (error) { addToast(error.response?.data?.error || 'Failed', 'error'); }
    setIsSubmitting(false);
  };

  const handleDelete = async () => {
    if (!selected) return;
    setIsSubmitting(true);
    try { await consignmentsAPI.delete(selected.id); addToast('Deleted', 'success'); setShowDelete(false); fetchData(); }
    catch (error) { addToast('Failed', 'error'); }
    setIsSubmitting(false);
  };

  const addSku = () => setForm(prev => ({ ...prev, skus: [...prev.skus, { marketplaceSku: '', internalSku: '', requiredQty: '' }] }));
  const removeSku = (i) => setForm(prev => ({ ...prev, skus: prev.skus.filter((_, idx) => idx !== i) }));
  const updateSku = (i, field, value) => setForm(prev => { const s = [...prev.skus]; s[i][field] = value; return { ...prev, skus: s }; });

  const parseCsv = (text) => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const idxMp = headers.findIndex(h => h.toLowerCase().includes('marketplace'));
    const idxInt = headers.findIndex(h => h.toLowerCase().includes('internal'));
    const idxQty = headers.findIndex(h => h.toLowerCase().includes('qty') || h.toLowerCase().includes('required'));
    const items = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      if (!cols[0]) continue;
      items.push({
        marketplaceSku: idxMp >= 0 ? cols[idxMp] : cols[0],
        internalSku: idxInt >= 0 ? cols[idxInt] : (cols[1] || ''),
        requiredQty: idxQty >= 0 ? cols[idxQty] : (cols[2] || '0')
      });
    }
    return items;
  };

  const handleCsvUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result;
        const items = parseCsv(text);
        if (items.length === 0) { addToast('No valid SKUs found in file', 'warning'); return; }
        setForm(prev => ({ ...prev, skus: items }));
        addToast(`${items.length} SKU(s) imported from ${file.name}`, 'success');
      } catch (err) { addToast('Failed to parse file: ' + err.message, 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const getMpName = (id) => marketplaces.find(m => m.id === id)?.name || '';

  const startEdit = (c) => {
    setEditingRow(c.id);
    setEditForm({
      appointmentDate: c.appointmentDate || '',
      scheduledDispatchDate: c.scheduledDispatchDate || '',
      actualDispatchDate: c.actualDispatchDate || '',
      dateOfInward: c.dateOfInward || '',
      forwardInvoiceNo: c.forwardInvoiceNo || '',
      docketCompany: c.docketCompany || '',
      docketNo: c.docketNo || '',
      marketplaceTicketId: c.marketplaceTicketId || '',
      unitsShipped: c.unitsShipped || '',
      unitsReceived: c.unitsReceived || '',
      unitsInwarded: c.unitsInwarded || '',
      qaFailExcessQty: c.qaFailExcessQty || '',
    });
  };

  const cancelEdit = () => { setEditingRow(null); setEditForm({}); };

  const saveEdit = async (c) => {
    setIsSubmitting(true);
    try {
      const payload = {
        ...editForm,
        unitsShipped: parseInt(editForm.unitsShipped) || 0,
        unitsReceived: parseInt(editForm.unitsReceived) || 0,
        unitsInwarded: parseInt(editForm.unitsInwarded) || 0,
        qaFailExcessQty: parseInt(editForm.qaFailExcessQty) || 0,
      };
      await consignmentsAPI.update(c.id, payload);
      addToast('Updated', 'success');
      setEditingRow(null);
      fetchData();
    } catch (error) { addToast('Update failed', 'error'); }
    setIsSubmitting(false);
  };

  const fmtDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const handleExport = () => {
    const headers = [
      'Consignment No','Internal Shipment No','Portal','FC Name','Actual Dispatch','Date of Inward',
      'Docket Company','Docket No','Forward Invoice','Ticket ID','Planned','Packed','Shipped',
      'Received','Inwarded','Short','Pack Status','Ship Status'
    ];
    const rows = consignments.map(c => {
      const shortQty = (c.totalRequiredQty || 0) - (c.unitsInwarded || 0);
      return [
        c.id, c.internalShipmentNo || '', getMpName(c.marketplaceId), c.warehouse || '',
        c.actualDispatchDate || '', c.dateOfInward || '', c.docketCompany || '', c.docketNo || '',
        c.forwardInvoiceNo || '', c.marketplaceTicketId || '', c.totalRequiredQty || 0,
        c.totalPackedQty || 0, c.unitsShipped || 0, c.unitsReceived || 0, c.unitsInwarded || 0,
        shortQty, c.status || '', c.shipmentStatus || ''
      ];
    });
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `consignments_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('Exported to CSV', 'success');
  };

  const statusClass = (st) => {
    if (st === 'completed') return 'bg-emerald-100 text-emerald-800';
    if (st === 'in_progress') return 'bg-blue-100 text-blue-800';
    return 'bg-amber-100 text-amber-800';
  };

  const shipStatusClass = (st) => {
    if (st === 'Planned') return 'bg-slate-100 text-slate-700';
    if (st === 'Under Packing') return 'bg-orange-100 text-orange-800';
    if (st === 'Ready') return 'bg-emerald-100 text-emerald-800';
    if (st === 'In Transit' || st === 'Forwarded') return 'bg-blue-100 text-blue-800';
    if (st === 'Missed') return 'bg-red-100 text-red-800';
    return 'bg-slate-100 text-slate-700';
  };

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Consignments</h1>
          <p className="text-slate-500 mt-1">Manage shipments and SKUs</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => handleExport()} className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 bg-white rounded-lg hover:bg-slate-50 text-sm" title="Export to CSV"><FileSpreadsheet className="w-4 h-4" />Export</button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"><Plus className="w-4 h-4" />New</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by ID, shipment, internal shipment..." className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-slate-400" />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-4 py-2.5 border border-slate-200 rounded-lg outline-none bg-white"><option value="">All Pack Status</option><option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="completed">Completed</option></select>
            <select value={mpFilter} onChange={e => setMpFilter(e.target.value)} className="px-4 py-2.5 border border-slate-200 rounded-lg outline-none bg-white"><option value="">All Marketplaces</option>{marketplaces.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50"><tr>
              <th className="text-left font-semibold text-slate-500 uppercase px-3 py-3 whitespace-nowrap sticky left-0 bg-slate-50 z-10">Consignment No</th>
              <th className="text-left font-semibold text-slate-500 uppercase px-3 py-3 whitespace-nowrap">Internal Shipment No.</th>
              <th className="text-left font-semibold text-slate-500 uppercase px-3 py-3 whitespace-nowrap">Portal</th>
              <th className="text-left font-semibold text-slate-500 uppercase px-3 py-3 whitespace-nowrap">FC Name</th>
              <th className="text-left font-semibold text-slate-500 uppercase px-3 py-3 whitespace-nowrap">Actual Dispatch</th>
              <th className="text-left font-semibold text-slate-500 uppercase px-3 py-3 whitespace-nowrap">Date of Inward</th>
              <th className="text-left font-semibold text-slate-500 uppercase px-3 py-3 whitespace-nowrap">Docket Company</th>
              <th className="text-left font-semibold text-slate-500 uppercase px-3 py-3 whitespace-nowrap">Docket No</th>
              <th className="text-left font-semibold text-slate-500 uppercase px-3 py-3 whitespace-nowrap">Forward Invoice</th>
              <th className="text-left font-semibold text-slate-500 uppercase px-3 py-3 whitespace-nowrap">Ticket ID</th>
              <th className="text-right font-semibold text-slate-500 uppercase px-3 py-3 whitespace-nowrap">Planned</th>
              <th className="text-right font-semibold text-slate-500 uppercase px-3 py-3 whitespace-nowrap">Packed</th>
              <th className="text-right font-semibold text-slate-500 uppercase px-3 py-3 whitespace-nowrap">Shipped</th>
              <th className="text-right font-semibold text-slate-500 uppercase px-3 py-3 whitespace-nowrap">Received</th>
              <th className="text-right font-semibold text-slate-500 uppercase px-3 py-3 whitespace-nowrap">Inwarded</th>
              <th className="text-right font-semibold text-slate-500 uppercase px-3 py-3 whitespace-nowrap">Short</th>
              <th className="text-left font-semibold text-slate-500 uppercase px-3 py-3 whitespace-nowrap">Pack Status</th>
              <th className="text-left font-semibold text-slate-500 uppercase px-3 py-3 whitespace-nowrap">Ship Status</th>
              <th className="text-left font-semibold text-slate-500 uppercase px-3 py-3 whitespace-nowrap">Progress</th>
              <th className="text-right font-semibold text-slate-500 uppercase px-3 py-3 whitespace-nowrap sticky right-0 bg-slate-50 z-10">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan="20" className="py-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary-600" /></td></tr>
              : consignments.length > 0 ? consignments.map(c => {
                const shortQty = (c.totalRequiredQty || 0) - (c.unitsInwarded || 0);
                const isEditing = editingRow === c.id;
                return (
                <React.Fragment key={c.id}>
                  <tr className={`hover:bg-slate-50 ${isEditing ? 'bg-primary-50/40' : ''}`}>
                    <td className="px-3 py-3 font-medium text-slate-900 whitespace-nowrap sticky left-0 bg-white hover:bg-slate-50 z-10">{c.id}</td>
                    <td className="px-3 py-3 font-bold text-slate-900 whitespace-nowrap">{c.internalShipmentNo || '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap"><span className="inline-flex items-center gap-1 font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full"><Store className="w-3 h-3" />{getMpName(c.marketplaceId) || '—'}</span></td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{c.warehouse || '—'}</td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{fmtDate(c.actualDispatchDate)}</td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{fmtDate(c.dateOfInward)}</td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{c.docketCompany || '—'}</td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{c.docketNo || '—'}</td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{c.forwardInvoiceNo || '—'}</td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{c.marketplaceTicketId || '—'}</td>
                    <td className="px-3 py-3 text-right font-medium text-slate-700 whitespace-nowrap">{c.totalRequiredQty || 0}</td>
                    <td className="px-3 py-3 text-right font-medium text-slate-700 whitespace-nowrap">{c.totalPackedQty || 0}</td>
                    <td className="px-3 py-3 text-right font-medium text-slate-700 whitespace-nowrap">{c.unitsShipped || 0}</td>
                    <td className="px-3 py-3 text-right font-medium text-slate-700 whitespace-nowrap">{c.unitsReceived || 0}</td>
                    <td className="px-3 py-3 text-right font-medium text-slate-700 whitespace-nowrap">{c.unitsInwarded || 0}</td>
                    <td className={`px-3 py-3 text-right font-bold whitespace-nowrap ${shortQty > 0 ? 'text-red-600' : shortQty < 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{shortQty}</td>
                    <td className="px-3 py-3 whitespace-nowrap"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusClass(c.status)}`}>{c.status?.replace('_',' ')}</span></td>
                    <td className="px-3 py-3 whitespace-nowrap"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${shipStatusClass(c.shipmentStatus)}`}>{c.shipmentStatus || 'Planned'}</span></td>
                    <td className="px-3 py-3 whitespace-nowrap"><div className="flex items-center gap-2"><div className="w-16 bg-slate-200 rounded-full h-1.5"><div className="bg-primary-500 h-1.5 rounded-full transition-all" style={{ width: `${c.totalRequiredQty>0?Math.min(100,(c.totalPackedQty/c.totalRequiredQty)*100):0}%` }} /></div><span className="text-xs text-slate-500">{c.totalPackedQty||0}/{c.totalRequiredQty||0}</span></div></td>
                    <td className="px-3 py-3 whitespace-nowrap sticky right-0 bg-white hover:bg-slate-50 z-10"><div className="flex items-center justify-end gap-1">
                      {isEditing ? (
                        <>
                          <button onClick={()=>saveEdit(c)} disabled={isSubmitting} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Save"><CheckCircle2 className="w-4 h-4" /></button>
                          <button onClick={cancelEdit} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors" title="Cancel"><X className="w-4 h-4" /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={()=>startEdit(c)} className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" title="Edit tracking"><Pencil className="w-4 h-4" /></button>
                          <Link to={`/consignments/${c.id}`} className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"><Eye className="w-4 h-4" /></Link>
                          {isAdmin && <button onClick={()=>{setSelected(c);setShowDelete(true);}} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>}
                        </>
                      )}
                    </div></td>
                  </tr>
                  {isEditing && (
                    <tr className="bg-primary-50/30">
                      <td colSpan="20" className="px-4 py-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                          <div><label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Appointment Date</label><input type="date" value={editForm.appointmentDate || ''} onChange={e=>setEditForm({...editForm,appointmentDate:e.target.value})} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none" /></div>
                          <div><label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Scheduled Dispatch</label><input type="date" value={editForm.scheduledDispatchDate || ''} onChange={e=>setEditForm({...editForm,scheduledDispatchDate:e.target.value})} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none" /></div>
                          <div><label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Actual Dispatch</label><input type="date" value={editForm.actualDispatchDate || ''} onChange={e=>setEditForm({...editForm,actualDispatchDate:e.target.value})} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none" /></div>
                          <div><label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Date of Inward</label><input type="date" value={editForm.dateOfInward || ''} onChange={e=>setEditForm({...editForm,dateOfInward:e.target.value})} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none" /></div>
                          <div><label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Docket Company</label><select value={editForm.docketCompany || ''} onChange={e=>setEditForm({...editForm,docketCompany:e.target.value})} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none bg-white"><option value="">Select</option>{docketCompanies.map(dc=><option key={dc.id} value={dc.name}>{dc.name}</option>)}</select></div>
                          <div><label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Docket No</label><input type="text" value={editForm.docketNo || ''} onChange={e=>setEditForm({...editForm,docketNo:e.target.value})} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Docket #" /></div>
                          <div><label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Forward Invoice No.</label><input type="text" value={editForm.forwardInvoiceNo || ''} onChange={e=>setEditForm({...editForm,forwardInvoiceNo:e.target.value})} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Invoice #" /></div>
                          <div><label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Marketplace Ticket ID</label><input type="text" value={editForm.marketplaceTicketId || ''} onChange={e=>setEditForm({...editForm,marketplaceTicketId:e.target.value})} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Ticket ID" /></div>
                          <div><label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Units Shipped</label><input type="number" min="0" value={editForm.unitsShipped || ''} onChange={e=>setEditForm({...editForm,unitsShipped:e.target.value})} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="0" /></div>
                          <div><label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Units Received</label><input type="number" min="0" value={editForm.unitsReceived || ''} onChange={e=>setEditForm({...editForm,unitsReceived:e.target.value})} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="0" /></div>
                          <div><label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Units Inwarded</label><input type="number" min="0" value={editForm.unitsInwarded || ''} onChange={e=>setEditForm({...editForm,unitsInwarded:e.target.value})} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="0" /></div>
                          <div><label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">QA Fail / Excess</label><input type="number" min="0" value={editForm.qaFailExcessQty || ''} onChange={e=>setEditForm({...editForm,qaFailExcessQty:e.target.value})} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="0" /></div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )}) : <tr><td colSpan="20" className="py-12 text-center text-slate-400"><Package className="w-12 h-12 mx-auto mb-3 text-slate-300" /><p>No consignments found</p></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <form onSubmit={handleCreate} className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col animate-fade-in my-auto">
            {/* Header — fixed */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Create New Consignment</h2>
                <p className="text-xs text-slate-400 mt-0.5">Fields marked <span className="text-red-500">*</span> are required</p>
              </div>
              <button type="button" onClick={()=>setShowCreate(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
            </div>
            {/* Body — scrollable */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* ── Required fields ── */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Required Information</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Consignment ID <span className="text-red-500">*</span></label><input type="text" required value={form.id} onChange={e=>setForm({...form,id:e.target.value})} className="inp" placeholder="e.g., CON-2024-001" /></div>
                  <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Internal Shipment No. <span className="text-red-500">*</span></label><input type="text" required value={form.internalShipmentNo} onChange={e=>setForm({...form,internalShipmentNo:e.target.value})} className="inp" placeholder="e.g., 6605JVXH" /></div>
                  <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Marketplace <span className="text-red-500">*</span></label><select required value={form.marketplaceId} onChange={e=>setForm({...form,marketplaceId:e.target.value,warehouse:''})} className="inp bg-white"><option value="">Select portal</option>{marketplaces.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
                  <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Warehouse</label>
                    {form.marketplaceId && (marketplaces.find(m=>m.id===form.marketplaceId)?.warehouses||[]).length===0 ? (
                      <div className="inp bg-slate-50 text-slate-400 text-xs flex items-center justify-between">
                        No warehouses <span className="text-indigo-600 cursor-pointer underline ml-1" onClick={()=>navigate('/marketplaces')}>Add →</span>
                      </div>
                    ) : (
                      <select value={form.warehouse} onChange={e=>setForm({...form,warehouse:e.target.value})} disabled={!form.marketplaceId} className="inp bg-white disabled:bg-slate-100 disabled:text-slate-400">
                        <option value="">Select warehouse</option>
                        {(marketplaces.find(m=>m.id===form.marketplaceId)?.warehouses||[]).map(w=><option key={w} value={w}>{w}</option>)}
                      </select>
                    )}
                  </div>
                  <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Shipment No.</label><input type="text" value={form.shipmentNo} onChange={e=>setForm({...form,shipmentNo:e.target.value})} className="inp" placeholder="Optional" /></div>
                  <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Expected Date</label><input type="date" value={form.expectedDate} onChange={e=>setForm({...form,expectedDate:e.target.value})} className="inp" /></div>
                  <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Shipment Status</label><select value={form.shipmentStatus} onChange={e=>setForm({...form,shipmentStatus:e.target.value})} className="inp bg-white"><option>Planned</option><option>Scheduled</option><option>Under Packing</option><option>Ready</option><option>In Transit</option><option>Forwarded</option><option>Missed</option></select></div>
                  <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">PO Expiry Date</label><input type="date" value={form.poExpiryDate} onChange={e=>setForm({...form,poExpiryDate:e.target.value})} className="inp" /></div>
                </div>
              </div>

              {/* ── Advanced (collapsible) ── */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <button type="button" onClick={()=>setShowAdvanced(a=>!a)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-xs font-semibold text-slate-600">
                  <span>Additional Shipping Details <span className="font-normal text-slate-400">(docket, invoice, dispatch dates)</span></span>
                  {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showAdvanced && (
                  <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3 border-t border-slate-100">
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Docket Company</label><select value={form.docketCompany} onChange={e=>setForm({...form,docketCompany:e.target.value})} className="inp bg-white"><option value="">Select</option>{docketCompanies.map(dc=><option key={dc.id} value={dc.name}>{dc.name}</option>)}</select></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Docket No</label><input type="text" value={form.docketNo} onChange={e=>setForm({...form,docketNo:e.target.value})} className="inp" placeholder="DK-12345" /></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Forward Invoice No.</label><input type="text" value={form.forwardInvoiceNo} onChange={e=>setForm({...form,forwardInvoiceNo:e.target.value})} className="inp" placeholder="INV-12345" /></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Marketplace Ticket ID</label><input type="text" value={form.marketplaceTicketId} onChange={e=>setForm({...form,marketplaceTicketId:e.target.value})} className="inp" placeholder="Optional" /></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Appointment Date</label><input type="date" value={form.appointmentDate} onChange={e=>setForm({...form,appointmentDate:e.target.value})} className="inp" /></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Scheduled Dispatch</label><input type="date" value={form.scheduledDispatchDate} onChange={e=>setForm({...form,scheduledDispatchDate:e.target.value})} className="inp" /></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Actual Dispatch</label><input type="date" value={form.actualDispatchDate} onChange={e=>setForm({...form,actualDispatchDate:e.target.value})} className="inp" /></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Date of Inward</label><input type="date" value={form.dateOfInward} onChange={e=>setForm({...form,dateOfInward:e.target.value})} className="inp" /></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Units Shipped</label><input type="number" min="0" value={form.unitsShipped} onChange={e=>setForm({...form,unitsShipped:e.target.value})} className="inp" placeholder="0" /></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Units Received</label><input type="number" min="0" value={form.unitsReceived} onChange={e=>setForm({...form,unitsReceived:e.target.value})} className="inp" placeholder="0" /></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Units Inwarded</label><input type="number" min="0" value={form.unitsInwarded} onChange={e=>setForm({...form,unitsInwarded:e.target.value})} className="inp" placeholder="0" /></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">QA Fail / Excess</label><input type="number" min="0" value={form.qaFailExcessQty} onChange={e=>setForm({...form,qaFailExcessQty:e.target.value})} className="inp" placeholder="0" /></div>
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-slate-700">SKU Items</label>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={async () => { try { const r = await templatesAPI.downloadConsignment(); const url = URL.createObjectURL(new Blob([r.data])); const a = document.createElement('a'); a.href = url; a.download = 'sku_template.csv'; a.click(); } catch(e){ addToast('Download failed','error'); } }} className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium"><Download className="w-3.5 h-3.5" />Template</button>
                    <label className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium cursor-pointer"><Upload className="w-3.5 h-3.5" />Upload CSV<input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleCsvUpload} /></label>
                    <button type="button" onClick={addSku} className="text-sm text-primary-600 hover:text-primary-700 font-medium">+ Add SKU</button>
                  </div>
                </div>
                {form.skus.length > 0 && (
                  <div className="text-xs text-slate-500 mb-2">{form.skus.length} SKU(s) loaded</div>
                )}
                <div className="space-y-3">
                  {form.skus.map((sku,i)=> (
                    <div key={i} className="flex gap-3 items-start">
                      <input type="text" value={sku.marketplaceSku} onChange={e=>updateSku(i,'marketplaceSku',e.target.value)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm" placeholder="SKU Details (Marketplace SKU)" />
                      <input type="text" value={sku.internalSku} onChange={e=>updateSku(i,'internalSku',e.target.value)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm" placeholder="SKU Details Internal" />
                      <input type="number" value={sku.requiredQty} onChange={e=>updateSku(i,'requiredQty',e.target.value)} className="w-24 px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm" placeholder="Qty" min="0" />
                      {form.skus.length>1 && <button type="button" onClick={()=>removeSku(i)} className="p-2.5 text-slate-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  ))}
                </div>
              </div>
            </div>{/* /scrollable body */}
            {/* Footer — fixed */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0 bg-white rounded-b-2xl">
              <button type="button" onClick={()=>setShowCreate(false)} className="px-6 py-2.5 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50" disabled={isSubmitting}>Cancel</button>
              <button type="submit" disabled={isSubmitting} className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">{isSubmitting&&<Loader2 className="w-4 h-4 animate-spin"/>}Create</button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Modal */}
      {showDelete && selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-fade-in">
            <div className="flex items-center gap-3 mb-4"><div className="p-3 bg-red-100 rounded-full"><AlertCircle className="w-6 h-6 text-red-600" /></div><h2 className="text-xl font-bold text-slate-900">Delete Consignment</h2></div>
            <p className="text-slate-600 mb-6">Delete <strong>{selected.internalShipmentNo || selected.id}</strong>? This cannot be undone.</p>
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

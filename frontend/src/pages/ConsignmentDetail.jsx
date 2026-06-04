import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Package, Box, Video, FileText, Upload, AlertCircle,
  Trash2, Download, Loader2, FileSpreadsheet, CheckCircle2,
  Copy, ExternalLink, Tag, ChevronDown, ChevronUp
} from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';
import JsBarcode from 'jsbarcode';
import { consignmentsAPI } from '../services/api';
import api from '../services/api';
import { useToast } from '../context/ToastContext';


const ConsignmentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [uploading, setUploading] = useState(false);
  const [consignment, setConsignment] = useState(null);
  const [loading, setLoading] = useState(true);
  // Tab is synced to the URL (?tab=) so it's deep-linkable, shareable & survives refresh
  const activeTab = searchParams.get('tab') || 'skus';
  const setActiveTab = (tab) => setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('tab', tab); return p; }, { replace: true });
  const [trackingOpen,  setTrackingOpen]  = useState(true);
  const [editingTracking, setEditingTracking] = useState(false);
  const [deleteFile, setDeleteFile] = useState(null); // { id, type, name }
  const [savingTracking, setSavingTracking] = useState(false);
  const [trackingForm, setTrackingForm] = useState({});

  const openTrackingEdit = () => {
    setTrackingForm({
      appointmentDate: consignment.appointmentDate || '',
      scheduledDispatchDate: consignment.scheduledDispatchDate || '',
      actualDispatchDate: consignment.actualDispatchDate || '',
      dateOfInward: consignment.dateOfInward || '',
      poExpiryDate: consignment.poExpiryDate || '',
      forwardInvoiceNo: consignment.forwardInvoiceNo || '',
      docketCompany: consignment.docketCompany || '',
      docketNo: consignment.docketNo || '',
      marketplaceTicketId: consignment.marketplaceTicketId || '',
      shipmentStatus: consignment.shipmentStatus || 'Planned',
      unitsShipped: consignment.unitsShipped || 0,
      unitsReceived: consignment.unitsReceived || 0,
      unitsInwarded: consignment.unitsInwarded || 0,
      qaFailExcessQty: consignment.qaFailExcessQty || 0,
    });
    setEditingTracking(true);
  };

  const saveTracking = async () => {
    setSavingTracking(true);
    try {
      const payload = {
        ...trackingForm,
        unitsShipped: Number(trackingForm.unitsShipped) || 0,
        unitsReceived: Number(trackingForm.unitsReceived) || 0,
        unitsInwarded: Number(trackingForm.unitsInwarded) || 0,
        qaFailExcessQty: Number(trackingForm.qaFailExcessQty) || 0,
      };
      await consignmentsAPI.update(id, payload);
      addToast('Tracking details updated', 'success');
      setEditingTracking(false);
      fetchConsignment();
    } catch (error) {
      addToast('Update failed', 'error');
    }
    setSavingTracking(false);
  };

  const pivotData = React.useMemo(() => {
    if (!consignment) return null;
    const skus = consignment.skus || [];
    const boxes = consignment.boxes || [];
    const sortedBoxes = [...boxes].sort((a, b) => String(a.boxNo).localeCompare(String(b.boxNo)));
    const rows = skus.map(sku => {
      const row = {
        skuId: sku.id,
        marketplaceSku: sku.marketplaceSku,
        internalSku: sku.internalSku,
        required: sku.requiredQty || 0,
        packed: sku.packedQty || 0,
        remaining: (sku.requiredQty || 0) - (sku.packedQty || 0),
        boxQtys: {},
        totalInBoxes: 0
      };
      sortedBoxes.forEach(box => {
        const item = box.items?.find(i => i.skuId === sku.id || i.marketplaceSku === sku.marketplaceSku);
        if (item) {
          row.boxQtys[box.boxNo] = item.qty || 0;
          row.totalInBoxes += item.qty || 0;
        }
      });
      return row;
    });
    return { rows, boxes: sortedBoxes };
  }, [consignment]);

  useEffect(() => {
    fetchConsignment();
  }, [id]);

  const fetchConsignment = async () => {
    try {
      setLoading(true);
      const response = await consignmentsAPI.getById(id);
      setConsignment(response.data.consignment);
    } catch (error) {
      addToast('Failed to load consignment', 'error');
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = (type) => {
    if (!pivotData) return;
    const rows = type === 'packed'
      ? pivotData.rows.filter(r => r.remaining <= 0)   // fully packed
      : pivotData.rows.filter(r => r.remaining > 0);   // still pending
    if (rows.length === 0) { addToast(`No ${type} SKUs to export`, 'warning'); return; }

    // Pending report focuses on what's LEFT (no packed column).
    // Packed report shows the completed items with how they were boxed.
    const headers = type === 'pending'
      ? ['#', 'Marketplace SKU', 'Internal SKU', 'Required', 'Pending (to pack)']
      : ['#', 'Marketplace SKU', 'Internal SKU', 'Required', 'Packed', 'Box wise Qty', 'Box number'];

    const csvRows = [headers.join(',')];
    let totRequired = 0, totPacked = 0, totPending = 0;

    rows.forEach((r, i) => {
      totRequired += r.required; totPacked += r.packed; totPending += Math.max(0, r.remaining);
      if (type === 'pending') {
        csvRows.push([i + 1, `"${r.marketplaceSku}"`, `"${r.internalSku}"`, r.required, Math.max(0, r.remaining)].join(','));
      } else {
        const boxEntries = [], boxNumbers = [];
        pivotData.boxes.forEach(b => {
          const qty = r.boxQtys[b.boxNo] || 0;
          if (qty > 0) { boxEntries.push(qty); boxNumbers.push(b.boxNo); }
        });
        csvRows.push([
          i + 1, `"${r.marketplaceSku}"`, `"${r.internalSku}"`,
          r.required, r.packed, `"${boxEntries.join(',')}"`, `"${boxNumbers.join(',')}"`
        ].join(','));
      }
    });

    // Totals row
    if (type === 'pending') {
      csvRows.push(['', '', 'TOTAL', totRequired, totPending].join(','));
    } else {
      csvRows.push(['', '', 'TOTAL', totRequired, totPacked, '', ''].join(','));
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${consignment.internalShipmentNo || consignment.id}_${type}_report.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast(`${rows.length} ${type} SKU(s) exported`, 'success');
  };

  const handleFileUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('consignmentId', id);
      formData.append('type', type);
      formData.append('description', `Manual ${type} upload`);

      await api.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      addToast('File uploaded successfully', 'success');
      fetchConsignment();
    } catch (error) {
      addToast('Upload failed: ' + (error.response?.data?.error || error.message || 'Unknown error'), 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFile = async () => {
    if (!deleteFile) return;
    try {
      await api.delete(`/uploads/${deleteFile.id}`, { params: { type: deleteFile.type } });
      addToast('File deleted', 'success');
      setDeleteFile(null);
      fetchConsignment();
    } catch (error) {
      addToast('Delete failed', 'error');
      setDeleteFile(null);
    }
  };

  // Build the 4×6 label page HTML for a single box (reused by single + bulk print)
  const buildBoxPagesHtml = (box) => {
    const items = box.items || [];
    const totalQty = items.reduce((s, i) => s + (i.qty || 0), 0);
    const barcodeValue = `${consignment.id}-BOX-${box.boxNo}`;

    // Generate barcode using JsBarcode
    const canvas = document.createElement('canvas');
    try {
      JsBarcode(canvas, barcodeValue, {
        format: 'CODE128',
        width: 2,
        height: 50,
        displayValue: true,
        fontSize: 10,
        margin: 2
      });
    } catch (e) {}
    const barcodeDataUrl = canvas.toDataURL ? canvas.toDataURL('image/png') : '';

    // Pagination: max ~22 SKU rows per 4×6 page (tight layout)
    const ROWS_PER_PAGE = 22;
    const pages = [];
    for (let i = 0; i < items.length; i += ROWS_PER_PAGE) {
      pages.push(items.slice(i, i + ROWS_PER_PAGE));
    }
    if (pages.length === 0) pages.push([]);

    const pageHtml = pages.map((pageItems, idx) => {
      const isLast = idx === pages.length - 1;
      const pageRows = pageItems.map(item =>
        `<tr><td style="padding:1px 0;border-bottom:1px dotted #bbb;font-size:8pt">${item.marketplaceSku || '—'}</td><td style="padding:1px 0;border-bottom:1px dotted #bbb;font-size:8pt">${item.internalSku || '—'}</td><td style="padding:1px 0;border-bottom:1px dotted #bbb;font-size:8pt;text-align:center;font-weight:bold;width:30px">${item.qty}</td></tr>`
      ).join('');

      const totalRow = isLast
        ? `<tr style="font-weight:bold;border-top:1.5px solid #000"><td style="padding-top:2px;font-size:8pt">Total In Box</td><td style="padding-top:2px"></td><td style="padding-top:2px;font-size:8pt;text-align:center">${totalQty}</td></tr>`
        : `<tr><td colspan="3" style="font-size:7pt;color:#666;text-align:center;padding:2px 0">continued on next page →</td></tr>`;

      const pageBadge = pages.length > 1
        ? `<div style="text-align:center;font-size:6pt;color:#666;margin-top:1px">Page ${idx + 1} of ${pages.length}</div>`
        : '';

      return `
        <div class="label-page" style="width:4in;height:6in;padding:0.1in;font-family:Arial,sans-serif;display:flex;flex-direction:column;box-sizing:border-box;${idx > 0 ? 'page-break-before:always;' : ''}">
          <div style="text-align:center;border-bottom:1.5px solid #000;padding-bottom:2px;margin-bottom:3px">
            <div style="font-size:11pt;font-weight:bold;letter-spacing:1px">YOUTHNIC EXPORTS</div>
            <div style="font-size:6.5pt;color:#555">Consignment Packing Station</div>
          </div>
          <div style="text-align:center;margin-bottom:2px">
            <div style="font-size:8pt;font-weight:bold;color:#333">BOX NUMBER</div>
            <div style="font-size:36pt;font-weight:900;color:#000;line-height:0.95;margin:1px 0">${box.boxNo}</div>
            <div style="font-size:8pt;font-weight:bold;color:#000;margin-bottom:1px">${consignment.internalShipmentNo || consignment.id}</div>
            ${consignment.shipmentNo && consignment.shipmentNo !== consignment.internalShipmentNo ? `<div style="font-size:7pt;color:#333;margin-bottom:1px">Shipment: ${consignment.shipmentNo}</div>` : ''}
            ${consignment.warehouse ? `<div style="font-size:7pt;color:#666;margin-bottom:1px">WH: ${consignment.warehouse}</div>` : ''}
            ${barcodeDataUrl ? `<img src="${barcodeDataUrl}" style="display:block;margin:0 auto;max-width:98%;height:38px" alt="${barcodeValue}" />` : `<div style="text-align:center;font-family:monospace;font-size:9pt;letter-spacing:1px;margin:1px 0">*${barcodeValue}*</div>`}
            ${pageBadge}
          </div>
          <div style="border-top:1px dashed #999;margin:2px 0"></div>
          <table style="width:100%;font-size:8pt;border-collapse:collapse;flex:1">
            <thead>
              <tr style="border-bottom:1px solid #000">
                <th style="text-align:left;padding:1px 0;font-size:6.5pt;text-transform:uppercase;width:35%">Marketplace SKU</th>
                <th style="text-align:left;padding:1px 0;font-size:6.5pt;text-transform:uppercase;width:45%">Internal SKU</th>
                <th style="text-align:center;padding:1px 0;font-size:6.5pt;text-transform:uppercase;width:20%">Qty In Box</th>
              </tr>
            </thead>
            <tbody>
              ${pageRows}
              ${totalRow}
            </tbody>
          </table>
          <div style="text-align:center;font-size:5.5pt;color:#777;margin-top:1px">Packed: ${new Date().toLocaleString()}</div>
        </div>
      `;
    }).join('');
    return pageHtml;
  };

  const openLabelWindow = (innerHtml, title) => {
    const w = window.open('', '_blank', 'width=600,height=800');
    w.document.write(`<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${title}</title>
          <style>
            @page { size: 4in 6in; margin: 0; }
            body { margin: 0; padding: 0; }
            .label-page { page-break-inside: avoid; }
            .no-print { display: none; }
          </style>
        </head>
        <body>
          ${innerHtml}
          <div class="no-print" style="text-align:center;padding:10px">
            <button onclick="window.print()" style="padding:8px 20px;font-size:12px;cursor:pointer">🖨️ Print 4×6 Labels</button>
          </div>
        </body>
      </html>`);
    w.document.close();
  };

  const printBoxLabel = (box) => {
    openLabelWindow(buildBoxPagesHtml(box), `Box #${box.boxNo} Label`);
  };

  const printAllLabels = () => {
    const boxes = consignment.boxes || [];
    if (boxes.length === 0) { addToast('No boxes to print', 'warning'); return; }
    const sorted = [...boxes].sort((a, b) => String(a.boxNo).localeCompare(String(b.boxNo), undefined, { numeric: true }));
    const html = sorted.map(b => buildBoxPagesHtml(b)).join('');
    openLabelWindow(html, `All Box Labels — ${consignment.internalShipmentNo || consignment.id}`);
    addToast(`Printing ${sorted.length} box labels`, 'success');
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-emerald-100 text-emerald-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      default: return 'bg-amber-100 text-amber-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-12 h-12 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!consignment) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 mx-auto text-red-400 mb-3" />
        <h2 className="text-xl font-bold text-slate-900">Consignment Not Found</h2>
        <button
          onClick={() => navigate('/consignments')}
          className="mt-4 text-primary-600 hover:text-primary-700 font-medium"
        >
          Back to Consignments
        </button>
      </div>
    );
  }

  const progressPct = consignment.totalRequiredQty > 0 
    ? Math.round((consignment.totalPackedQty / consignment.totalRequiredQty) * 100) 
    : 0;

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <button
          onClick={() => navigate('/consignments')}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Consignments
        </button>
        
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-slate-900">{consignment.internalShipmentNo || consignment.id}</h1>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(consignment.status)}`}>
                {consignment.status?.replace('_', ' ')}
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${consignment.shipmentStatus==='Planned'?'bg-slate-100 text-slate-700':consignment.shipmentStatus==='Under Packing'?'bg-orange-100 text-orange-800':consignment.shipmentStatus==='Ready'?'bg-emerald-100 text-emerald-800':consignment.shipmentStatus==='In Transit'||consignment.shipmentStatus==='Forwarded'?'bg-blue-100 text-blue-800':consignment.shipmentStatus==='Missed'?'bg-red-100 text-red-800':'bg-slate-100 text-slate-700'}`}>
                {consignment.shipmentStatus || 'Planned'}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <p className="text-slate-500 font-mono">{consignment.id}</p>
              {consignment.shipmentNo && (
                <p className="text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs font-semibold">
                  Shipment: {consignment.shipmentNo}
                </p>
              )}
            </div>
          </div>
          <div className="text-left sm:text-right">
            {consignment.marketplace?.name && <p className="text-xs text-primary-600">{consignment.marketplace.name}</p>}
            {consignment.warehouse && <p className="text-xs text-slate-500 mt-0.5">WH: {consignment.warehouse}</p>}
          </div>
        </div>
      </div>

      {/* Progress & Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-8">
        <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 mb-1">Progress</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-slate-200 rounded-full h-3">
              <div 
                className="bg-primary-500 h-3 rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-lg font-bold text-slate-900">{progressPct}%</span>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 mb-1">Total Items</p>
          <p className="text-2xl font-bold text-slate-900">{consignment.totalRequiredQty || 0}</p>
          <p className="text-xs text-slate-400">{consignment.totalPackedQty || 0} packed</p>
        </div>
        <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 mb-1">Boxes</p>
          <p className="text-2xl font-bold text-slate-900">{consignment.boxes?.length || 0}</p>
        </div>
        <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 mb-1">Expected Date</p>
          <p className="text-lg font-bold text-slate-900">{consignment.expectedDate || 'N/A'}</p>
        </div>
      </div>

      {/* Shipment Tracking Details — Collapsible */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 mb-8 overflow-hidden">
        {/* Section header — click to collapse/expand */}
        <div
          className="flex items-center justify-between px-5 py-3.5 cursor-pointer select-none hover:bg-slate-50 transition-colors"
          onClick={() => { if (!editingTracking) setTrackingOpen(o => !o); }}
        >
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Shipment Tracking Details</h3>
            {!trackingOpen && (
              <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">Collapsed</span>
            )}
          </div>
          <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
            {!editingTracking ? (
              <button onClick={openTrackingEdit} className="text-xs text-primary-600 hover:text-primary-700 font-medium px-2 py-1 hover:bg-indigo-50 rounded-lg transition-colors">Edit</button>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => setEditingTracking(false)} className="text-xs text-slate-500 hover:text-slate-700 font-medium">Cancel</button>
                <button onClick={saveTracking} disabled={savingTracking} className="text-xs text-white bg-indigo-600 hover:bg-indigo-700 font-medium px-3 py-1 rounded-lg transition-colors">{savingTracking ? 'Saving…' : 'Save Changes'}</button>
              </div>
            )}
            <button onClick={() => setTrackingOpen(o => !o)} className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
              {trackingOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
        {/* Collapsible body */}
        <div className={`collapsible-content ${trackingOpen ? 'open' : 'closed'}`}>
        <div className="px-5 pb-5">
        {editingTracking ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {[
              { label: 'Appointment Date', field: 'appointmentDate', type: 'date' },
              { label: 'Scheduled Dispatch', field: 'scheduledDispatchDate', type: 'date' },
              { label: 'Actual Dispatch', field: 'actualDispatchDate', type: 'date' },
              { label: 'Date of Inward', field: 'dateOfInward', type: 'date' },
              { label: 'PO Expiry Date', field: 'poExpiryDate', type: 'date' },
              { label: 'Forward Invoice', field: 'forwardInvoiceNo', type: 'text' },
              { label: 'Docket Company', field: 'docketCompany', type: 'text' },
              { label: 'Docket No', field: 'docketNo', type: 'text' },
              { label: 'Ticket ID', field: 'marketplaceTicketId', type: 'text' },
              { label: 'Shipment Status', field: 'shipmentStatus', type: 'select' },
              { label: 'Units Shipped', field: 'unitsShipped', type: 'number' },
              { label: 'Units Received', field: 'unitsReceived', type: 'number' },
              { label: 'Units Inwarded', field: 'unitsInwarded', type: 'number' },
              { label: 'QA Fail/Excess', field: 'qaFailExcessQty', type: 'number' },
            ].map((item) => (
              <div key={item.field}>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">{item.label}</label>
                {item.type === 'select' ? (
                  <select value={trackingForm[item.field] || ''} onChange={e => setTrackingForm({...trackingForm, [item.field]: e.target.value})} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none">
                    <option value="Planned">Planned</option>
                    <option value="Scheduled">Scheduled</option>
                    <option value="Under Packing">Under Packing</option>
                    <option value="Ready">Ready</option>
                    <option value="In Transit">In Transit</option>
                    <option value="Forwarded">Forwarded</option>
                    <option value="Missed">Missed</option>
                  </select>
                ) : (
                  <input type={item.type} value={trackingForm[item.field] || ''} onChange={e => setTrackingForm({...trackingForm, [item.field]: e.target.value})} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {[
              { label: 'Appointment Date', value: consignment.appointmentDate },
              { label: 'Scheduled Dispatch', value: consignment.scheduledDispatchDate },
              { label: 'Actual Dispatch', value: consignment.actualDispatchDate },
              { label: 'Date of Inward', value: consignment.dateOfInward },
              { label: 'PO Expiry Date', value: consignment.poExpiryDate },
              { label: 'Forward Invoice', value: consignment.forwardInvoiceNo },
              { label: 'Docket Company', value: consignment.docketCompany },
              { label: 'Docket No', value: consignment.docketNo },
              { label: 'Ticket ID', value: consignment.marketplaceTicketId },
              { label: 'Shipment Status', value: consignment.shipmentStatus },
              { label: 'Planned Qty', value: consignment.totalRequiredQty },
              { label: 'Total Packed', value: consignment.totalPackedQty },
              { label: 'Units Shipped', value: consignment.unitsShipped },
              { label: 'Units Received', value: consignment.unitsReceived },
              { label: 'Units Inwarded', value: consignment.unitsInwarded },
              { label: 'Short Qty', value: (consignment.totalRequiredQty || 0) - (consignment.unitsInwarded || 0), color: ((consignment.totalRequiredQty || 0) - (consignment.unitsInwarded || 0)) > 0 ? 'text-red-600' : 'text-emerald-600' },
              { label: 'QA Fail/Excess', value: consignment.qaFailExcessQty },
              { label: 'No. of Boxes', value: (consignment.boxes?.length || consignment.boxIds?.length || 0) },
            ].map((item, i) => (
              <div key={i} className="bg-slate-50 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{item.label}</p>
                <p className={`text-sm font-semibold ${item.color || 'text-slate-900'}`}>{item.value !== undefined && item.value !== '' ? item.value : '—'}</p>
              </div>
            ))}
          </div>
        )}
        </div>{/* /px-5 pb-5 */}
        </div>{/* /collapsible-content */}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100">
        <div className="flex border-b border-slate-100 overflow-x-auto sticky top-[60px] bg-white z-20 rounded-t-xl">
          {[
            { id: 'skus', label: 'SKU Items', icon: Package },
            { id: 'boxes', label: 'Boxes', icon: Box },
            { id: 'report', label: 'Packing Report', icon: FileSpreadsheet },
            { id: 'videos', label: 'Videos', icon: Video },
            { id: 'documents', label: 'Documents', icon: FileText },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 lg:px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs">
                {tab.id === 'skus' ? (consignment.skus?.length || 0) :
                 tab.id === 'boxes' ? (consignment.boxes?.length || 0) :
                 tab.id === 'report' ? 'View' :
                 tab.id === 'videos' ? (consignment.videos?.length || 0) :
                 (consignment.documents?.length || 0)}
              </span>
            </button>
          ))}
        </div>

        <div className="p-4 lg:p-6">
          {activeTab === 'skus' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase py-3">Barcode</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase py-3">Marketplace SKU</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase py-3">Internal SKU (OMS)</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase py-3">Required</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase py-3">Packed</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase py-3">Status</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase py-3">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {consignment.skus?.length > 0 ? (
                    consignment.skus.map((sku) => (
                      <tr key={sku.id} className="hover:bg-slate-50">
                        <td className="py-3 text-sm font-mono text-slate-400">{sku.barcode || sku.marketplaceSku || '—'}</td>
                        <td className="py-3 text-sm font-mono text-slate-600">{sku.marketplaceSku}</td>
                        <td className="py-3 text-sm font-medium text-slate-900">{sku.internalSku}</td>
                        <td className="py-3 text-sm text-slate-600">{sku.requiredQty}</td>
                        <td className="py-3 text-sm text-slate-600">{sku.packedQty}</td>
                        <td className="py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            sku.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {sku.status}
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="w-20 bg-slate-200 rounded-full h-1.5">
                            <div 
                              className={`h-1.5 rounded-full ${sku.status === 'completed' ? 'bg-emerald-500' : 'bg-primary-500'}`}
                              style={{ width: `${sku.requiredQty > 0 ? Math.min(100, (sku.packedQty / sku.requiredQty) * 100) : 0}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7" className="py-8 text-center text-slate-400">No SKUs found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'boxes' && (
            <div className="space-y-4">
              {consignment.boxes?.length > 0 && (
                <div className="flex justify-end">
                  <button onClick={printAllLabels} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors">
                    <Tag className="w-4 h-4" />Print All {consignment.boxes.length} Labels
                  </button>
                </div>
              )}
              {consignment.boxes?.length > 0 ? (
                consignment.boxes.map((box) => (
                  <div key={box.id} className="border border-slate-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Box className="w-5 h-5 text-primary-600" />
                        <span className="font-medium text-slate-900">Box #{box.boxNo}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => printBoxLabel(box)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-medium hover:bg-slate-700 transition-colors">
                          <Tag className="w-3.5 h-3.5" />Print Label
                        </button>
                        <span className="text-sm text-slate-500">{box.totalQty} items</span>
                      </div>
                    </div>
                    {box.items?.length > 0 && (
                      <div className="pl-8 space-y-2">
                        {box.items.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm">
                            <span className="text-slate-600">{item.internalSku || item.name}</span>
                            <span className="font-medium text-slate-900">x{item.qty}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-slate-400">No boxes found</div>
              )}
            </div>
          )}

          {activeTab === 'report' && pivotData && (
            <div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
                <h3 className="text-lg font-semibold text-slate-900">Box-wise Packing Breakdown</h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => exportCsv('packed')} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors">
                    <FileSpreadsheet className="w-3.5 h-3.5" />Export Packed
                  </button>
                  <button onClick={() => exportCsv('pending')} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 transition-colors">
                    <FileSpreadsheet className="w-3.5 h-3.5" />Export Pending
                  </button>
                  <span className="text-xs text-slate-500 ml-2">
                    {pivotData.rows.filter(r => r.remaining !== 0).length} pending, {pivotData.rows.filter(r => r.remaining === 0).length} complete
                  </span>
                </div>
              </div>

              {/* Report summary strip */}
              {(() => {
                const totReq = pivotData.rows.reduce((s, r) => s + (r.required || 0), 0);
                const totPacked = pivotData.rows.reduce((s, r) => s + (r.packed || 0), 0);
                const totPending = Math.max(0, totReq - totPacked);
                const pct = totReq > 0 ? Math.round((totPacked / totReq) * 100) : 0;
                const cards = [
                  { label: 'Total SKUs', value: pivotData.rows.length, color: 'text-slate-900' },
                  { label: 'Required', value: totReq, color: 'text-slate-700' },
                  { label: 'Packed', value: totPacked, color: 'text-emerald-600' },
                  { label: 'Pending', value: totPending, color: 'text-amber-600' },
                  { label: 'Boxes', value: pivotData.boxes.length, color: 'text-indigo-600' },
                  { label: 'Complete', value: `${pct}%`, color: 'text-primary-600' },
                ];
                return (
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
                    {cards.map(c => (
                      <div key={c.label} className="bg-slate-50 rounded-lg px-3 py-2 text-center">
                        <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400">{c.label}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">#</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Marketplace SKU</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Internal SKU</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Required</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Packed</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Remaining</th>
                      {pivotData.boxes.map(b => (
                        <th key={b.boxNo} className="text-center px-3 py-3 text-xs font-semibold text-white bg-primary-600 uppercase whitespace-nowrap">Box #{b.boxNo}</th>
                      ))}
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Total in Boxes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pivotData.rows.map((row, idx) => (
                      <tr key={row.skuId} className={`${row.remaining === 0 ? 'bg-emerald-50/50' : row.remaining < 0 ? 'bg-red-50/50' : ''} hover:bg-slate-50`}>
                        <td className="px-4 py-3 text-xs text-slate-400">{idx + 1}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">{row.marketplaceSku}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{row.internalSku}</td>
                        <td className="px-4 py-3 text-center font-semibold text-slate-700">{row.required}</td>
                        <td className="px-4 py-3 text-center font-semibold text-primary-600">{row.packed}</td>
                        <td className="px-4 py-3 text-center font-bold">
                          {row.remaining === 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" />0</span>
                          ) : row.remaining < 0 ? (
                            <span className="inline-flex items-center gap-1 text-red-600"><AlertCircle className="w-3.5 h-3.5" />{row.remaining}</span>
                          ) : (
                            <span className="text-amber-600">{row.remaining}</span>
                          )}
                        </td>
                        {pivotData.boxes.map(b => {
                          const qty = row.boxQtys[b.boxNo] || 0;
                          return (
                            <td key={b.boxNo} className={`px-3 py-3 text-center font-mono text-xs ${qty > 0 ? 'bg-primary-50 text-primary-700 font-bold' : 'text-slate-300'}`}>
                              {qty > 0 ? qty : '—'}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-center font-bold text-slate-900">{row.totalInBoxes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'videos' && (
            <div>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Box-wise Videos</h3>
                <div className="flex items-center gap-2">
                  {consignment.videos?.length > 0 && (
                    <button onClick={() => {
                      const headers = ['Box No', 'File Name', 'Video URL', 'Size (KB)', 'Uploaded At'];
                      const csvRows = [headers.join(',')];
                      consignment.videos.forEach(v => {
                        csvRows.push([v.boxNo || 'Unassigned', `"${v.originalName}"`, v.firebaseUrl || '', Math.round((v.size || 0) / 1024), new Date(v.uploadedAt).toLocaleString()].join(','));
                      });
                      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${consignment.internalShipmentNo || consignment.id}_videos.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                      addToast('Video list exported', 'success');
                    }} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                      <FileSpreadsheet className="w-3.5 h-3.5" />Export List
                    </button>
                  )}
                  <label className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 cursor-pointer transition-colors text-sm">
                    <Upload className="w-4 h-4" />
                    {uploading ? 'Uploading...' : 'Upload Video'}
                    <input type="file" accept="video/*" className="hidden" onChange={(e) => handleFileUpload(e, 'video')} disabled={uploading} />
                  </label>
                </div>
              </div>
              {consignment.videos?.length > 0 ? (
                (() => {
                  const grouped = {};
                  consignment.videos.forEach(v => {
                    const box = v.boxNo || 'Unassigned';
                    if (!grouped[box]) grouped[box] = [];
                    grouped[box].push(v);
                  });
                  return Object.entries(grouped).sort((a,b) => String(a[0]).localeCompare(String(b[0]))).map(([boxNo, videos]) => (
                    <div key={boxNo} className="mb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <Box className="w-4 h-4 text-primary-600" />
                        <h4 className="text-sm font-bold text-slate-900">Box #{boxNo}</h4>
                        <span className="text-xs text-slate-500">({videos.length} video{videos.length>1?'s':''})</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {videos.map(video => (
                          <div key={video.id} className="border border-slate-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                            {video.firebaseUrl ? (
                              <video controls className="w-full aspect-video bg-slate-900" preload="metadata">
                                <source src={video.firebaseUrl} type={video.mimeType || 'video/webm'} />
                              </video>
                            ) : (
                              <div className="aspect-video bg-slate-900 flex items-center justify-center">
                                <Video className="w-12 h-12 text-slate-600" />
                              </div>
                            )}
                            <div className="p-3">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-slate-900 truncate flex-1">{video.originalName}</p>
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded ml-2">{Math.round((video.size || 0) / 1024)} KB</span>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">{new Date(video.uploadedAt).toLocaleString()}</p>
                              <div className="flex items-center gap-2 mt-2">
                                {video.firebaseUrl && (
                                  <>
                                    <a href={video.firebaseUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 bg-primary-50 px-2 py-1 rounded">
                                      <ExternalLink className="w-3 h-3" /> Open
                                    </a>
                                    <button onClick={() => {
                                      navigator.clipboard?.writeText(video.firebaseUrl);
                                      addToast('Link copied to clipboard', 'success');
                                    }} className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800 bg-slate-100 px-2 py-1 rounded transition-colors">
                                      <Copy className="w-3 h-3" /> Copy Link
                                    </button>
                                    <a href={video.firebaseUrl} download={video.originalName} className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2 py-1 rounded transition-colors">
                                      <Download className="w-3 h-3" /> Download
                                    </a>
                                  </>
                                )}
                                <button onClick={() => setDeleteFile({ id: video.id, type: 'video', name: video.originalName })} className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 ml-auto bg-red-50 px-2 py-1 rounded transition-colors">
                                  <Trash2 className="w-3 h-3" /> Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()
              ) : (
                <div className="text-center py-8 text-slate-400">No videos uploaded</div>
              )}
            </div>
          )}

          {activeTab === 'documents' && (
            <div>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Documents</h3>
                <label className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 cursor-pointer transition-colors text-sm">
                  <Upload className="w-4 h-4" />
                  {uploading ? 'Uploading...' : 'Upload Document'}
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, 'document')}
                    disabled={uploading}
                  />
                </label>
              </div>
              <div className="space-y-3">
                {consignment.documents?.length > 0 ? (
                  consignment.documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <FileText className="w-8 h-8 text-primary-600" />
                        <div>
                          <p className="text-sm font-medium text-slate-900">{doc.originalName}</p>
                          <p className="text-xs text-slate-500">
                            {new Date(doc.uploadedAt).toLocaleDateString()} • {(doc.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {doc.firebaseUrl && (
                          <a
                            href={doc.firebaseUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-slate-400 hover:text-primary-600 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                        <button
                          onClick={() => setDeleteFile({ id: doc.id, type: 'document', name: doc.originalName })}
                          className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-slate-400">No documents uploaded</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* File Delete Confirmation */}
      <ConfirmModal
        show={!!deleteFile}
        title="Delete File?"
        message={<span>Are you sure you want to delete <strong className="text-slate-800">{deleteFile?.name}</strong>? This will also remove it from Firebase Storage.</span>}
        confirmLabel="Delete File"
        loading={false}
        onConfirm={handleDeleteFile}
        onCancel={() => setDeleteFile(null)}
      />
    </div>
  );
};

export default ConsignmentDetail;

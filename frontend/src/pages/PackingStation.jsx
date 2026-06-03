import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { packingAPI } from '../services/api';
import api from '../services/api';
import { saveVideoToQueue, getPendingVideos, markVideoUploaded, incrementRetry, getQueueCount } from '../utils/videoQueue';
import { ArrowLeft, Boxes } from 'lucide-react';

/* ═══ SOUND ENGINE ═══ */
const sfx = (() => {
  let ctx = null;
  function ac() { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); return ctx; }
  function beep(freq, type, dur, vol, sd, fe) {
    const a = ac(), o = a.createOscillator(), g = a.createGain();
    o.connect(g); g.connect(a.destination);
    const t = a.currentTime + sd;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (fe !== undefined) o.frequency.exponentialRampToValueAtTime(fe, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t); o.stop(t + dur);
  }
  return {
    cid: () => { beep(660, 'sine', .15, .4, 0); beep(990, 'sine', .2, .4, .15); },
    box: () => { beep(440, 'triangle', .12, .5, 0, 500); },
    scan: () => { beep(1200, 'square', .06, .25, 0); },
    err: () => { beep(480, 'sawtooth', .08, .6, 0, 180); beep(180, 'sawtooth', .15, .6, .07); }
  };
})();

/* ═══ TOAST ═══ */
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((message, type = 'info', dur = 3000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), dur);
  }, []);
  const removeToast = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);
  return { toasts, toast, removeToast };
}

const ToastContainer = ({ toasts, onRemove }) => (
  <div className="fixed bottom-3 right-3 z-[9999] flex flex-col-reverse gap-[5px] max-w-[320px]">
    {toasts.map(t => (
      <div key={t.id} onClick={() => onRemove(t.id)}
        className={`px-3 py-2 rounded-lg text-[11px] font-medium flex items-center gap-1.5 shadow-lg cursor-pointer animate-[slideIn_.3s] border bg-white
          ${t.type==='success'?'border-l-[3px] border-l-emerald-500':''}
          ${t.type==='error'?'border-l-[3px] border-l-red-500':''}
          ${t.type==='warning'?'border-l-[3px] border-l-amber-500':''}
          ${t.type==='info'?'border-l-[3px] border-l-blue-500':''}`}>
        {t.type==='success'&&'✅'}{t.type==='error'&&'❌'}{t.type==='warning'&&'⚠️'}{t.type==='info'&&'ℹ️'}
        <span>{t.message}</span>
      </div>
    ))}
  </div>
);

/* ═══ MODAL ═══ */
function Modal({ show, title, children, onClose, actions }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center backdrop-blur-[3px]" onClick={onClose}>
      <div className="bg-white border border-slate-200 rounded-xl p-5 max-w-[420px] w-[90%] shadow-2xl max-h-[80vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <h3 className="text-[15px] font-bold mb-1.5 text-slate-900">{title}</h3>
        <div className="text-[12px] text-slate-600 mb-3.5 leading-relaxed">{children}</div>
        {actions && <div className="flex gap-2 justify-center">{actions}</div>}
      </div>
    </div>
  );
}

/* ═══ MAIN COMPONENT ═══ */
export default function PackingStation() {
  const navigate = useNavigate();
  const { toasts, toast, removeToast } = useToasts();
  
  // State
  const [S, setS] = useState({ cid: null, intShip: null, box: null, skus: [], boxes: {} });
  const [skuFilter, setSkuFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [showMo, setShowMo] = useState(false);
  const [moConfig, setMoConfig] = useState({ title: '', body: '', actions: null });
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [resumeList, setResumeList] = useState([]);
  const [showDashboard, setShowDashboard] = useState(false);
  const [dashData, setDashData] = useState(null);
  const [syncState, setSyncState] = useState('synced');
  const [recState, setRecState] = useState('STANDBY');
  const [recDuration, setRecDuration] = useState('00:00');
  const [recSize, setRecSize] = useState('0 MB');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const [camRes, setCamRes] = useState('—');
  const [camActive, setCamActive] = useState(false);
  const [theme, setTheme] = useState('light');
  const [zone, setZone] = useState(1);
  const [uploading,      setUploading]      = useState(false);
  const [pendingUploads, setPendingUploads]  = useState(0);
  const [consignmentList,setConsignmentList] = useState([]);
  const [uploadLog,      setUploadLog]       = useState([]);   // [{name, status, progress}]
  const [showUploadLog,  setShowUploadLog]   = useState(false);

  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordedBytesRef = useRef(0);
  const recTimerRef = useRef(null);
  const recStartRef = useRef(0);
  const offCanvasRef = useRef(null);
  const composeIntervalRef = useRef(null);
  const animFrameRef = useRef(null);
  const recBoxIdRef = useRef(null);
  const recCidRef = useRef(null);
  const recIntShipRef = useRef(null);
  const inCidRef = useRef(null);
  const inBoxRef = useRef(null);
  const inSkuRef = useRef(null);

  // Theme — disabled, uses app standard theme
  useEffect(() => {
    document.body.dataset.theme = 'light';
  }, []);

  // Check resume on mount + start background upload queue
  useEffect(() => {
    checkResume();
    fetchConsignments();
    updatePendingCount();
    const si = setInterval(checkSyncStatus, 30000);
    const qi = setInterval(processVideoQueue, 15000);
    return () => { clearInterval(si); clearInterval(qi); };
  }, []);

  const updatePendingCount = async () => {
    const count = await getQueueCount();
    setPendingUploads(count);
  };

  const processVideoQueue = async (showLog = false) => {
    const pending = await getPendingVideos();
    if (pending.length === 0) return;
    setPendingUploads(pending.length);

    if (showLog) {
      setUploadLog(pending.map(v => ({ id: v.id, name: v.metadata.fileName, boxNo: v.metadata.boxNo, status: 'queued', progress: 0 })));
      setShowUploadLog(true);
    }

    for (const video of pending) {
      if (showLog) setUploadLog(prev => prev.map(l => l.id === video.id ? { ...l, status: 'uploading', progress: 10 } : l));
      try {
        const { blob, metadata } = video;
        const file = new File([blob], metadata.fileName, { type: metadata.mimeType });
        const formData = new FormData();
        formData.append('file', file);
        formData.append('consignmentId', metadata.consignmentId);
        formData.append('type', 'video');
        formData.append('boxNo', metadata.boxNo);
        formData.append('description', metadata.description);

        await api.post('/uploads', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (evt) => {
            if (showLog) {
              const pct = Math.round((evt.loaded / evt.total) * 100);
              setUploadLog(prev => prev.map(l => l.id === video.id ? { ...l, progress: pct } : l));
            }
          }
        });
        await markVideoUploaded(video.id);
        if (showLog) setUploadLog(prev => prev.map(l => l.id === video.id ? { ...l, status: 'done', progress: 100 } : l));
        toast(`Video uploaded: Box #${metadata.boxNo}`, 'success');
      } catch (e) {
        await incrementRetry(video.id);
        if (showLog) setUploadLog(prev => prev.map(l => l.id === video.id ? { ...l, status: 'error' } : l));
        console.error('Queue upload retry failed:', e);
      }
    }
    const remaining = await getQueueCount();
    setPendingUploads(remaining);
  };

  const checkSyncStatus = async () => {
    try { const r = await packingAPI.syncStatus(); setSyncState(r.data.state); } catch (e) {}
  };

  const checkResume = async () => {
    try {
      const r = await packingAPI.resumeSession();
      if (r.data.available && r.data.consignments?.length) {
        setResumeList(r.data.consignments);
        setShowResumeModal(true);
      }
    } catch (e) {}
  };

  const fetchConsignments = async () => {
    try {
      const { data } = await api.get('/consignments?status=pending,in_progress&limit=200');
      setConsignmentList(data.consignments || []);
    } catch (e) {}
  };

  const goBack = () => navigate('/consignments');

  const setZoneState = (n) => {
    setZone(n);
    setTimeout(() => {
      if (n === 1) inCidRef.current?.focus();
      if (n === 2) inBoxRef.current?.focus();
      if (n === 3) inSkuRef.current?.focus();
    }, 100);
  };

  /* ═══ CAMERA ═══ */
  const startCamera = async () => {
    try {
      // Request 2K (2560×1440). Browser will give the closest supported resolution.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width:  { ideal: 2560, min: 1280 },
          height: { ideal: 1440, min: 720 },
          frameRate: { ideal: 30 },
          facingMode: 'environment'
        },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      await new Promise(r => { videoRef.current.onloadedmetadata = r; });
      await videoRef.current.play();
      const s = stream.getVideoTracks()[0].getSettings();
      setCamRes(`${s.width || videoRef.current.videoWidth}×${s.height || videoRef.current.videoHeight}`);
      setCamActive(true);
      toast('Camera active (' + camRes + ')', 'success');
      startCanvasOverlay();
    } catch (err) {
      toast('Camera error: ' + err.message, 'error');
    }
  };

  const startCanvasOverlay = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    
    const draw = () => {
      const w = 480, h = 270;
      canvas.width = w; canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      
      const now = new Date();
      const pz = (n) => String(n).padStart(2, '0');
      const ts = `${pz(now.getDate())}-${pz(now.getMonth()+1)}-${now.getFullYear()} ${pz(now.getHours())}:${pz(now.getMinutes())}:${pz(now.getSeconds())}`;
      
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(w - 174, 2, 172, 18);
      ctx.font = '500 9px "JetBrains Mono",monospace';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'right';
      ctx.fillText(ts, w - 5, 15);
      ctx.textAlign = 'left';
      
      if (mediaRecorderRef.current?.state === 'recording') {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(5, 4, 46, 16);
        ctx.beginPath();
        ctx.fillStyle = `rgba(220,38,38,${0.6 + 0.4 * Math.sin(Date.now() / 280)})`;
        ctx.arc(17, 12, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 8px "JetBrains Mono",monospace';
        ctx.fillText('REC', 24, 16);
      }
      
      if (S.cid) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, h - 17, w, 17);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = '8px "JetBrains Mono",monospace';
        const labelText = (S.intShip || S.cid) + (S.box ? ' / Box ' + S.box : '');
        ctx.fillText(labelText, 7, h - 5);
      }
      
      animFrameRef.current = requestAnimationFrame(draw);
    };
    draw();
  };

  const startRecording = (explicitCid, explicitBox) => {
    if (!streamRef.current) { toast('Start camera first', 'warning'); return; }
    if (mediaRecorderRef.current?.state === 'recording') return;
    
    recordedChunksRef.current = [];
    recordedBytesRef.current = 0;
    
    // Record at 2K resolution
    const offC = document.createElement('canvas');
    offC.width = 2560; offC.height = 1440;
    offCanvasRef.current = offC;
    
    recBoxIdRef.current = explicitBox || S.box;
    recCidRef.current = explicitCid || S.cid;
    recIntShipRef.current = S.intShip || S.cid;
    
    composeIntervalRef.current = setInterval(() => {
      const oc = offCanvasRef.current;
      if (!oc) return;
      const ox = oc.getContext('2d');
      const w = oc.width, h = oc.height;
      ox.drawImage(videoRef.current, 0, 0, w, h);
      
      const now = new Date();
      const pz = (n) => String(n).padStart(2, '0');
      const ts = `${pz(now.getDate())}-${pz(now.getMonth()+1)}-${now.getFullYear()} ${pz(now.getHours())}:${pz(now.getMinutes())}:${pz(now.getSeconds())}`;
      
      ox.font = 'bold 18px "Courier New",monospace';
      const tw = ox.measureText(ts).width + 16;
      ox.fillStyle = 'rgba(0,0,0,0.6)';
      ox.fillRect(w - tw - 6, 4, tw + 4, 26);
      ox.fillStyle = '#fff';
      ox.textAlign = 'right';
      ox.fillText(ts, w - 10, 24);
      ox.textAlign = 'left';
      
      ox.fillStyle = 'rgba(0,0,0,0.55)';
      ox.fillRect(6, 4, 70, 26);
      ox.fillStyle = `rgba(220,38,38,${0.6 + 0.4 * Math.sin(Date.now() / 280)})`;
      ox.beginPath();
      ox.arc(22, 17, 6, 0, Math.PI * 2);
      ox.fill();
      ox.fillStyle = '#ff4444';
      ox.font = 'bold 13px "Courier New",monospace';
      ox.fillText('REC', 34, 22);
      
      if (recCidRef.current) {
        ox.fillStyle = 'rgba(0,0,0,0.5)';
        ox.fillRect(0, h - 30, w, 30);
        ox.fillStyle = 'rgba(255,255,255,0.85)';
        ox.font = 'bold 16px "Courier New",monospace';
        const recLabel = (recIntShipRef.current || recCidRef.current) + (recBoxIdRef.current ? ' / Box ' + recBoxIdRef.current : '');
        ox.fillText(recLabel, 10, h - 9);
      }
    }, 66);
    
    const cs = offC.captureStream(15);
    const mo = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    let mt = '';
    for (const m of mo) { if (MediaRecorder.isTypeSupported(m)) { mt = m; break; } }
    
    mediaRecorderRef.current = new MediaRecorder(cs, mt ? { mimeType: mt, videoBitsPerSecond: 4000000 } : { videoBitsPerSecond: 4000000 });
    mediaRecorderRef.current.ondataavailable = (e) => {
      if (e.data?.size > 0) {
        recordedChunksRef.current.push(e.data);
        recordedBytesRef.current += e.data.size;
        setRecSize((recordedBytesRef.current / 1024 / 1024).toFixed(1) + ' MB');
      }
    };
    
    recStartRef.current = Date.now();
    recTimerRef.current = setInterval(() => {
      const e = Math.floor((Date.now() - recStartRef.current) / 1000);
      setRecDuration(`${String(Math.floor(e/60)).padStart(2,'0')}:${String(e%60).padStart(2,'0')}`);
    }, 1000);
    
    mediaRecorderRef.current.start(1000);
    setRecState('REC');
    toast('Recording Box ' + S.box, 'info');
  };

  const stopRecording = async (silent = false) => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      if (!silent) toast('Nothing is recording', 'warning');
      return;
    }
    clearInterval(recTimerRef.current);
    clearInterval(composeIntervalRef.current);
    
    return new Promise((resolve) => {
      mediaRecorderRef.current.onstop = async () => {
        setRecState('STANDBY');
        setRecDuration('00:00');
        setRecSize('0 MB');
        
        const chunks = recordedChunksRef.current;
        const actualType = mediaRecorderRef.current?.mimeType || 'video/webm';
        const blob = new Blob(chunks, { type: actualType });
        const cid = recCidRef.current;
        const box = recBoxIdRef.current;
        
        if (blob.size > 1000 && cid && box) {
          const ext = actualType.includes('mp4') ? 'mp4' : 'webm';
          const fileName = `${cid}_box_${box}_${Date.now()}.${ext}`;
          const metadata = { fileName, mimeType: actualType, consignmentId: cid, boxNo: box, description: `Box ${box} packing video` };
          
          // 1. Always save to IndexedDB first (offline safety)
          try {
            await saveVideoToQueue(blob, metadata);
            await updatePendingCount();
            console.log('[Video] Saved to local IndexedDB queue');
          } catch (dbErr) {
            console.error('[Video] IndexedDB save failed:', dbErr);
          }
          
          // 2. Try immediate upload
          try {
            setUploading(true);
            const file = new File([blob], fileName, { type: actualType });
            const formData = new FormData();
            formData.append('file', file);
            formData.append('consignmentId', cid);
            formData.append('type', 'video');
            formData.append('boxNo', box);
            formData.append('description', metadata.description);
            
            await api.post('/uploads', formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
            });
            
            // Remove from queue if immediate upload succeeded
            const pending = await getPendingVideos();
            const match = pending.find(v => v.metadata.fileName === fileName);
            if (match) await markVideoUploaded(match.id);
            await updatePendingCount();
            
            if (!silent) toast('Video saved to cloud ✓', 'success');
          } catch (e) {
            console.error('[Video] Immediate upload failed, queued for retry:', e);
            if (!silent) toast('Video saved locally — will auto-upload when online', 'warning');
          }
          setUploading(false);
        }
        
        if (!silent) toast('Recording stopped', 'info');
        resolve();
      };
      mediaRecorderRef.current.stop();
    });
  };

  /* ═══ WORKFLOW ═══ */
  const doLoad = async () => {
    const v = inCidRef.current?.value.trim();
    if (!v) { toast('Enter ID', 'warning'); return; }
    setLoading(true);
    try {
      const r = await packingAPI.load({ consignment_id: v });
      const actualCid = r.data.consignment_id || v;
      sfx.cid();
      setS({ cid: actualCid, intShip: r.data.internalShipmentNo || v, box: null, skus: r.data.skus, boxes: r.data.boxes || {} });
      toast('Loaded ' + actualCid + ' — ' + r.data.total_skus + ' SKUs', 'success');
      setZoneState(2);
      inCidRef.current.value = '';
      // Auto-start camera when consignment loads
      if (!streamRef.current) {
        toast('Starting camera...', 'info');
        await startCamera();
      }
    } catch (e) {
      toast(e.response?.data?.error || 'Error', 'error');
    }
    setLoading(false);
  };

  const autoSaveCurrentBox = async () => {
    // Only auto-save if there are unsaved items (box is active and has items)
    if (!S.cid || !S.box || !S.boxes[S.box]?.length) return;
    try {
      await packingAPI.saveBox({ consignment_id: S.cid, box_no: S.box });
      toast('Box ' + S.box + ' auto-saved ✔', 'success', 3000);
    } catch (e) {
      toast('Auto-save warning', 'warning');
    }
    await stopRecording(true);
  };

  const doBox = async () => {
    const v = inBoxRef.current?.value.trim();
    if (!v) { toast('Enter box no', 'warning'); return; }
    
    if (S.box && S.box !== v) await autoSaveCurrentBox();
    
    try {
      const dup = await packingAPI.checkDuplicateBox({ consignment_id: S.cid, box_no: v });
      if (dup.data.duplicate) {
        setMoConfig({
          title: '⚠️ Duplicate Box',
          body: `Box ${v} already exists with ${dup.data.total_qty} items. Continue adding or create fresh?`,
          actions: (
            <>
              <button onClick={() => setShowMo(false)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-[11px] font-medium">Cancel</button>
              <button onClick={() => { setShowMo(false); _setBox(v); }} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-[11px] font-medium">Continue</button>
            </>
          )
        });
        setShowMo(true);
        return;
      }
    } catch (e) {}
    _setBox(v);
  };

  const _setBox = (v) => {
    if (!streamRef.current) {
      toast('Camera must be active before packing. Click "Start Camera" or reload consignment.', 'error', 5000);
      setMoConfig({
        title: 'Camera Required',
        body: 'CCTV recording is mandatory for packing. Please start the camera before entering a box number.',
        actions: (
          <button onClick={() => { setShowMo(false); startCamera(); }} className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-[11px] font-medium">Start Camera</button>
        )
      });
      setShowMo(true);
      return;
    }
    setS(prev => ({ ...prev, box: v, boxes: { ...prev.boxes, [v]: prev.boxes[v] || [] } }));
    sfx.box();
    toast('Box ' + v + ' active', 'success');
    setZoneState(3);
    inBoxRef.current.value = '';
    if (S.cid) startRecording(S.cid, v);
  };

  const doScan = async () => {
    const bc = inSkuRef.current?.value.trim();
    if (!bc || !S.cid || !S.box) return;
    try {
      const r = await packingAPI.increment({ consignment_id: S.cid, barcode: bc, box_no: S.box, qty: 1 });
      if (r.data.not_found) { sfx.err(); toast('Not found: ' + bc, 'error'); flash('err'); return; }
      if (r.data.over_limit || r.data.locked) { sfx.err(); toast(r.data.message, 'error', 5000); flash('err'); if (navigator.vibrate) navigator.vibrate([200, 100, 200]); return; }
      
      setS(prev => ({
        ...prev,
        skus: prev.skus.map(s => s.marketplaceSku === bc ? { ...s, packed: r.data.packed, remaining: r.data.remaining, status: r.data.remaining <= 0 ? 'completed' : 'pending' } : s),
        boxes: { ...prev.boxes, [prev.box]: r.data.box_items }
      }));
      
      sfx.scan();
      if (navigator.vibrate) navigator.vibrate(50);
      toast('✓ ' + (r.data.internalSku || bc).substring(0, 20) + ' (' + r.data.packed + '/' + r.data.required + ')', 'success');
      flash('ok');
    } catch (e) { toast('Error', 'error'); }
    inSkuRef.current.value = '';
    setTimeout(() => inSkuRef.current?.focus(), 50);
  };

  const removeItem = async (marketplaceSku) => {
    if (!S.cid || !S.box) return;
    try {
      const r = await packingAPI.decrement({ consignment_id: S.cid, barcode: marketplaceSku, box_no: S.box, qty: 1 });
      setS(prev => ({
        ...prev,
        skus: prev.skus.map(s => s.marketplaceSku === marketplaceSku ? { ...s, packed: r.data.packed, remaining: r.data.remaining, status: r.data.remaining > 0 ? 'pending' : 'completed' } : s),
        boxes: { ...prev.boxes, [prev.box]: (prev.boxes[prev.box] || []).map(i => i.marketplaceSku === marketplaceSku ? { ...i, qty: i.qty - 1 } : i).filter(i => i.qty > 0) }
      }));
      toast('Removed', 'info');
    } catch (e) {}
  };

  const doSaveBox = async () => {
    if (!S.cid || !S.box || !S.boxes[S.box]?.length) { toast('Box empty', 'warning'); return; }
    setLoading(true);
    const savedBox = S.box;
    try {
      await packingAPI.saveBox({ consignment_id: S.cid, box_no: savedBox });
      await packingAPI.generateLabel({ consignment_id: S.cid, box_no: savedBox });
      await stopRecording(true);
      // Move to next box zone so user can't accidentally re-scan into the saved box
      setS(prev => ({ ...prev, box: null }));
      setZoneState(2);
      toast('Box ' + savedBox + ' saved & label generated! Enter next box number.', 'success', 5000);
    } catch (e) { toast('Error saving box', 'error'); }
    setLoading(false);
  };

  const doNewBox = async () => {
    setLoading(true);
    await autoSaveCurrentBox();
    setS(prev => ({ ...prev, box: null }));
    setZoneState(2);
    setLoading(false);
    // Show drop-wise upload progress for any queued videos
    const count = await getQueueCount();
    if (count > 0) processVideoQueue(true);
  };

  const doFinish = () => {
    const pending = S.skus.filter(s => s.remaining > 0).sort((a, b) => b.remaining - a.remaining);
    const totalReq = S.skus.reduce((s, k) => s + k.required, 0);
    const totalPkd = S.skus.reduce((s, k) => s + k.packed, 0);
    const boxCount = Object.keys(S.boxes).filter(k => S.boxes[k].length > 0).length;
    const pct = totalReq > 0 ? Math.round(totalPkd / totalReq * 100) : 0;

    setMoConfig({
      title: 'Finish ' + S.cid + '?',
      body: (
        <div>
          <div className="grid grid-cols-3 gap-1.5 my-2">
            <div className="bg-slate-50 p-2 rounded-md text-center"><div className="text-lg font-extrabold text-emerald-600">{totalPkd}/{totalReq}</div><div className="text-[8px] text-slate-400 uppercase">Packed</div></div>
            <div className="bg-slate-50 p-2 rounded-md text-center"><div className="text-lg font-extrabold text-red-500">{pct}%</div><div className="text-[8px] text-slate-400 uppercase">Complete</div></div>
            <div className="bg-slate-50 p-2 rounded-md text-center"><div className="text-lg font-extrabold">{boxCount}</div><div className="text-[8px] text-slate-400 uppercase">Boxes</div></div>
          </div>
          {pending.length > 0 && (
            <>
              <div className="text-amber-600 font-semibold text-[11px] mb-1.5">⚠️ {pending.length} SKUs still pending</div>
              <div className="max-h-[150px] overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-[10px]">
                  <thead><tr className="bg-slate-50"><th className="p-1 text-left text-slate-700">Name</th><th className="p-1 text-slate-700">Req</th><th className="p-1 text-slate-700">Pkd</th><th className="p-1 text-red-500">Left</th></tr></thead>
                  <tbody>{pending.map(p => <tr key={p.marketplaceSku} className="border-b border-slate-100"><td className="p-1 truncate max-w-[120px] text-slate-700">{p.internalSku}</td><td className="p-1 text-center text-slate-700">{p.required}</td><td className="p-1 text-center text-slate-700">{p.packed}</td><td className="p-1 text-center text-red-600 font-bold">{p.remaining}</td></tr>)}</tbody>
                </table>
              </div>
            </>
          )}
          {pending.length === 0 && <div className="text-emerald-600 font-semibold my-2">✅ All SKUs fully packed! Consignment complete.</div>}
        </div>
      ),
      actions: (
        <>
          <button onClick={() => setShowMo(false)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-[11px] font-medium">Cancel</button>
          <button onClick={async () => { setShowMo(false); setLoading(true); await autoSaveCurrentBox(); try { const res = await packingAPI.finish({ consignment_id: S.cid }); const summary = res.data.summary; if (!summary.fully_packed) { toast(S.cid + ' saved — still ' + (summary.totalRequiredQty - summary.totalPackedQty) + ' items pending', 'warning', 5000); } else { toast(S.cid + ' COMPLETE! ✅', 'success', 5000); } resetAll(); } catch (e) { toast('Error', 'error'); } setLoading(false); }} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-[11px] font-medium">Finish</button>
        </>
      )
    });
    setShowMo(true);
  };

  const resetAll = () => {
    setS({ cid: null, intShip: null, box: null, skus: [], boxes: {} });
    inCidRef.current && (inCidRef.current.value = '');
    inBoxRef.current && (inBoxRef.current.value = '');
    inSkuRef.current && (inSkuRef.current.value = '');
    setZoneState(1);
  };

  const flash = (type) => {
    const el = document.getElementById('z3');
    if (!el) return;
    el.classList.add(type === 'err' ? 'flash-err' : 'flash-ok');
    setTimeout(() => el.classList.remove('flash-ok', 'flash-err'), 500);
  };

  const doDL = () => { if (S.cid) window.open('/api/consignments/' + S.cid + '/labels', '_blank'); };

  const printPendingSkus = () => {
    const pending = S.skus.filter(s => s.remaining > 0).sort((a, b) => b.remaining - a.remaining);
    const totalReq = S.skus.reduce((s, k) => s + k.required, 0);
    const totalPkd = S.skus.reduce((s, k) => s + k.packed, 0);
    const boxCount = Object.keys(S.boxes).filter(k => S.boxes[k].length > 0).length;
    const pct = totalReq > 0 ? Math.round(totalPkd / totalReq * 100) : 0;
    const now = new Date();
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const h = now.getHours(), mi = String(now.getMinutes()).padStart(2, '0'), ampm = h >= 12 ? 'PM' : 'AM', h12 = h % 12 || 12;
    const ts = `${days[now.getDay()]}, ${String(now.getDate()).padStart(2, '0')} ${months[now.getMonth()]} ${now.getFullYear()} — ${String(h12).padStart(2, '0')}:${mi} ${ampm}`;
    
    const w = window.open('', '_blank', 'width=820,height=640');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pending SKUs — ${S.cid}</title><style>
    *{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:24px 28px;color:#1a202c;font-size:13px}
    h1{font-size:17px;font-weight:800;letter-spacing:.5px;margin-bottom:2px}.sub{font-size:12px;color:#718096;margin-bottom:14px}
    .ts{display:inline-block;font-size:11px;color:#2d3748;background:#f7fafc;border:1px solid #cbd5e0;padding:5px 12px;border-radius:6px;margin-bottom:16px;font-weight:600}
    .summary{display:flex;gap:12px;margin-bottom:16px}.sbox{background:#f7fafc;border:1px solid #e2e8f0;padding:10px 18px;border-radius:8px;text-align:center;min-width:80px}
    .sbox .val{font-size:20px;font-weight:800;color:#2d3748}.sbox .lbl{font-size:9px;color:#a0aec0;text-transform:uppercase;margin-top:2px}
    .warn{background:#fff5f5;border-left:4px solid #e53e3e;padding:8px 14px;border-radius:4px;font-size:12px;color:#c53030;margin-bottom:16px;font-weight:600}
    table{width:100%;border-collapse:collapse;font-size:12px}thead tr{background:#2d3748}th{color:#fff;padding:8px 10px;text-align:left;font-size:11px;font-weight:700}
    td{padding:7px 10px;border-bottom:1px solid #e2e8f0}tbody tr:nth-child(even) td{background:#f7fafc}
    .footer{margin-top:22px;font-size:10px;color:#a0aec0;text-align:center;border-top:1px solid #e2e8f0;padding-top:10px}
    @media print{body{padding:12px 14px}button{display:none!important}.footer{position:fixed;bottom:0;left:0;right:0;background:#fff;padding:8px}}
    </style></head><body>
    <h1>🏭 Youthnic Packing Station — Pending Report</h1>
    <div class="sub">Consignment: <strong>${S.cid}</strong></div>
    <div class="ts">🕐 Printed: ${ts}</div>
    <div class="summary">
     <div class="sbox"><div class="val">${totalPkd}/${totalReq}</div><div class="lbl">Packed</div></div>
     <div class="sbox"><div class="val">${pct}%</div><div class="lbl">Complete</div></div>
     <div class="sbox"><div class="val">${boxCount}</div><div class="lbl">Boxes</div></div>
     <div class="sbox"><div class="val" style="color:#c53030">${pending.length}</div><div class="lbl">Pending SKUs</div></div>
    </div>
    <div class="warn">⚠️ ${pending.length} SKU(s) not fully packed — Team Action Required</div>
    <table><thead><tr><th>#</th><th>Barcode</th><th>Name</th><th style="text-align:center">Required</th><th style="text-align:center">Packed</th><th style="text-align:center;color:#fc8181">Remaining</th></tr></thead>
    <tbody>${pending.map((p, i) => `<tr><td>${i+1}</td><td style="font-family:monospace;font-size:11px">${p.marketplaceSku}</td><td>${p.internalSku}</td><td style="text-align:center">${p.required}</td><td style="text-align:center">${p.packed}</td><td style="text-align:center;color:#c53030;font-weight:700">${p.remaining}</td></tr>`).join('')}</tbody></table>
    <div class="footer">Youthnic Consignment Packing Station &nbsp;·&nbsp; ${S.cid} &nbsp;·&nbsp; ${ts}</div>
    <script>window.onload=function(){window.print()}<\/script></body></html>`);
    w.document.close();
  };

  // Filtered & sorted SKUs
  let filtered = [...S.skus];
  if (skuFilter === 'pending') filtered = filtered.filter(s => s.remaining > 0);
  else if (skuFilter === 'done') filtered = filtered.filter(s => s.remaining === 0);
  else if (skuFilter === 'current' && S.box) {
    const bcs = (S.boxes[S.box] || []).map(i => i.marketplaceSku);
    filtered = filtered.filter(s => bcs.includes(s.marketplaceSku));
  }
  filtered.sort((a, b) => { const ad = a.packed >= a.required ? 1 : 0, bd = b.packed >= b.required ? 1 : 0; if (ad !== bd) return ad - bd; return b.remaining - a.remaining; });

  const currentBoxItems = S.boxes[S.box] || [];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-50">
      <style>{`
        @keyframes slideIn { from { transform:translateX(100%); opacity:0; } to { transform:translateX(0); opacity:1; } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.3; } }
        @keyframes popIn { 0% { transform:scale(.98); opacity:.6; } 100% { transform:scale(1); opacity:1; } }
        @keyframes fOk { 0% { box-shadow:0 0 0 0 rgba(45,147,108,.4); } 50% { box-shadow:0 0 0 5px rgba(45,147,108,.08); } 100% { box-shadow:none; } }
        @keyframes fErr { 0% { box-shadow:0 0 0 0 rgba(230,57,70,.4); } 50% { box-shadow:0 0 0 5px rgba(230,57,70,.08); } 100% { box-shadow:none; } }
        .flash-ok { animation:fOk .4s; } .flash-err { animation:fErr .4s; }
        .spin { width:14px; height:14px; border:2px solid #e2e8f0; border-top-color:#2563eb; border-radius:50%; animation:sp .7s linear infinite; display:inline-block; }
        @keyframes sp { to { transform:rotate(360deg); } }
      `}</style>

      {/* Header — matching Consignments theme */}
      <div className="sticky top-0 z-[100] flex items-center justify-between px-4 py-2.5 border-b border-slate-200 shadow-sm bg-white">
        <div className="flex items-center gap-3">
          <button onClick={goBack} className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="w-px h-5 bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <Boxes className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900">Packing Station</h1>
              <small className="text-[9px] uppercase tracking-[1px] text-slate-400">CCTV System v5.0</small>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`px-2.5 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1.5 cursor-pointer ${syncState==='synced'?'bg-emerald-50 text-emerald-700 border border-emerald-200':syncState==='pending'?'bg-amber-50 text-amber-700 border border-amber-200':'bg-red-50 text-red-700 border border-red-200'}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-[pulse_2s_infinite]" />
            <span>{syncState==='synced'?'Synced':syncState==='pending'?'Pending':'Offline'}</span>
          </div>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.8px] border ${recState==='REC'?'bg-red-50 border-red-200 text-red-700':'bg-slate-50 border-slate-200 text-slate-500'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${recState==='REC'?'animate-[pulse_.8s_infinite] bg-red-500':'bg-slate-400'}`} />
            <span>{recState}</span>
          </div>
          {pendingUploads > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-amber-50 border border-amber-200 text-amber-700 animate-[pulse_2s_infinite]" title="Videos queued for upload">
              <span>⬆</span>
              <span>{pendingUploads}</span>
            </div>
          )}
        </div>
      </div>

      {/* Info Bar */}
      <div className="max-w-[1440px] mx-auto mt-2 px-3">
        <div className={`rounded-xl px-4 py-2 flex items-center justify-between flex-wrap gap-2 text-xs bg-white border border-slate-100 shadow-sm ${S.cid?'flex':'hidden'}`}>
          <div className="flex items-center gap-1.5"><span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Consignment</span><span className="text-sm font-bold font-mono text-slate-900">{S.cid || '—'}</span></div>
          <div className="flex items-center gap-1.5"><span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">SKUs</span><span className="text-sm font-bold font-mono text-slate-700">{S.skus.length}</span></div>
          <div className="flex items-center gap-1.5"><span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Required</span><span className="text-sm font-bold font-mono text-slate-700">{S.skus.reduce((s,k)=>s+k.required,0)}</span></div>
          <div className="flex items-center gap-1.5"><span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Packed</span><span className="text-sm font-bold font-mono text-emerald-600">{S.skus.reduce((s,k)=>s+k.packed,0)}</span></div>
          <div className="flex items-center gap-1.5"><span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Box</span><span className="text-sm font-bold font-mono text-red-600">{S.box || '—'}</span></div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="max-w-[1440px] mx-auto px-3 pt-3 grid gap-3 min-h-[calc(100vh-50px)]" style={{ gridTemplateColumns: '280px 1fr 240px' }}>
        {/* Left Column */}
        <div className="flex flex-col gap-3">
          {/* Zone 1 */}
          <div id="z1" className={`rounded-xl p-3 border-2 relative overflow-hidden transition-all ${zone===1?'border-emerald-500 animate-[popIn_.4s]':'border-slate-200 opacity-40 pointer-events-none'} bg-white shadow-sm`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${zone===1?'bg-emerald-500 text-white':'bg-slate-100 text-slate-400'}`}>1</div>
              <div className={`text-xs font-semibold ${zone===1?'text-emerald-600':'text-slate-500'}`}>Scan Consignment ID</div>
            </div>
            <div className="flex flex-col gap-2">
              {consignmentList.length > 0 && (
                <select
                  className="w-full px-2.5 py-1.5 border rounded-lg outline-none transition-all text-[10px] bg-slate-50 border-slate-200 text-slate-700"
                  onChange={e => { if (e.target.value) { inCidRef.current.value = e.target.value; doLoad(); } }}
                  value=""
                >
                  <option value="">Select Consignment...</option>
                  {consignmentList.map(c => (
                    <option key={c.id} value={c.id}>{c.internalShipmentNo || c.id} ({c.totalPackedQty||0}/{c.totalRequiredQty||0})</option>
                  ))}
                </select>
              )}
              <div className="flex gap-2">
                <input ref={inCidRef} placeholder="ID / Shipment No / Internal Ship No..." autoFocus className="flex-1 px-2.5 py-2 border rounded-lg outline-none transition-all text-xs bg-slate-50 border-slate-200 text-slate-900 font-mono focus:ring-2 focus:ring-primary-500" onKeyDown={e => e.key==='Enter'&&doLoad()} />
                <button onClick={doLoad} disabled={loading || uploading} className="relative overflow-hidden px-4 py-2 rounded-lg text-xs font-semibold text-white cursor-pointer transition-all active:scale-[0.96] bg-red-500 hover:bg-red-600">
                  {loading || uploading ? <span className="spin" /> : 'Load'}
                </button>
              </div>
            </div>
          </div>

          {/* Zone 2 */}
          <div id="z2" className={`rounded-xl p-3 border-2 relative overflow-hidden transition-all ${zone===2?'border-emerald-500 animate-[popIn_.4s]':'border-slate-200 opacity-40 pointer-events-none'} bg-white shadow-sm`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${zone===2?'bg-emerald-500 text-white':'bg-slate-100 text-slate-400'}`}>2</div>
              <div className={`text-xs font-semibold ${zone===2?'text-emerald-600':'text-slate-500'}`}>Enter Box Number</div>
            </div>
            <div className="flex gap-2">
              <input ref={inBoxRef} placeholder="Box no..." className="flex-1 px-2.5 py-2 border rounded-lg outline-none transition-all text-xs bg-slate-50 border-slate-200 text-slate-900 font-mono focus:ring-2 focus:ring-primary-500" onKeyDown={e => e.key==='Enter'&&doBox()} />
              <button onClick={doBox} className="relative overflow-hidden px-4 py-2 rounded-lg text-xs font-semibold text-white cursor-pointer transition-all active:scale-[0.96] bg-emerald-500 hover:bg-emerald-600">Set</button>
            </div>
          </div>

          {/* Zone 3 */}
          <div id="z3" className={`rounded-xl p-3 border-2 relative overflow-hidden transition-all ${zone===3?'border-emerald-500 animate-[popIn_.4s]':'border-slate-200 opacity-40 pointer-events-none'} bg-white shadow-sm`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${zone===3?'bg-emerald-500 text-white':'bg-slate-100 text-slate-400'}`}>3</div>
              <div className="flex-1 flex justify-between text-xs font-semibold">
                <span className={zone===3?'text-emerald-600':'text-slate-500'}>Scan SKU Barcode</span>
                <span className="text-slate-500">Box Qty: <strong className="text-xs text-red-500">{currentBoxItems.reduce((s,i)=>s+i.qty,0)}</strong></span>
              </div>
            </div>
            <form onSubmit={e => { e.preventDefault(); doScan(); }}>
              <input ref={inSkuRef} placeholder="SKU barcode..." autoComplete="off" className="w-full px-2.5 py-2 border rounded-lg outline-none transition-all text-xs bg-slate-50 border-slate-200 text-slate-900 font-mono focus:ring-2 focus:ring-primary-500" />
            </form>
            <div className="flex gap-1.5 flex-wrap mt-2.5">
              <button onClick={doSaveBox} disabled={loading} className="px-3 py-1.5 rounded-lg text-[10px] font-semibold text-white cursor-pointer transition-all active:scale-[0.96] bg-emerald-500 hover:bg-emerald-600">💾 Save</button>
              <button onClick={doNewBox} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white cursor-pointer transition-all active:scale-[0.96] bg-violet-600 hover:bg-violet-700 shadow-md shadow-violet-200">📦 NEXT BOX</button>
              <button onClick={doDL} className="px-3 py-1.5 rounded-lg text-[10px] font-semibold border cursor-pointer transition-all active:scale-[0.96] bg-white text-slate-600 border-slate-200 hover:bg-slate-50">⬇ PDF</button>
              <button onClick={doFinish} className="px-3 py-1.5 rounded-lg text-[10px] font-semibold text-white cursor-pointer transition-all active:scale-[0.96] bg-red-500 hover:bg-red-600">✅ Done</button>
            </div>
          </div>

          {/* Camera */}
          <div className="rounded-xl overflow-hidden border bg-white shadow-sm border-slate-200">
            <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between text-xs font-semibold">
              <span>📹 CCTV Feed</span>
              <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${camActive ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-400'}`}>{camActive ? 'LIVE' : 'OFFLINE'}</span>
            </div>
            <div className="relative w-full bg-slate-900" style={{ aspectRatio: '16/9' }}>
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" style={{ display: camActive ? 'block' : 'none' }} />
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ display: camActive ? 'block' : 'none' }} />
              {!camActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <span className="text-3xl">📹</span>
                  <span className="text-xs uppercase tracking-wider text-slate-400">No Camera Signal</span>
                </div>
              )}
            </div>
            <div className="px-3 py-2 flex justify-between items-center border-t border-slate-100 text-center">
              <div><span className="text-[8px] uppercase tracking-wider block text-slate-400">Resolution</span><span className="text-xs font-semibold text-slate-700 font-mono">{camRes}</span></div>
              <div><span className="text-[8px] uppercase tracking-wider block text-slate-400">Duration</span><span className="text-xs font-semibold text-slate-700 font-mono">{recDuration}</span></div>
              <div><span className="text-[8px] uppercase tracking-wider block text-slate-400">Size</span><span className="text-xs font-semibold text-slate-700 font-mono">{recSize}</span></div>
            </div>
            <div className="px-3 py-2">
              <button onClick={startCamera} className={`w-full justify-center px-3 py-2 rounded-lg text-xs font-semibold text-white cursor-pointer transition-all ${camActive ? 'bg-emerald-400' : 'bg-emerald-500 hover:bg-emerald-600'}`}>{camActive ? '✓ Camera Active' : '📷 Start Camera'}</button>
            </div>
          </div>

          {/* Upload Progress */}
          <div className={`px-3 py-2 ${showUpload ? 'block' : 'hidden'}`}>
            <div className="text-[10px] mb-1 text-slate-400">Saving video…</div>
            <div className="h-[3px] rounded-sm overflow-hidden bg-slate-200">
              <div className="h-full rounded-sm transition-[width] duration-300 bg-emerald-500" style={{ width: uploadProgress + '%' }} />
            </div>
          </div>
        </div>

        {/* Center Column */}
        <div className="flex flex-col gap-3">
          {/* SKU Tracking */}
          <div className="flex-1 rounded-xl border overflow-hidden shadow-sm transition-all hover:shadow-md bg-white border-slate-100">
            <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xs font-semibold flex items-center gap-1 text-slate-700">📋 SKU Tracking</h3>
              <div className="flex items-center gap-2">
                <div className="flex gap-1 flex-wrap">
                  {['all','pending','done','current'].map(f => (
                    <button key={f} onClick={() => setSkuFilter(f)} className={`px-2 py-1 rounded-full text-[9px] font-semibold cursor-pointer border transition-all ${skuFilter===f?'bg-emerald-500 text-white border-emerald-500':'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>{f==='current'?'Current Box':f}</button>
                  ))}
                </div>
                <span className="text-[10px] text-slate-400">{filtered.length}/{S.skus.length} items</span>
              </div>
            </div>
            <div className="p-0">
              {!S.skus.length ? (
                <div className="text-center py-6 text-slate-400">
                  <div className="text-[28px] mb-1.5">📦</div>
                  <div className="text-xs font-medium text-slate-500">No consignment loaded</div>
                  <div className="text-[10px] mt-0.5">Scan a consignment ID to begin</div>
                </div>
              ) : (
                <div className="max-h-[calc(100vh-200px)] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#e2e8f0 transparent' }}>
                  <table className="w-full border-separate border-spacing-0 text-[10.5px]">
                    <thead><tr>
                      <th className="px-2 py-[5px] text-left text-[9px] font-semibold uppercase tracking-wider sticky top-0 z-[1] bg-slate-50 text-slate-500 border-b border-slate-100">#</th>
                      <th className="px-2 py-[5px] text-left text-[9px] font-semibold uppercase tracking-wider sticky top-0 z-[1] bg-slate-50 text-slate-500 border-b border-slate-100">Barcode</th>
                      <th className="px-2 py-[5px] text-left text-[9px] font-semibold uppercase tracking-wider sticky top-0 z-[1] bg-slate-50 text-slate-500 border-b border-slate-100">Name</th>
                      <th className="px-2 py-[5px] text-left text-[9px] font-semibold uppercase tracking-wider sticky top-0 z-[1] bg-slate-50 text-slate-500 border-b border-slate-100">Req</th>
                      <th className="px-2 py-[5px] text-left text-[9px] font-semibold uppercase tracking-wider sticky top-0 z-[1] bg-slate-50 text-slate-500 border-b border-slate-100">Pkd</th>
                      <th className="px-2 py-[5px] text-left text-[9px] font-semibold uppercase tracking-wider sticky top-0 z-[1] bg-slate-50 text-slate-500 border-b border-slate-100">Left</th>
                      <th className="px-2 py-[5px] text-left text-[9px] font-semibold uppercase tracking-wider sticky top-0 z-[1] bg-slate-50 text-slate-500 border-b border-slate-100">%</th>
                    </tr></thead>
                    <tbody>
                      {filtered.map((s, i) => {
                        const p = s.required > 0 ? Math.round(s.packed / s.required * 100) : 0;
                        const locked = p >= 100 && s.required > 0;
                        return (
                          <tr key={s.marketplaceSku} className={`hover:bg-emerald-50/50 transition-colors ${locked ? 'opacity-50 bg-emerald-50/30 line-through pointer-events-none' : ''}`}>
                            <td className="px-2 py-1 border-b border-slate-50 font-semibold text-slate-400">{i+1}</td>
                            <td className="px-2 py-1 border-b border-slate-50 font-mono text-[9px] max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap" title={s.marketplaceSku}>{s.marketplaceSku}</td>
                            <td className="px-2 py-1 border-b border-slate-50 text-[10px] max-w-[130px] overflow-hidden text-ellipsis whitespace-nowrap" title={s.internalSku}>{s.internalSku}</td>
                            <td className="px-2 py-1 border-b border-slate-50"><span className="inline-block px-[5px] py-[1px] rounded text-[10px] font-semibold font-mono bg-slate-100 text-slate-500">{s.required}</span></td>
                            <td className="px-2 py-1 border-b border-slate-50"><span className={`inline-block px-[5px] py-[1px] rounded text-[10px] font-semibold font-mono ${p >= 100 ? 'bg-emerald-50 text-emerald-600' : p > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>{s.packed}</span></td>
                            <td className="px-2 py-1 border-b border-slate-50"><span className={`inline-block px-[5px] py-[1px] rounded text-[10px] font-semibold font-mono ${s.remaining === 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{s.remaining}</span></td>
                            <td className="px-2 py-1 border-b border-slate-50 min-w-[70px]">
                              <div className={`text-[9px] font-semibold font-mono ${p >= 100 ? 'text-emerald-600' : p > 50 ? 'text-amber-500' : 'text-red-500'}`}>{p}%</div>
                              <div className="w-full h-1 rounded-sm overflow-hidden bg-slate-100 mt-0.5">
                                <div className="h-full rounded-sm transition-[width] duration-400" style={{ width: Math.min(p, 100) + '%', background: p >= 100 ? '#10b981' : p > 50 ? '#f59e0b' : '#ef4444' }} />
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
          </div>

          {/* Current Box Items */}
          <div className={`flex-1 rounded-xl border overflow-hidden shadow-sm bg-white border-slate-100 ${currentBoxItems.length ? 'block' : 'hidden'}`}>
            <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-red-500">📦 Current Box Items</h3>
              <span className="text-[10px] text-slate-400">{currentBoxItems.length} items</span>
            </div>
            <div className="p-2 space-y-1">
              {currentBoxItems.map(item => (
                <div key={item.marketplaceSku} className="flex items-center justify-between p-1.5 rounded-md bg-slate-50">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-400">{item.marketplaceSku}</span>
                    <span className="text-[10px] font-medium text-slate-700">{item.internalSku}</span>
                    <span className="text-[10px] font-semibold text-red-500">x{item.qty}</span>
                  </div>
                  <button onClick={() => removeItem(item.marketplaceSku)} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="flex-col gap-3 hidden xl:flex">
          {/* Boxes Pivot */}
          <div className={`rounded-xl border overflow-hidden shadow-sm bg-white border-slate-100 ${Object.keys(S.boxes).length ? 'block' : 'hidden'}`}>
            <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-700">📊 Boxes</h3>
              <span className="text-[10px] text-slate-400">{Object.keys(S.boxes).filter(k => S.boxes[k].length).length}</span>
            </div>
            <div className="p-0">
              <table className="w-full border-separate border-spacing-0 text-[10px]">
                <thead><tr>
                  <th className="px-2 py-1 text-left text-[9px] font-semibold uppercase tracking-wider bg-slate-50 text-slate-500 border-b border-slate-100">Box</th>
                  <th className="px-2 py-1 text-left text-[9px] font-semibold uppercase tracking-wider bg-slate-50 text-slate-500 border-b border-slate-100">Items</th>
                  <th className="px-2 py-1 text-left text-[9px] font-semibold uppercase tracking-wider bg-slate-50 text-slate-500 border-b border-slate-100">Qty</th>
                </tr></thead>
                <tbody>
                  {Object.entries(S.boxes).filter(([,items]) => items.length).map(([boxNo, items]) => (
                    <tr key={boxNo} className="border-b border-slate-50">
                      <td className="px-2 py-1 font-semibold text-slate-700">#{boxNo}</td>
                      <td className="px-2 py-1 text-slate-600">{items.length}</td>
                      <td className="px-2 py-1 text-slate-600">{items.reduce((s,i)=>s+i.qty,0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pending Items */}
          {S.skus.filter(s => s.remaining > 0).length > 0 && (
            <div className="rounded-xl border overflow-hidden shadow-sm bg-white border-slate-100">
              <div className="px-3 py-2 border-b border-slate-100">
                <h3 className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Pending Items</h3>
              </div>
              <div className="p-2 space-y-0.5 max-h-[300px] overflow-y-auto">
                {S.skus.filter(s => s.remaining > 0).map(sku => (
                  <div key={sku.marketplaceSku} className="flex justify-between text-[10px]">
                    <span className="text-slate-400 truncate max-w-[120px]">{sku.internalSku}</span>
                    <span className="text-amber-600 font-medium">{sku.remaining} left</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toasts */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Confirm Modal */}
      <Modal show={showMo} title={moConfig.title} onClose={() => setShowMo(false)} actions={moConfig.actions}>{moConfig.body}</Modal>

      {/* Dashboard Modal */}
      <Modal show={showDashboard} title="📊 Productivity" onClose={() => setShowDashboard(false)} actions={<button onClick={() => setShowDashboard(false)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-[11px] font-medium hover:bg-slate-50">Close</button>}>
        {dashData && (
          <div className="grid grid-cols-2 gap-2 my-3">
            <div className="p-2.5 rounded-lg text-center bg-slate-50"><div className="text-xl font-extrabold text-emerald-600">{dashData.boxes_today}</div><div className="text-[9px] uppercase text-slate-400">Boxes Today</div></div>
            <div className="p-2.5 rounded-lg text-center bg-slate-50"><div className="text-xl font-extrabold text-red-500">{dashData.items_today}</div><div className="text-[9px] uppercase text-slate-400">Items Today</div></div>
            <div className="p-2.5 rounded-lg text-center bg-slate-50"><div className="text-xl font-extrabold text-slate-700">{dashData.avg_speed}</div><div className="text-[9px] uppercase text-slate-400">Avg Items/Box</div></div>
            <div className="p-2.5 rounded-lg text-center bg-slate-50"><div className="text-xl font-extrabold text-slate-700">—</div><div className="text-[9px] uppercase text-slate-400">Avg Time/Box</div></div>
          </div>
        )}
      </Modal>

      {/* Resume Modal */}
      <Modal show={showResumeModal} title="♻️ Resume Packing?" onClose={() => setShowResumeModal(false)} actions={<button onClick={() => setShowResumeModal(false)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-[11px] font-medium hover:bg-slate-50">Start Fresh</button>}>
        <div className="text-left text-xs mb-2.5">You have <strong>{resumeList.length}</strong> in-progress consignment{resumeList.length > 1 ? 's' : ''}:</div>
        <div className="max-h-[250px] overflow-y-auto border rounded-lg border-slate-100">
          <table className="w-full text-[10px]">
            <thead><tr className="bg-slate-50"><th className="p-1 text-left text-slate-600">Consignment</th><th className="p-1 text-slate-600">Boxes</th><th className="p-1 text-slate-600">Packed</th><th></th></tr></thead>
            <tbody>
              {resumeList.map(c => {
                const pct = c.total_required > 0 ? Math.round(c.total_packed / c.total_required * 100) : 0;
                return (
                  <tr key={c.consignment_id} className="border-b border-slate-50">
                    <td className="p-1 font-bold text-slate-800">{c.consignment_id}</td>
                    <td className="p-1 text-center text-slate-600">{c.box_count}</td>
                    <td className="p-1 text-center font-semibold" style={{ color: pct >= 100 ? '#10b981' : pct > 50 ? '#f59e0b' : '#ef4444' }}>{c.total_packed}/{c.total_required} ({pct}%)</td>
                    <td className="p-1"><button onClick={() => { setShowResumeModal(false); inCidRef.current.value = c.consignment_id; doLoad(); }} className="px-2 py-0.5 rounded-md text-[9px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600">Load</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* Label Modal */}
      <Modal show={showLabelModal} title="🖨️ Generate Labels / Restore" onClose={() => setShowLabelModal(false)} actions={null}>
        <p className="text-[11px] mb-3 text-slate-600">Upload CSV to generate labels or restore packing session</p>
        <input type="file" accept=".csv" className="w-full p-2 border rounded-lg mb-3 text-xs border-slate-200 bg-slate-50" />
        <button className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-white mb-1.5 bg-emerald-500 hover:bg-emerald-600">Generate Labels from CSV</button>
        <button className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-white mb-3 bg-amber-500 hover:bg-amber-600">♻️ Restore Session from CSV</button>
        <button onClick={() => setShowLabelModal(false)} className="w-full px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 hover:bg-slate-50">Cancel</button>
      </Modal>

      {/* Hidden Print Pending */}
      <button id="print-pending-btn" className="hidden" onClick={printPendingSkus} />

      {/* ── Video Upload Progress Modal ── */}
      {showUploadLog && (
        <div className="fixed inset-0 bg-black/50 z-[10001] flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-[420px] max-w-[95vw] overflow-hidden animate-pop-in">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-sm">Video Upload Progress</h3>
                <p className="text-white/70 text-[11px]">Uploading packing videos to cloud</p>
              </div>
              {uploadLog.every(l => l.status === 'done' || l.status === 'error') && (
                <button onClick={() => setShowUploadLog(false)} className="text-white/70 hover:text-white text-lg leading-none px-2">✕</button>
              )}
            </div>
            <div className="p-4 space-y-3 max-h-[320px] overflow-y-auto">
              {uploadLog.map((item) => (
                <div key={item.id} className="bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {item.status === 'done'     && <span className="text-emerald-500 text-sm">✅</span>}
                      {item.status === 'error'    && <span className="text-red-500 text-sm">❌</span>}
                      {item.status === 'uploading'&& <span className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin inline-block" />}
                      {item.status === 'queued'   && <span className="text-slate-400 text-sm">⏳</span>}
                      <span className="text-[11px] font-medium text-slate-700 truncate">Box #{item.boxNo}</span>
                    </div>
                    <span className={`text-[10px] font-semibold ${item.status === 'done' ? 'text-emerald-600' : item.status === 'error' ? 'text-red-600' : 'text-indigo-600'}`}>
                      {item.status === 'done' ? '100%' : item.status === 'error' ? 'Failed' : item.status === 'queued' ? 'Waiting' : `${item.progress}%`}
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-bar-fill" style={{ width: `${item.progress}%`, background: item.status === 'done' ? '#10b981' : item.status === 'error' ? '#ef4444' : undefined }} />
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1 truncate">{item.name}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 px-4 py-3 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                {uploadLog.filter(l => l.status === 'done').length} / {uploadLog.length} uploaded
              </span>
              {uploadLog.every(l => l.status === 'done' || l.status === 'error') && (
                <button onClick={() => setShowUploadLog(false)} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors">
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

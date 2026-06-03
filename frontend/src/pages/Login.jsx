import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import logo from '../assets/logo.png';

const Login = () => {
  const [email,       setEmail]       = useState('returnorders@vbexports.co.in');
  const [password,    setPassword]    = useState('');
  const [showPwd,     setShowPwd]     = useState(false);
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const { login } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      addToast('Welcome back!', 'success');
      navigate('/');
    } catch (err) {
      const msg = err.response?.data?.error || 'Invalid credentials. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel — brand ── */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-[#0d1117] p-12 relative overflow-hidden">
        {/* Gradient orbs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, #6366f1, transparent 70%)' }} />
          <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full opacity-15"
            style={{ background: 'radial-gradient(circle, #a78bfa, transparent 70%)' }} />
        </div>

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/10">
              <img src={logo} alt="Youthnic" className="w-9 h-9 object-contain" />
            </div>
            <div>
              <p className="text-white font-bold text-xl leading-tight">Youthnic</p>
              <p className="text-white/40 text-xs">Packing Station</p>
            </div>
          </div>
        </div>

        {/* Center text */}
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 bg-white/[0.07] border border-white/10 rounded-full px-4 py-1.5 mb-6">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white/60 text-xs font-medium">System Online</span>
          </div>
          <h2 className="text-4xl font-bold text-white leading-tight mb-4">
            Consignment<br />
            <span style={{ background: 'linear-gradient(135deg,#818cf8,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Packing Manager
            </span>
          </h2>
          <p className="text-white/40 text-sm leading-relaxed max-w-xs">
            Streamline your shipment packing workflow with real-time tracking, barcode scanning, and CCTV integration.
          </p>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mt-10">
            {[
              { label: 'Shipments', value: '10+' },
              { label: 'Boxes/Day',  value: '200+' },
              { label: 'Uptime',     value: '99.9%' },
            ].map(s => (
              <div key={s.label} className="bg-white/[0.04] border border-white/[0.07] rounded-xl p-3">
                <p className="text-xl font-bold text-white">{s.value}</p>
                <p className="text-white/40 text-[11px] mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer links */}
        <div className="relative z-10 flex items-center gap-4">
          <Link to="/terms" className="text-white/30 hover:text-white/60 text-xs transition-colors">Terms</Link>
          <Link to="/privacy" className="text-white/30 hover:text-white/60 text-xs transition-colors">Privacy</Link>
          <Link to="/contact" className="text-white/30 hover:text-white/60 text-xs transition-colors">Contact</Link>
          <span className="text-white/20 text-xs ml-auto">© 2025 Youthnic Exports</span>
        </div>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#f8fafc]">
        {/* Mobile logo */}
        <div className="lg:hidden mb-8 flex items-center gap-3">
          <img src={logo} alt="Youthnic" className="w-10 h-10 object-contain" />
          <div>
            <p className="font-bold text-slate-900 text-lg">Youthnic</p>
            <p className="text-slate-400 text-xs">Packing Station</p>
          </div>
        </div>

        <div className="w-full max-w-[400px] animate-fade-in">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
            <p className="text-slate-500 mt-1 text-sm">Sign in to your account to continue</p>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-3 p-3.5 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
              <span className="text-base mt-0.5">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">Email Address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="inp" placeholder="Enter your email" />
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <input type={showPwd ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)} required
                  className="inp pr-11" placeholder="Enter your password" />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                  {showPwd ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="btn btn-primary w-full justify-center py-3 text-[14px] mt-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? 'Signing in…' : 'Sign In'}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-200">
            <p className="text-[11px] text-slate-400 text-center">
              Protected by JWT Authentication · All sessions expire in 24h
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;

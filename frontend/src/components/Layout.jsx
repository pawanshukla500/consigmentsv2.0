import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Bell, HelpCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const TITLES = {
  '/':              { title: 'Dashboard',        sub: 'Overview of your operations' },
  '/packing':       { title: 'Packing Station',   sub: 'CCTV-enabled scan workflow' },
  '/consignments':  { title: 'Consignments',      sub: 'Manage shipments and SKUs' },
  '/marketplaces':  { title: 'Marketplaces',      sub: 'Portals and warehouse config' },
  '/docket-companies': { title: 'Docket Companies', sub: 'Courier & logistics partners' },
  '/productivity':  { title: 'Productivity',      sub: 'Reports and audit trail' },
  '/users':         { title: 'Users',             sub: 'Team access management' },
  '/audit-logs':    { title: 'Audit Logs',        sub: 'Full system activity log' },
  '/settings':      { title: 'Settings',          sub: 'System configuration' },
};

const Layout = () => {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true');
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    const handler = (e) => setCollapsed(e.detail.collapsed);
    window.addEventListener('sidebarToggle', handler);
    return () => window.removeEventListener('sidebarToggle', handler);
  }, []);

  // Get page title (handle /consignments/:id)
  const key = Object.keys(TITLES).find(k => k !== '/' && location.pathname.startsWith(k)) || '/';
  const page = TITLES[key] || TITLES['/'];
  const isDetail = location.pathname.match(/\/consignments\/.+/);

  return (
    <div className="min-h-screen bg-[#f1f5f9]">
      <Sidebar />

      {/* Sidebar is position:fixed, so the content uses margin-left (not flex-1)
          to avoid overflowing the viewport by the sidebar width. */}
      <div className={`flex flex-col min-h-screen min-w-0 transition-all duration-300 ${collapsed ? 'ml-[68px]' : 'ml-[240px]'}`}>
        {/* ── Top bar ── */}
        <header className="sticky top-0 z-30 glass border-b border-slate-200/60 px-6 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-bold text-slate-900 leading-tight">{isDetail ? 'Consignment Detail' : page.title}</h2>
            <p className="text-[11px] text-slate-400 leading-tight">{isDetail ? 'Full shipment breakdown' : page.sub}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/contact" className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Help & Support">
              <HelpCircle className="w-4.5 h-4.5" />
            </Link>
            <div className="w-px h-5 bg-slate-200" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-xl">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-[9px] font-bold">
                {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
              </div>
              <div className="hidden sm:block">
                <p className="text-[11px] font-semibold text-slate-700 leading-tight">{user?.name?.split(' ')[0] || 'User'}</p>
                <p className="text-[9px] text-slate-400 capitalize leading-tight">{user?.role}</p>
              </div>
            </div>
          </div>
        </header>

        {/* ── Page content ── */}
        <main className="flex-1 p-4 sm:p-6 min-w-0 overflow-x-hidden">
          <div className="max-w-[1400px] mx-auto min-w-0">
            <Outlet />
          </div>
        </main>

        {/* ── Footer ── */}
        <footer className="border-t border-slate-200/60 px-6 py-3 flex items-center justify-between text-[10.5px] text-slate-400">
          <span>© 2025 Youthnic Exports Pvt. Ltd. — Packing Station v2.0</span>
          <div className="flex items-center gap-3">
            <Link to="/terms"   className="hover:text-indigo-600 transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-indigo-600 transition-colors">Privacy</Link>
            <Link to="/contact" className="hover:text-indigo-600 transition-colors">Contact</Link>
            <Link to="/copyright" className="hover:text-indigo-600 transition-colors">Copyright</Link>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Layout;

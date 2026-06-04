import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Package, BarChart3, LogOut, ScanBarcode,
  Store, Users, ClipboardList, Truck, PanelLeftClose, PanelLeftOpen,
  Settings as SettingsIcon, ChevronRight, Shield, Boxes
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.png';

const Sidebar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true');

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebarCollapsed', String(next));
    window.dispatchEvent(new CustomEvent('sidebarToggle', { detail: { collapsed: next } }));
  };

  const hasPerm = (key) => user?.role === 'admin' || user?.permissions?.[key] === true;

  const navGroups = [
    {
      label: 'Operations',
      items: [
        { path: '/',             icon: LayoutDashboard, label: 'Dashboard',       perm: null },
        { path: '/packing',      icon: ScanBarcode,     label: 'Packing Station', perm: 'packing' },
        { path: '/consignments', icon: Package,         label: 'Consignments',    perm: 'consignments' },
        { path: '/sku-catalog',  icon: Boxes,           label: 'SKU Catalog',     perm: 'consignments' },
      ]
    },
    {
      label: 'Management',
      items: [
        { path: '/marketplaces',    icon: Store,          label: 'Marketplaces',    perm: 'marketplaces' },
        { path: '/docket-companies',icon: Truck,          label: 'Docket Companies',perm: null },
        { path: '/productivity',    icon: BarChart3,      label: 'Productivity',    perm: 'productivity' },
      ]
    },
    {
      label: 'Admin',
      adminOnly: true,
      items: [
        { path: '/users',     icon: Users,        label: 'Users',      perm: 'users',     adminOnly: true },
        { path: '/audit-logs',icon: ClipboardList, label: 'Audit Logs', perm: 'auditLogs', adminOnly: false },
        { path: '/settings',  icon: SettingsIcon, label: 'Settings',   perm: null,        adminOnly: true },
      ]
    }
  ];

  const isActive = (path) =>
    path === '/'
      ? location.pathname === '/'
      : location.pathname === path || location.pathname.startsWith(path + '/');

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  return (
    <aside className={`flex flex-col fixed left-0 top-0 z-40 h-screen transition-all duration-300 ease-in-out
      ${collapsed ? 'w-[68px]' : 'w-[240px]'}
      bg-[#0d1117] border-r border-white/[0.05]`}
      style={{ boxShadow: '4px 0 24px rgba(0,0,0,.25)' }}>

      {/* ── Logo ── */}
      <div className={`flex items-center border-b border-white/[0.06] flex-shrink-0
        ${collapsed ? 'justify-center py-4 px-2' : 'px-5 py-4 gap-3'}`}>
        <div className={`flex-shrink-0 rounded-xl overflow-hidden bg-white/10 flex items-center justify-center
          ${collapsed ? 'w-9 h-9' : 'w-10 h-10'}`}>
          {/* brightness(0) invert(1) turns any black logo white on the dark sidebar */}
          <img src={logo} alt="Youthnic" className="w-full h-full object-contain p-1"
            style={{ filter: 'brightness(0) invert(1)' }} />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-[14px] font-bold text-white leading-tight truncate">Youthnic</h1>
            <p className="text-[10px] text-white/40 leading-tight truncate">Packing Station</p>
          </div>
        )}
        {!collapsed && (
          <button onClick={toggle} className="ml-auto p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors">
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Expand toggle when collapsed ── */}
      {collapsed && (
        <button onClick={toggle} className="flex justify-center py-2.5 border-b border-white/[0.06] text-white/30 hover:text-white transition-colors">
          <PanelLeftOpen className="w-4 h-4" />
        </button>
      )}

      {/* ── Nav ── */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
        {navGroups.map(group => {
          const visibleItems = group.items.filter(item => {
            if (item.adminOnly && user?.role !== 'admin') return false;
            return !item.perm || hasPerm(item.perm);
          });
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.label} className="mb-2">
              {!collapsed && (
                <p className="text-[9.5px] font-semibold uppercase tracking-[1.2px] text-white/25 px-3 py-1.5 mb-0.5">
                  {group.label}
                </p>
              )}
              {visibleItems.map(item => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <NavLink key={item.path} to={item.path}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center gap-3 rounded-xl transition-all duration-150 my-0.5
                      ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'}
                      ${active
                        ? 'nav-active text-white'
                        : 'text-white/50 hover:text-white hover:bg-white/[0.06]'
                      }`}>
                    <Icon className={`flex-shrink-0 ${collapsed ? 'w-5 h-5' : 'w-4 h-4'}`} />
                    {!collapsed && (
                      <span className="text-[13px] font-medium truncate">{item.label}</span>
                    )}
                    {!collapsed && active && (
                      <ChevronRight className="w-3 h-3 ml-auto opacity-60" />
                    )}
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* ── User footer ── */}
      <div className={`border-t border-white/[0.06] flex-shrink-0 ${collapsed ? 'p-2' : 'p-3'}`}>
        {!collapsed && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 mb-1 rounded-xl bg-white/[0.04]">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-white truncate">{user?.name || user?.email}</p>
              <div className="flex items-center gap-1">
                {user?.role === 'admin' && <Shield className="w-2.5 h-2.5 text-indigo-400" />}
                <p className="text-[10px] text-white/40 capitalize">{user?.role || 'User'}</p>
              </div>
            </div>
          </div>
        )}
        <button onClick={logout} title={collapsed ? 'Logout' : undefined}
          className={`flex items-center gap-3 w-full text-white/40 hover:text-red-400 hover:bg-red-500/[0.08]
            rounded-xl transition-colors ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2'}`}>
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span className="text-[13px] font-medium">Logout</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;

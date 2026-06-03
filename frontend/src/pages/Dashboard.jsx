import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Package, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  TrendingUp,
  Boxes,
  ArrowRight
} from 'lucide-react';
import { consignmentsAPI, productivityAPI } from '../services/api';
import { useToast } from '../context/ToastContext';

const StatCard = ({ title, value, icon: Icon, color, subtitle, link }) => (
  <Link to={link || '#'} className="block">
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">{value}</p>
          {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  </Link>
);

const Dashboard = () => {
  const { addToast } = useToast();
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    inProgress: 0,
    completed: 0
  });
  const [productivity, setProductivity] = useState(null);
  const [recentConsignments, setRecentConsignments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [consRes, prodRes] = await Promise.all([
        consignmentsAPI.getAll(),
        productivityAPI.getStats()
      ]);

      const consignments = consRes.data.consignments || [];
      setRecentConsignments(consignments.slice(0, 5));
      
      setStats({
        total: consignments.length,
        pending: consignments.filter(c => c.status === 'pending').length,
        inProgress: consignments.filter(c => c.status === 'in_progress').length,
        completed: consignments.filter(c => c.status === 'completed').length
      });

      setProductivity(prodRes.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      addToast('Failed to load dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">Overview of your consignment packing operations</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Consignments"
          value={stats.total}
          icon={Package}
          color="bg-blue-500"
          subtitle="All time"
          link="/consignments"
        />
        <StatCard
          title="Pending"
          value={stats.pending}
          icon={Clock}
          color="bg-amber-500"
          subtitle="Awaiting packing"
          link="/consignments?status=pending"
        />
        <StatCard
          title="In Progress"
          value={stats.inProgress}
          icon={Boxes}
          color="bg-primary-500"
          subtitle="Currently packing"
          link="/consignments?status=in_progress"
        />
        <StatCard
          title="Completed"
          value={stats.completed}
          icon={CheckCircle2}
          color="bg-emerald-500"
          subtitle="Finished"
          link="/consignments?status=completed"
        />
      </div>

      {/* Productivity & Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Productivity */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-slate-900">Today's Productivity</h2>
          </div>
          
          {productivity ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <span className="text-sm text-slate-600">Boxes Packed</span>
                <span className="text-2xl font-bold text-slate-900">{productivity.today?.boxes || 0}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <span className="text-sm text-slate-600">Items Packed</span>
                <span className="text-2xl font-bold text-slate-900">{productivity.today?.items || 0}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <span className="text-sm text-slate-600">Avg Items/Box</span>
                <span className="text-2xl font-bold text-slate-900">
                  {productivity.today?.avgItemsPerBox || 0}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-slate-400 text-center py-8">No data available</p>
          )}
          
          <Link 
            to="/productivity" 
            className="flex items-center justify-center gap-2 mt-6 text-primary-600 hover:text-primary-700 font-medium text-sm"
          >
            View Details <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Recent Consignments */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-slate-900">Recent Consignments</h2>
            </div>
            <Link 
              to="/consignments" 
              className="text-primary-600 hover:text-primary-700 font-medium text-sm flex items-center gap-1"
            >
              View All <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3">ID</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3">Name</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3">Progress</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentConsignments.length > 0 ? (
                  recentConsignments.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-4 text-sm font-mono text-slate-600">{c.id}</td>
                      <td className="py-4 text-sm font-medium text-slate-900">{c.name}</td>
                      <td className="py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          c.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                          c.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {c.status?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-4">
                        <div className="w-24 bg-slate-200 rounded-full h-2">
                          <div 
                            className="bg-primary-500 h-2 rounded-full transition-all"
                            style={{ width: `${c.totalRequiredQty > 0 ? (c.totalPackedQty / c.totalRequiredQty) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 mt-1">
                          {c.totalPackedQty || 0}/{c.totalRequiredQty || 0}
                        </span>
                      </td>
                      <td className="py-4 text-right">
                        <Link 
                          to={`/consignments/${c.id}`}
                          className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-slate-400">
                      No consignments found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { 
  Shield, 
  Users, 
  UserCheck, 
  UserX, 
  Search, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Layers, 
  Tag, 
  RefreshCw, 
  ArrowRight,
  Filter,
  History,
  Lock,
  Archive,
  FileText,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { fetchAdminUsers, updateAdminUserRole, fetchAdminUserAuditLogs } from '../../services/adminApi';

const ROLE_BADGES = {
  SUPER_ADMIN: {
    label: 'Owner / Super Admin',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-300 font-bold',
    icon: Shield
  },
  ADMIN: {
    label: 'Administrator',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200 font-semibold',
    icon: UserCheck
  },
  CUSTOMER: {
    label: 'Customer',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: Users
  }
};

const AdminUsersPage = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: 20 });
  const [counts, setCounts] = useState({ active: 0, archived: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState('ACTIVE'); // 'ACTIVE' or 'ARCHIVED'

  // Confirmation modal state
  const [pendingAction, setPendingAction] = useState(null); // { user, targetRole }
  const [actionLoading, setActionLoading] = useState(false);

  // Audit history modal state
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const loadUsers = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminUsers({
        page,
        limit: 20,
        search: searchQuery,
        role: roleFilter,
        archived: activeTab === 'ARCHIVED',
        status: activeTab === 'ARCHIVED' ? 'archived' : 'active'
      });
      setUsers(data.users || []);
      setPagination({
        page: data.page || 1,
        totalPages: data.totalPages || 1,
        total: data.total || 0,
        limit: data.limit || 20
      });
      if (data.activeCount !== undefined && data.archivedCount !== undefined) {
        setCounts({
          active: data.activeCount,
          archived: data.archivedCount
        });
      }
    } catch (err) {
      setError(err.message || 'Failed to load user accounts.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, roleFilter, activeTab]);

  useEffect(() => {
    loadUsers(1);
  }, [loadUsers]);

  const handleTabChange = (tab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setRoleFilter('ALL');
    setSearchQuery('');
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadUsers(1);
  };

  const handleOpenConfirm = (targetUser, targetRole) => {
    if (targetUser.isArchived) {
      setError('Archived accounts cannot be modified or granted administrative roles.');
      return;
    }
    setError(null);
    setSuccessMessage(null);
    setPendingAction({
      user: targetUser,
      targetRole
    });
  };

  const handleConfirmRoleChange = async () => {
    if (!pendingAction) return;

    setActionLoading(true);
    setError(null);
    try {
      const updated = await updateAdminUserRole(pendingAction.user.id, pendingAction.targetRole);
      setSuccessMessage(
        `Successfully updated role for ${updated.fullName} (${updated.email}) to ${updated.role}.`
      );
      setPendingAction(null);
      // Refresh user list
      await loadUsers(pagination.page);
    } catch (err) {
      setError(err.message || 'Failed to update user role.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenAuditModal = async () => {
    setShowAuditModal(true);
    setAuditLoading(true);
    try {
      const logs = await fetchAdminUserAuditLogs();
      setAuditLogs(logs || []);
    } catch (err) {
      setError('Failed to load audit history: ' + err.message);
    } finally {
      setAuditLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        
        {/* Navigation / Header */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-purple-700 mb-1">
                <Shield className="w-4 h-4 text-purple-600" />
                <span>Super Administrator Portal</span>
                <span>•</span>
                <span>Owner Controls</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                User & Administrator Management
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Appoint and revoke administrator privileges. Only the system owner (<span className="font-semibold text-slate-700">{currentUser?.email}</span>) can access this page.
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <Link
                to="/admin/events"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded text-xs font-semibold text-slate-600 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <Layers className="w-4 h-4" />
                <span>Events</span>
              </Link>
              <Link
                to="/admin/promocodes"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded text-xs font-semibold text-slate-600 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <Tag className="w-4 h-4" />
                <span>Promo Codes</span>
              </Link>
              <button
                type="button"
                onClick={handleOpenAuditModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-colors shadow-sm"
              >
                <History className="w-4 h-4" />
                <span>Role Audit Log</span>
              </button>
            </div>
          </div>
        </div>

        {/* Metric / Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center flex-shrink-0">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">1</div>
              <div className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Owner / Super Admin</div>
              <div className="text-[11px] text-slate-400 truncate max-w-[180px]">{currentUser?.email}</div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center flex-shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{counts.active}</div>
              <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Active Accounts</div>
              <div className="text-[11px] text-slate-400">Can authenticate & access system</div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center flex-shrink-0">
              <Archive className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{counts.archived}</div>
              <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Archived Customers</div>
              <div className="text-[11px] text-slate-400">Historical orders & tickets frozen</div>
            </div>
          </div>
        </div>

        {/* Primary View Switcher: Active Accounts vs Archived Customers */}
        <div className="flex items-center gap-3 border-b border-gray-200 pb-2">
          <button
            type="button"
            onClick={() => handleTabChange('ACTIVE')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-bold border-b-2 transition-all ${
              activeTab === 'ACTIVE'
                ? 'border-purple-600 text-purple-700 bg-purple-50/50 rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50 rounded-t-lg'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Active Accounts</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
              activeTab === 'ACTIVE'
                ? 'bg-purple-200 text-purple-900'
                : 'bg-gray-100 text-slate-600'
            }`}>
              {counts.active}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('ARCHIVED')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-bold border-b-2 transition-all ${
              activeTab === 'ARCHIVED'
                ? 'border-amber-600 text-amber-700 bg-amber-50/50 rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50 rounded-t-lg'
            }`}
          >
            <Archive className="w-4 h-4 text-amber-600" />
            <span>Archived Customers</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
              activeTab === 'ARCHIVED'
                ? 'bg-amber-200 text-amber-900'
                : 'bg-gray-100 text-slate-600'
            }`}>
              {counts.archived}
            </span>
          </button>
        </div>

        {/* Success Alert */}
        {successMessage && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2 text-emerald-800 text-sm font-medium">
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-600 hover:text-emerald-800 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2 text-red-800 text-sm font-medium">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-800 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Archived Information Notice Banner */}
        {activeTab === 'ARCHIVED' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3 text-xs text-amber-900">
            <Archive className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold">Archived Historical Customer Accounts ({counts.archived} accounts)</div>
              <p className="text-amber-800 leading-relaxed">
                These customer accounts are preserved to maintain foreign-key referential integrity for historical orders, issued tickets, reservations, and payment receipts. All authentication credentials, password hashes, and active sessions have been permanently disabled. These accounts cannot authenticate, log in, or be appointed as administrators.
              </p>
            </div>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Role Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            {activeTab === 'ACTIVE' ? (
              ['ALL', 'CUSTOMER', 'ADMIN', 'SUPER_ADMIN'].map((roleKey) => (
                <button
                  key={roleKey}
                  onClick={() => setRoleFilter(roleKey)}
                  className={`px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-colors ${
                    roleFilter === roleKey
                      ? 'bg-slate-900 text-white'
                      : 'bg-gray-100 text-slate-600 hover:bg-gray-200'
                  }`}
                >
                  {roleKey === 'ALL' ? 'All Roles' : roleKey === 'SUPER_ADMIN' ? 'Super Admins' : roleKey.toLowerCase() + 's'}
                </button>
              ))
            ) : (
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-2">
                All Archived Users ({counts.archived})
              </span>
            )}
          </div>

          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80 flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="search"
                placeholder={activeTab === 'ACTIVE' ? 'Search active accounts...' : 'Search archived customers...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 text-xs text-slate-800 bg-gray-50 border border-gray-300 rounded focus:bg-white focus:outline-none focus:border-purple-600 transition-colors"
              />
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2" />
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded transition-colors"
            >
              Search
            </button>
          </form>
        </div>

        {/* Users Table */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="w-8 h-8 text-purple-600 animate-spin" />
              <p className="text-sm font-medium text-slate-500">
                {activeTab === 'ACTIVE' ? 'Loading active user accounts...' : 'Loading archived customers...'}
              </p>
            </div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              {activeTab === 'ACTIVE' ? (
                <Users className="w-12 h-12 text-slate-300 mx-auto" />
              ) : (
                <Archive className="w-12 h-12 text-amber-300 mx-auto" />
              )}
              <h3 className="text-base font-semibold text-slate-800">
                {activeTab === 'ACTIVE' ? 'No active users found' : 'No archived customers found'}
              </h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                {searchQuery
                  ? `No accounts match "${searchQuery}".`
                  : activeTab === 'ACTIVE'
                  ? 'No active accounts match the selected role filter.'
                  : 'No archived customers recorded in the database.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200 text-slate-600 font-bold uppercase tracking-wider">
                    <th className="py-3.5 px-4">{activeTab === 'ACTIVE' ? 'User Account' : 'Customer Account'}</th>
                    <th className="py-3.5 px-4">Role</th>
                    <th className="py-3.5 px-4">{activeTab === 'ACTIVE' ? 'Status' : 'Archival Status'}</th>
                    <th className="py-3.5 px-4">Created Date</th>
                    <th className="py-3.5 px-4">{activeTab === 'ACTIVE' ? 'Last Login' : 'Archived Date'}</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((u) => {
                    const badge = ROLE_BADGES[u.role] || ROLE_BADGES.CUSTOMER;
                    const BadgeIcon = badge.icon;
                    const isSuperAdmin = u.role === 'SUPER_ADMIN';
                    const isSelf = u.id === currentUser?.id;
                    const isArchived = Boolean(u.isArchived);

                    return (
                      <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* User Identity */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-900 text-sm">{u.fullName}</span>
                            <span className="text-slate-500 font-mono text-[11px]">{u.email}</span>
                          </div>
                        </td>

                        {/* Role Badge */}
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border ${badge.badgeClass}`}>
                            <BadgeIcon className="w-3.5 h-3.5" />
                            <span>{badge.label}</span>
                          </span>
                        </td>

                        {/* Status / Archival Column */}
                        <td className="py-3.5 px-4">
                          {isArchived ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              <Archive className="w-3.5 h-3.5 text-amber-700" />
                              <span>ARCHIVED</span>
                            </span>
                          ) : u.emailVerified ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Active / Verified</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-slate-600 font-medium">
                              <CheckCircle className="w-3.5 h-3.5 text-blue-500" />
                              <span>Active</span>
                            </span>
                          )}
                        </td>

                        {/* Created At */}
                        <td className="py-3.5 px-4 text-slate-600">
                          {new Date(u.createdAt).toLocaleDateString('en-ZA', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </td>

                        {/* Last Login / Archived Date */}
                        <td className="py-3.5 px-4 text-slate-600">
                          {isArchived ? (
                            u.archivedAt ? (
                              new Date(u.archivedAt).toLocaleDateString('en-ZA', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                              })
                            ) : (
                              <span className="text-slate-400">Yes</span>
                            )
                          ) : u.lastLoginAt ? (
                            new Date(u.lastLoginAt).toLocaleDateString('en-ZA', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })
                          ) : (
                            <span className="text-slate-400 italic">Never</span>
                          )}
                        </td>

                        {/* Action Buttons */}
                        <td className="py-3.5 px-4 text-right">
                          {isArchived ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded border border-slate-200" title="Archived accounts cannot be modified">
                              <Lock className="w-3 h-3 text-slate-400" />
                              <span>Archived (Protected)</span>
                            </span>
                          ) : isSuperAdmin ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 bg-purple-50 px-2 py-1 rounded border border-purple-200">
                              <Lock className="w-3 h-3 text-purple-600" />
                              <span>Owner (Protected)</span>
                            </span>
                          ) : isSelf ? (
                            <span className="text-slate-400 text-[11px] italic">Self</span>
                          ) : u.role === 'CUSTOMER' ? (
                            <button
                              type="button"
                              onClick={() => handleOpenConfirm(u, 'ADMIN')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors shadow-xs"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Appoint Admin</span>
                            </button>
                          ) : u.role === 'ADMIN' ? (
                            <button
                              type="button"
                              onClick={() => handleOpenConfirm(u, 'CUSTOMER')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors shadow-xs"
                            >
                              <UserX className="w-3.5 h-3.5" />
                              <span>Revoke Admin</span>
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="bg-slate-50 border-t border-gray-200 px-4 py-3 flex items-center justify-between text-xs text-slate-600">
              <div>
                Showing page <span className="font-semibold text-slate-900">{pagination.page}</span> of{' '}
                <span className="font-semibold text-slate-900">{pagination.totalPages}</span> ({pagination.total} total accounts)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadUsers(pagination.page - 1)}
                  disabled={pagination.page <= 1 || loading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-white border border-gray-300 text-slate-700 font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous</span>
                </button>
                <button
                  type="button"
                  onClick={() => loadUsers(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages || loading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-white border border-gray-300 text-slate-700 font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Confirmation Modal */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 border border-gray-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                pendingAction.targetRole === 'ADMIN' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`}>
                {pendingAction.targetRole === 'ADMIN' ? <UserCheck className="w-5 h-5" /> : <UserX className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {pendingAction.targetRole === 'ADMIN' ? 'Appoint Administrator' : 'Revoke Administrator Privileges'}
                </h3>
                <p className="text-xs text-slate-500">Confirm role modification</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3.5 border border-gray-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">User:</span>
                <span className="font-semibold text-slate-900">{pendingAction.user.fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Email:</span>
                <span className="font-mono text-slate-700">{pendingAction.user.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Current Role:</span>
                <span className="font-semibold text-slate-700">{pendingAction.user.role}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Target Role:</span>
                <span className={`font-bold ${pendingAction.targetRole === 'ADMIN' ? 'text-emerald-700' : 'text-slate-700'}`}>
                  {pendingAction.targetRole}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {pendingAction.targetRole === 'ADMIN' ? (
                <>
                  This user will be granted permission to create, edit, publish, and manage all events and promotional codes on EventPass. They will <strong>NOT</strong> have permission to appoint or revoke administrators.
                </>
              ) : (
                <>
                  This user will lose all administrative capabilities and be returned to a standard <strong>CUSTOMER</strong> account.
                </>
              )}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-gray-100 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRoleChange}
                disabled={actionLoading}
                className={`px-4 py-2 text-xs font-bold text-white rounded transition-colors shadow-sm inline-flex items-center gap-1.5 ${
                  pendingAction.targetRole === 'ADMIN'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {actionLoading
                    ? 'Processing...'
                    : pendingAction.targetRole === 'ADMIN'
                    ? 'Confirm Appointment'
                    : 'Confirm Revocation'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Logs Modal */}
      {showAuditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col border border-gray-200">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-purple-600" />
                <h3 className="text-base font-bold text-slate-900">Administrator Role Audit Log</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAuditModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              {auditLoading ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-600" />
                  Loading audit logs...
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No role modification events recorded yet.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="bg-slate-50 border border-gray-200 rounded-lg p-3 text-xs flex flex-col space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                          log.action === 'admin.appointed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {log.action === 'admin.appointed' ? 'ADMIN APPOINTED' : 'ADMIN REVOKED'}
                        </span>
                        <span className="text-slate-400 font-mono text-[11px]">
                          {new Date(log.createdAt).toLocaleString('en-ZA')}
                        </span>
                      </div>
                      <div className="text-slate-700">
                        Target Account: <span className="font-semibold text-slate-900">{log.payload?.details?.targetEmail || log.payload?.targetEmail}</span>
                      </div>
                      <div className="text-slate-500 text-[11px]">
                        Role Change: {log.payload?.details?.previousRole || log.payload?.previousRole} → <span className="font-semibold">{log.payload?.details?.newRole || log.payload?.newRole}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAuditModal(false)}
                className="px-4 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminUsersPage;

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { 
  Tag, 
  Plus, 
  Search, 
  CheckCircle, 
  Clock, 
  XCircle, 
  AlertCircle, 
  Trash2, 
  Power, 
  RefreshCw,
  X,
  Calendar,
  Layers,
  Shield
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { 
  fetchAdminPromoCodes, 
  createAdminPromoCode, 
  toggleAdminPromoCodeStatus, 
  deleteAdminPromoCode 
} from '../../services/promoCodeApi';

const AdminPromoCodesPage = () => {
  const { user } = useAuth();
  const [promoCodes, setPromoCodes] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [newPromo, setNewPromo] = useState({
    code: '',
    description: '',
    discountType: 'PERCENTAGE',
    discountValue: '',
    maxDiscountZar: '',
    minSubtotalZar: '0',
    maxTotalRedemptions: '',
    maxPerCustomer: '1',
    startsAt: '',
    expiresAt: ''
  });

  const loadPromoCodes = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminPromoCodes({
        page,
        limit: 15,
        search: searchQuery,
        status: statusFilter
      });
      setPromoCodes(data.items || []);
      setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      setError(err.message || 'Failed to load promotional codes.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    loadPromoCodes(1);
  }, [loadPromoCodes]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadPromoCodes(1);
  };

  const handleToggleStatus = async (promo) => {
    setActionLoadingId(promo.id);
    try {
      await toggleAdminPromoCodeStatus(promo.id, !promo.isActive);
      await loadPromoCodes(pagination.page);
    } catch (err) {
      alert(`Failed to update status: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (promo) => {
    if (!window.confirm(`Are you sure you want to delete or deactivate promotional code "${promo.code}"?`)) {
      return;
    }
    setActionLoadingId(promo.id);
    try {
      await deleteAdminPromoCode(promo.id);
      await loadPromoCodes(pagination.page);
    } catch (err) {
      alert(`Failed to delete code: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setModalError(null);
    setIsSubmitting(true);

    try {
      const discountValNumber = Number(newPromo.discountValue);
      if (!discountValNumber || discountValNumber <= 0) {
        throw new Error('Please enter a valid positive discount value.');
      }

      // If FIXED discount, convert Rands to ZAR cents minor units
      const discountValueMinor = newPromo.discountType === 'FIXED'
        ? Math.round(discountValNumber * 100)
        : discountValNumber;

      const payload = {
        code: newPromo.code.trim().toUpperCase(),
        description: newPromo.description.trim() || undefined,
        discountType: newPromo.discountType,
        discountValue: discountValueMinor,
        maxDiscountMinor: newPromo.maxDiscountZar ? Math.round(Number(newPromo.maxDiscountZar) * 100) : undefined,
        minSubtotalMinor: newPromo.minSubtotalZar ? Math.round(Number(newPromo.minSubtotalZar) * 100) : 0,
        maxTotalRedemptions: newPromo.maxTotalRedemptions ? Number(newPromo.maxTotalRedemptions) : undefined,
        maxPerCustomer: newPromo.maxPerCustomer ? Number(newPromo.maxPerCustomer) : undefined,
        startsAt: newPromo.startsAt ? new Date(newPromo.startsAt).toISOString() : undefined,
        expiresAt: newPromo.expiresAt ? new Date(newPromo.expiresAt).toISOString() : undefined
      };

      await createAdminPromoCode(payload);
      setIsCreateOpen(false);
      setNewPromo({
        code: '',
        description: '',
        discountType: 'PERCENTAGE',
        discountValue: '',
        maxDiscountZar: '',
        minSubtotalZar: '0',
        maxTotalRedemptions: '',
        maxPerCustomer: '1',
        startsAt: '',
        expiresAt: ''
      });
      await loadPromoCodes(1);
    } catch (err) {
      setModalError(err.message || 'Failed to create promo code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Admin Navigation Header */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#598c34] mb-1">
                <span>EventPass Administration</span>
                <span>•</span>
                <span>Discounts & Pricing</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Promotional Code Management
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Configure percentage and fixed ZAR vouchers, redemption quotas, and validity restrictions.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {user?.role === 'SUPER_ADMIN' && (
                <Link
                  to="/admin/users"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-colors shadow-sm"
                >
                  <Shield className="w-4 h-4 text-purple-600" />
                  <span>Manage Admins</span>
                </Link>
              )}
              <Link
                to="/admin/events"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded text-xs font-semibold text-slate-600 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <Layers className="w-4 h-4" />
                <span>Events Manager</span>
              </Link>
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="inline-flex items-center gap-2 bg-[#7fbd52] hover:bg-[#598c34] text-white px-4 py-2.5 rounded text-sm font-semibold transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Create Promo Code</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            {['ALL', 'ACTIVE', 'INACTIVE', 'EXPIRED'].map((statusKey) => (
              <button
                key={statusKey}
                onClick={() => setStatusFilter(statusKey)}
                className={`px-3 py-1.5 rounded text-xs font-semibold capitalize whitespace-nowrap transition-colors ${
                  statusFilter === statusKey
                    ? 'bg-slate-900 text-white'
                    : 'bg-gray-100 text-slate-600 hover:bg-gray-200'
                }`}
              >
                {statusKey === 'ALL' ? 'All Codes' : statusKey.toLowerCase()}
              </button>
            ))}
          </div>

          <form onSubmit={handleSearchSubmit} className="relative w-full md:w-72">
            <input
              type="search"
              placeholder="Search code or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded bg-gray-50 border border-gray-200 text-xs focus:outline-none focus:border-[#7fbd52] focus:bg-white"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </form>
        </div>

        {/* Promo Codes Table */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <RefreshCw className="w-6 h-6 animate-spin text-[#7fbd52] mx-auto" />
              <p className="text-xs text-slate-500">Loading promotional codes...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-600 space-y-2">
              <AlertCircle className="w-6 h-6 mx-auto text-red-500" />
              <p className="text-xs font-medium">{error}</p>
            </div>
          ) : promoCodes.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <Tag className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-700">No Promotional Codes Found</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No promo codes match your current filter. Click "Create Promo Code" to add a new discount.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-gray-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3.5 px-4">Code</th>
                    <th className="py-3.5 px-4">Discount</th>
                    <th className="py-3.5 px-4">Min. Subtotal</th>
                    <th className="py-3.5 px-4">Redemptions</th>
                    <th className="py-3.5 px-4">Per Customer</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-slate-700">
                  {promoCodes.map((promo) => {
                    const isExpired = promo.expiresAt && new Date(promo.expiresAt) <= new Date();
                    return (
                      <tr key={promo.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-mono font-bold text-slate-900 text-sm">
                            {promo.code}
                          </div>
                          {promo.description && (
                            <p className="text-[11px] text-slate-400 truncate max-w-xs">{promo.description}</p>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded font-bold text-xs bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {promo.discountFormatted}
                          </span>
                          {promo.maxDiscountFormatted && (
                            <span className="block text-[10px] text-slate-400 mt-0.5">
                              Cap: {promo.maxDiscountFormatted}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono">
                          {promo.minSubtotalFormatted || 'R0.00'}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-slate-900">{promo.currentRedemptions}</span>
                          <span className="text-slate-400"> / {promo.maxTotalRedemptions ?? '∞'}</span>
                        </td>
                        <td className="py-3.5 px-4">
                          {promo.maxPerCustomer ? `${promo.maxPerCustomer} per user` : 'Unlimited'}
                        </td>
                        <td className="py-3.5 px-4">
                          {isExpired ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                              <XCircle className="w-3 h-3" />
                              <span>Expired</span>
                            </span>
                          ) : promo.isActive ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle className="w-3 h-3" />
                              <span>Active</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock className="w-3 h-3" />
                              <span>Inactive</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-1">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(promo)}
                            disabled={actionLoadingId === promo.id}
                            className={`p-1.5 rounded transition-colors ${
                              promo.isActive
                                ? 'text-amber-600 hover:bg-amber-50'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={promo.isActive ? 'Deactivate code' : 'Activate code'}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(promo)}
                            disabled={actionLoadingId === promo.id}
                            className="p-1.5 rounded text-red-500 hover:bg-red-50 transition-colors"
                            title="Delete or deactivate code"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

      {/* Create Promo Code Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h2 className="text-base font-bold text-slate-900">Create New Promotional Code</h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Promo Code String *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SUMMER25"
                  value={newPromo.code}
                  onChange={(e) => setNewPromo({ ...newPromo, code: e.target.value.toUpperCase() })}
                  className="w-full h-9 px-3 rounded-lg border border-gray-200 font-mono font-bold uppercase focus:outline-none focus:border-[#7fbd52]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 25% off summer festival tickets"
                  value={newPromo.description}
                  onChange={(e) => setNewPromo({ ...newPromo, description: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg border border-gray-200 focus:outline-none focus:border-[#7fbd52]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Discount Type *</label>
                  <select
                    value={newPromo.discountType}
                    onChange={(e) => setNewPromo({ ...newPromo, discountType: e.target.value })}
                    className="w-full h-9 px-2 rounded-lg border border-gray-200 bg-white font-medium focus:outline-none focus:border-[#7fbd52]"
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED">Fixed Amount (ZAR)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {newPromo.discountType === 'PERCENTAGE' ? 'Discount Percentage (%) *' : 'Discount Amount (R) *'}
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    max={newPromo.discountType === 'PERCENTAGE' ? '100' : undefined}
                    placeholder={newPromo.discountType === 'PERCENTAGE' ? 'e.g. 20' : 'e.g. 150'}
                    value={newPromo.discountValue}
                    onChange={(e) => setNewPromo({ ...newPromo, discountValue: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-gray-200 font-mono font-bold focus:outline-none focus:border-[#7fbd52]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Min. Subtotal (R)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={newPromo.minSubtotalZar}
                    onChange={(e) => setNewPromo({ ...newPromo, minSubtotalZar: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-gray-200 font-mono focus:outline-none focus:border-[#7fbd52]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Max Discount Cap (R)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Unlimited"
                    value={newPromo.maxDiscountZar}
                    onChange={(e) => setNewPromo({ ...newPromo, maxDiscountZar: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-gray-200 font-mono focus:outline-none focus:border-[#7fbd52]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Total Redemption Cap</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Unlimited"
                    value={newPromo.maxTotalRedemptions}
                    onChange={(e) => setNewPromo({ ...newPromo, maxTotalRedemptions: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-gray-200 font-mono focus:outline-none focus:border-[#7fbd52]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Per-Customer Limit</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="1"
                    value={newPromo.maxPerCustomer}
                    onChange={(e) => setNewPromo({ ...newPromo, maxPerCustomer: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-gray-200 font-mono focus:outline-none focus:border-[#7fbd52]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Starts At</label>
                  <input
                    type="datetime-local"
                    value={newPromo.startsAt}
                    onChange={(e) => setNewPromo({ ...newPromo, startsAt: e.target.value })}
                    className="w-full h-9 px-2 rounded-lg border border-gray-200 focus:outline-none focus:border-[#7fbd52]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Expires At</label>
                  <input
                    type="datetime-local"
                    value={newPromo.expiresAt}
                    onChange={(e) => setNewPromo({ ...newPromo, expiresAt: e.target.value })}
                    className="w-full h-9 px-2 rounded-lg border border-gray-200 focus:outline-none focus:border-[#7fbd52]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-gray-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-[#7fbd52] hover:bg-[#598c34] text-white font-bold disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Create Code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminPromoCodesPage;

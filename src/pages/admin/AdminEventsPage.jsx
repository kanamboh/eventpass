import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Calendar, 
  MapPin, 
  Plus, 
  Search, 
  Edit3, 
  Eye, 
  AlertCircle, 
  AlertTriangle,
  CheckCircle, 
  Clock, 
  XCircle, 
  Layers,
  ArrowRight,
  Filter,
  Tag,
  Shield,
  Trash2,
  X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { fetchAdminEvents, updateAdminEventStatus, deleteAdminEvent } from '../../services/adminApi';
import { FALLBACK_EVENT_IMAGE, handleImageError, isEventImageValid } from '../../utils/imageFallback';


const STATUS_CONFIG = {
  PUBLISHED: {
    label: 'Published',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle
  },
  DRAFT: {
    label: 'Draft',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: Clock
  },
  CANCELLED: {
    label: 'Cancelled',
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
    icon: XCircle
  },
  COMPLETED: {
    label: 'Completed',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: CheckCircle
  }
};

const AdminEventsPage = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const navigate = useNavigate();

  const loadEvents = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminEvents({
        page,
        limit: 15,
        search: searchQuery,
        status: statusFilter
      });
      setEvents(data.items || data.events || []);
      setPagination({
        page: data.page || 1,
        totalPages: data.totalPages || 1,
        total: data.total || 0
      });
    } catch (err) {
      setError(err.message || 'Failed to load events.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    loadEvents(1);
  }, [loadEvents]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadEvents(1);
  };

  const handleStatusChange = async (eventId, newStatus) => {
    setActionLoadingId(eventId);
    try {
      await updateAdminEventStatus(eventId, newStatus);
      // Refresh list
      await loadEvents(pagination.page);
    } catch (err) {
      alert(`Status transition failed: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Permanent Deletion Modal state
  const [deletingEvent, setDeletingEvent] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const handleExecuteDelete = async () => {
    if (!deletingEvent) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await deleteAdminEvent(deletingEvent.id);
      setDeletingEvent(null);
      setDeleteConfirmText('');
      await loadEvents(pagination.page);
    } catch (err) {
      setDeleteError(err.message || 'Failed to permanently delete event.');
    } finally {
      setDeleteLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header / Admin Breadcrumb */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#598c34] mb-1">
                <span>EventPass Administration</span>
                <span>•</span>
                <span>Catalogue Control</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Event & Inventory Management
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Authoritative event lifecycle, ticket tier pricing, and real-time inventory allocation.
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
                to="/admin/promocodes"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded text-xs font-semibold text-slate-600 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <Tag className="w-4 h-4" />
                <span>Promo Codes</span>
              </Link>
              <Link
                to="/admin/events/new"
                className="inline-flex items-center gap-2 bg-[#7fbd52] hover:bg-[#598c34] text-white px-4 py-2.5 rounded text-sm font-semibold transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Event</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            {['all', 'PUBLISHED', 'DRAFT', 'CANCELLED', 'COMPLETED'].map((statusKey) => (
              <button
                key={statusKey}
                onClick={() => setStatusFilter(statusKey)}
                className={`px-3 py-1.5 rounded text-xs font-semibold capitalize whitespace-nowrap transition-colors ${
                  statusFilter === statusKey
                    ? 'bg-slate-900 text-white'
                    : 'bg-gray-100 text-slate-600 hover:bg-gray-200'
                }`}
              >
                {statusKey === 'all' ? 'All Events' : statusKey.toLowerCase()}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className="relative w-full md:w-72">
            <input
              type="search"
              placeholder="Search title, venue, city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs text-slate-800 bg-gray-50 border border-gray-300 rounded focus:bg-white focus:outline-none focus:border-[#7fbd52] transition-colors"
            />
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2" />
          </form>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Events Table Container */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#7fbd52] mb-3"></div>
              <p className="text-sm">Loading admin event inventory...</p>
            </div>
          ) : events.length === 0 ? (
            <div className="py-16 text-center text-slate-500 space-y-3">
              <Layers className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-base font-medium text-slate-700">No events found matching your criteria</p>
              <p className="text-xs text-slate-400">Create your first event or adjust search filters.</p>
              <Link
                to="/admin/events/new"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#598c34] hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create an event now</span>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-gray-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">Event</th>
                    <th className="py-3.5 px-4">Date & Time</th>
                    <th className="py-3.5 px-4">Location</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-center">Tiers / Capacity</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {events.map((evt) => {
                    const statusInfo = STATUS_CONFIG[evt.status] || {
                      label: evt.status,
                      badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
                      icon: Clock
                    };
                    const StatusIcon = statusInfo.icon;
                    const totalCapacity = (evt.ticketTypes || []).reduce((sum, t) => sum + (t.quantityTotal || 0), 0);
                    const totalSold = (evt.ticketTypes || []).reduce((sum, t) => sum + (t.quantitySold || 0), 0);
                    const isActionLoading = actionLoadingId === evt.id;

                    return (
                      <tr key={evt.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Event Title & Category */}
                        <td className="py-4 px-4">
                          <div className="flex items-start gap-3">
                            <img
                              src={evt.imageUrl || evt.bannerUrl || evt.image || FALLBACK_EVENT_IMAGE}
                              alt=""
                              className="w-12 h-12 rounded object-cover border border-gray-200 flex-shrink-0 bg-slate-100"
                              onError={handleImageError}
                            />
                            <div className="min-w-0">
                              <Link 
                                to={`/admin/events/${evt.id}/edit`}
                                className="font-semibold text-slate-900 hover:text-[#598c34] transition-colors block truncate max-w-xs"
                                title={evt.title}
                              >
                                {evt.title}
                              </Link>
                              <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                                <span className="bg-gray-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                  {evt.category?.name || 'General'}
                                </span>
                                <span className="text-slate-400 font-mono text-[11px] truncate max-w-[120px]">
                                  /{evt.slug}
                                </span>
                                {!isEventImageValid(evt.imageUrl) && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded" title="Public listing hidden: requires valid poster image">
                                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                                    <span>Missing Image</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                        </td>

                        {/* Date & Time */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              {evt.startDateTime || evt.startsAt
                                ? new Date(evt.startDateTime || evt.startsAt).toLocaleDateString('en-ZA', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric'
                                  })
                                : 'Date TBD'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 pl-5">
                            {evt.startDateTime || evt.startsAt
                              ? new Date(evt.startDateTime || evt.startsAt).toLocaleTimeString('en-ZA', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })
                              : ''}
                          </div>
                        </td>

                        {/* Location */}
                        <td className="py-4 px-4">
                          <div className="flex items-start gap-1.5 text-xs text-slate-700">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                            <div className="truncate max-w-[150px]">
                              <div className="font-medium truncate">{evt.venue}</div>
                              <div className="text-slate-400 text-[11px] truncate">
                                {evt.location || evt.city || 'Cape Town'}{evt.province ? `, ${evt.province}` : ''}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusInfo.badgeClass}`}>
                            <StatusIcon className="w-3 h-3" />
                            <span>{statusInfo.label}</span>
                          </span>
                        </td>

                        {/* Tiers & Capacity */}
                        <td className="py-4 px-4 text-center whitespace-nowrap">
                          <div className="text-xs font-semibold text-slate-800">
                            {evt.ticketTypes?.length || 0} {(evt.ticketTypes?.length === 1) ? 'tier' : 'tiers'}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            <span className="font-medium text-slate-700">{totalSold}</span> / {totalCapacity} sold
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <Link
                              to={`/admin/events/${evt.id}/edit`}
                              className="p-1.5 text-slate-600 hover:text-[#598c34] hover:bg-slate-100 rounded transition-colors"
                              title="Edit Event & Tiers"
                            >
                              <Edit3 className="w-4 h-4" />
                            </Link>

                            {/* Public View link (if published) */}
                            {evt.status === 'PUBLISHED' && (
                              <Link
                                to={`/events/${evt.slug || evt.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors"
                                title="View Public Page"
                              >
                                <Eye className="w-4 h-4" />
                              </Link>
                            )}

                            {/* Fast Status Transitions */}
                            {evt.status === 'DRAFT' && (
                              <button
                                onClick={() => handleStatusChange(evt.id, 'PUBLISHED')}
                                disabled={isActionLoading}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold transition-colors disabled:opacity-50"
                                title="Publish Event"
                              >
                                Publish
                              </button>
                            )}

                            {evt.status === 'PUBLISHED' && (
                              <button
                                onClick={() => handleStatusChange(evt.id, 'DRAFT')}
                                disabled={isActionLoading}
                                className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-[11px] font-semibold transition-colors disabled:opacity-50"
                                title="Revert to Draft"
                              >
                                Draft
                              </button>
                            )}

                            {evt.status !== 'CANCELLED' && (
                              <button
                                onClick={() => {
                                  if (window.confirm(`Are you sure you want to cancel "${evt.title}"? This prevents any new ticket purchases.`)) {
                                    handleStatusChange(evt.id, 'CANCELLED');
                                  }
                                }}
                                disabled={isActionLoading}
                                className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded transition-colors disabled:opacity-50"
                                title="Cancel Event"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            )}

                            {/* Permanent Deletion (Authorized Admins only) */}
                            <button
                              onClick={() => {
                                setDeletingEvent(evt);
                                setDeleteConfirmText('');
                                setDeleteError(null);
                              }}
                              disabled={isActionLoading}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                              title="Permanently Delete Event"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Footer */}
          {pagination.totalPages > 1 && (
            <div className="bg-slate-50 border-t border-gray-200 px-4 py-3 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                Showing page <span className="font-semibold text-slate-700">{pagination.page}</span> of <span className="font-semibold text-slate-700">{pagination.totalPages}</span> ({pagination.total} total events)
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadEvents(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="px-2.5 py-1 text-xs border border-gray-300 rounded font-medium bg-white text-slate-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => loadEvents(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="px-2.5 py-1 text-xs border border-gray-300 rounded font-medium bg-white text-slate-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Permanent Deletion Confirmation Modal */}
        {deletingEvent && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 border border-gray-200 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 text-red-600">
                  <div className="p-2 bg-red-100 rounded-full">
                    <Trash2 className="w-5 h-5 text-red-600" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Permanently Delete Event
                  </h3>
                </div>
                <button
                  onClick={() => setDeletingEvent(null)}
                  disabled={deleteLoading}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-sm text-slate-600">
                <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-red-900">
                    <AlertCircle className="w-4 h-4 text-red-700" />
                    <span>Permanent Deletion Warning</span>
                  </div>
                  <p>
                    This operation will permanently remove the event record, ticket tiers, and unshared cloud images from the system. This cannot be undone.
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded p-3 text-xs space-y-1.5 font-mono">
                  <div><span className="text-slate-400">Event Title:</span> <strong className="text-slate-800 font-sans">{deletingEvent.title}</strong></div>
                  <div><span className="text-slate-400">Event ID:</span> <span className="text-slate-700 text-[11px]">{deletingEvent.id}</span></div>
                  <div><span className="text-slate-400">Current Status:</span> <span className="text-slate-700 font-semibold">{deletingEvent.status}</span></div>
                </div>

                <div className="text-xs text-slate-500">
                  <strong>Safety Constraint:</strong> Events with customer orders, issued tickets, or financial records cannot be deleted. If historical customer data exists, deletion will be blocked and you will be advised to cancel or archive the event instead.
                </div>

                {deleteError && (
                  <div className="p-3 bg-red-50 border border-red-300 rounded text-xs text-red-700 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600 mt-0.5" />
                      <span>{deleteError}</span>
                    </div>
                    {deleteError.includes('orders') && deletingEvent.status !== 'CANCELLED' && (
                      <button
                        type="button"
                        onClick={async () => {
                          const id = deletingEvent.id;
                          setDeletingEvent(null);
                          await handleStatusChange(id, 'CANCELLED');
                        }}
                        className="mt-1 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold"
                      >
                        Cancel Event Instead
                      </button>
                    )}
                  </div>
                )}

                <div className="space-y-1.5 pt-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Type <span className="font-mono text-red-600">DELETE</span> to confirm:
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setDeletingEvent(null)}
                  disabled={deleteLoading}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteDelete}
                  disabled={deleteConfirmText.trim().toUpperCase() !== 'DELETE' || deleteLoading}
                  className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 rounded transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  {deleteLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                      <span>Deleting Permanently...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Permanently Delete</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};


export default AdminEventsPage;

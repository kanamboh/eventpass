import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Calendar, 
  MapPin, 
  FileText, 
  Image, 
  Tag, 
  Ticket, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  XCircle, 
  Save, 
  Plus, 
  Trash2, 
  Edit2, 
  Eye, 
  Info,
  ShieldAlert,
  X
} from 'lucide-react';
import { 
  fetchAdminEventById, 
  updateAdminEvent, 
  updateAdminEventStatus,
  createAdminTicketType,
  updateAdminTicketType,
  deleteAdminTicketType
} from '../../services/adminApi';
import { fetchCategories } from '../../services/eventApi';
import { EventPosterUploader } from '../../components/admin/EventPosterUploader';

const PROVINCES = [
  'Gauteng',
  'Western Cape',
  'KwaZulu-Natal',
  'Eastern Cape',
  'Free State',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape'
];

const AdminEventEditPage = () => {
  const { id: eventId } = useParams();
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingEvent, setSavingEvent] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Event form
  const [form, setForm] = useState({
    title: '',
    subtitle: '',
    description: '',
    categoryId: '',
    venue: '',
    location: '',
    province: 'Western Cape',
    startDateTime: '',
    endDateTime: '',
    imageUrl: '',
    bannerUrl: '',
    organizerName: '',
    ageRestriction: ''
  });

  // Modal / Drawer state for Ticket Tier Edit or Add
  const [editingTier, setEditingTier] = useState(null); // null, 'NEW', or tier object
  const [tierForm, setTierForm] = useState({
    name: '',
    description: '',
    priceRands: '',
    priceUsdDollars: '',
    quantityTotal: 100,
    maxPerOrder: 10,
    status: 'ACTIVE'
  });
  const [savingTier, setSavingTier] = useState(false);
  const [tierError, setTierError] = useState(null);

  const loadEvent = useCallback(async () => {
    try {
      const data = await fetchAdminEventById(eventId);
      setEvent(data);

      // Populate form matching backend Event DTO
      setForm({
        title: data.title || '',
        subtitle: data.subtitle || '',
        description: data.description || '',
        categoryId: data.categoryId || '',
        venue: data.venue || '',
        location: data.location || '',
        province: data.province || 'Western Cape',
        startDateTime: data.startDateTime ? new Date(data.startDateTime).toISOString().slice(0, 16) : '',
        endDateTime: data.endDateTime ? new Date(data.endDateTime).toISOString().slice(0, 16) : '',
        imageUrl: data.imageUrl || '',
        bannerUrl: data.bannerUrl || '',
        organizerName: data.organizerName || '',
        ageRestriction: data.ageRestriction || ''
      });
    } catch (err) {
      setError(err.message || 'Failed to load event.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    async function init() {
      try {
        const [catList] = await Promise.all([fetchCategories(), loadEvent()]);
        setCategories(catList);
      } catch (err) {
        console.error('Failed to initialize edit page:', err);
      }
    }
    init();
  }, [loadEvent]);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEventSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    // Client pre-validation
    if (!form.title.trim() || form.title.trim().length < 3) {
      setError('Event title must be at least 3 characters.');
      return;
    }
    if (!form.description.trim() || form.description.trim().length < 10) {
      setError('Description must be at least 10 characters.');
      return;
    }
    if (!form.venue.trim() || form.venue.trim().length < 2) {
      setError('Venue must be at least 2 characters.');
      return;
    }
    if (!form.location.trim() || form.location.trim().length < 2) {
      setError('City / Location must be at least 2 characters.');
      return;
    }
    if (!form.startDateTime) {
      setError('Start date and time are required.');
      return;
    }

    const startDate = new Date(form.startDateTime);
    if (isNaN(startDate.getTime())) {
      setError('Please provide a valid start date and time.');
      return;
    }

    let endDate = null;
    if (form.endDateTime) {
      endDate = new Date(form.endDateTime);
      if (isNaN(endDate.getTime())) {
        setError('Please provide a valid end date and time.');
        return;
      }
      if (endDate <= startDate) {
        setError('End date and time must be after the start date and time.');
        return;
      }
    }

    if (!form.imageUrl.trim() || form.imageUrl.trim().length < 5) {
      setError('Card Image URL must be at least 5 characters.');
      return;
    }

    if (!form.organizerName.trim() || form.organizerName.trim().length < 2) {
      setError('Organizer name must be at least 2 characters.');
      return;
    }

    setSavingEvent(true);

    try {
      // Clean payload strictly matching adminUpdateEventSchema
      const payload = {
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        description: form.description.trim(),
        categoryId: form.categoryId || undefined,
        venue: form.venue.trim(),
        location: form.location.trim(),
        province: form.province.trim() || null,
        startDateTime: startDate.toISOString(),
        endDateTime: endDate ? endDate.toISOString() : null,
        imageUrl: form.imageUrl.trim(),
        bannerUrl: form.bannerUrl.trim() || null,
        organizerName: form.organizerName.trim(),
        ageRestriction: form.ageRestriction.trim() || null
      };

      const updated = await updateAdminEvent(eventId, payload);
      setEvent(updated);
      setSuccessMsg('Event details successfully saved.');
    } catch (err) {
      if (err.details && Array.isArray(err.details)) {
        const detailMsg = err.details
          .map((d) => (d.field ? `${d.field}: ${d.message}` : d.message))
          .join(' | ');
        setError(detailMsg || err.message);
      } else {
        setError(err.message || 'Failed to save event.');
      }
    } finally {
      setSavingEvent(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    setError(null);
    setSuccessMsg(null);

    if (newStatus === 'PUBLISHED') {
      const tiers = event?.ticketTypes || [];
      if (tiers.length === 0) {
        setError('Cannot publish an event with zero ticket tiers. Add at least one ticket tier first.');
        return;
      }
    }

    try {
      const updated = await updateAdminEventStatus(eventId, newStatus);
      setEvent(updated);
      setSuccessMsg(`Event status successfully transitioned to ${newStatus}.`);
    } catch (err) {
      setError(`Failed to update status: ${err.message}`);
    }
  };

  // Open Tier Modal for Create
  const handleOpenAddTier = () => {
    setEditingTier('NEW');
    setTierForm({
      name: '',
      description: '',
      priceRands: '150.00',
      priceUsdDollars: '',
      quantityTotal: 100,
      maxPerOrder: 10,
      status: 'ACTIVE'
    });
    setTierError(null);
  };

  // Open Tier Modal for Edit
  const handleOpenEditTier = (tier) => {
    setEditingTier(tier);
    const priceMinor = tier.priceMinor !== undefined ? tier.priceMinor : (tier.price || 0);
    setTierForm({
      name: tier.name,
      description: tier.description || '',
      priceRands: (priceMinor / 100).toFixed(2),
      priceUsdDollars: tier.paymentPriceUsdMinor !== undefined && tier.paymentPriceUsdMinor !== null
        ? (tier.paymentPriceUsdMinor / 100).toFixed(2)
        : '',
      quantityTotal: tier.quantityTotal,
      maxPerOrder: tier.maxPerOrder || 10,
      status: tier.status || 'ACTIVE'
    });
    setTierError(null);
  };

  // Close Tier Modal
  const handleCloseTierModal = () => {
    setEditingTier(null);
    setTierError(null);
  };

  // Submit Tier (Create or Update)
  const handleTierSubmit = async (e) => {
    e.preventDefault();
    setTierError(null);

    if (!tierForm.name.trim() || tierForm.name.trim().length < 2) {
      setTierError('Tier name must be at least 2 characters.');
      return;
    }

    const priceCents = Math.round(parseFloat(tierForm.priceRands || '0') * 100);
    if (isNaN(priceCents) || priceCents < 0) {
      setTierError('ZAR Price must be a valid non-negative number.');
      return;
    }

    let priceUsdCents = undefined;
    if (tierForm.priceUsdDollars !== '') {
      priceUsdCents = Math.round(parseFloat(tierForm.priceUsdDollars || '0') * 100);
      if (isNaN(priceUsdCents) || priceUsdCents < 0) {
        setTierError('USD Payment Price must be a valid non-negative number.');
        return;
      }
    }

    const totalQty = parseInt(tierForm.quantityTotal, 10);
    if (isNaN(totalQty) || totalQty <= 0) {
      setTierError('Quantity Total must be a positive integer.');
      return;
    }

    // Critical Rule F: Validate minimum legal capacity on update
    if (editingTier && editingTier !== 'NEW') {
      const minLegal = (editingTier.quantitySold || 0) + (editingTier.quantityReserved || 0);
      if (totalQty < minLegal) {
        setTierError(`Cannot reduce capacity to ${totalQty}. Minimum legal capacity is ${minLegal} (Sold: ${editingTier.quantitySold || 0} + Reserved: ${editingTier.quantityReserved || 0}).`);
        return;
      }
    }

    // Payload strictly matching adminCreateTicketTypeSchema and adminUpdateTicketTypeSchema
    const payload = {
      name: tierForm.name.trim(),
      description: tierForm.description.trim() || null,
      priceMinor: priceCents,
      quantityTotal: totalQty,
      maxPerOrder: parseInt(tierForm.maxPerOrder, 10) || 10,
      status: tierForm.status
    };
    if (priceUsdCents !== undefined) {
      payload.paymentPriceUsdMinor = priceUsdCents;
    }

    setSavingTier(true);
    try {
      if (editingTier === 'NEW') {
        await createAdminTicketType(eventId, payload);
      } else {
        await updateAdminTicketType(eventId, editingTier.id, payload);
      }
      await loadEvent();
      handleCloseTierModal();
      setSuccessMsg('Ticket tier successfully updated.');
    } catch (err) {
      if (err.details && Array.isArray(err.details)) {
        const detailMsg = err.details
          .map((d) => (d.field ? `${d.field}: ${d.message}` : d.message))
          .join(' | ');
        setTierError(detailMsg || err.message);
      } else {
        setTierError(err.message || 'Failed to save ticket tier.');
      }
    } finally {
      setSavingTier(false);
    }
  };

  // Delete Tier
  const handleDeleteTier = async (tier) => {
    const minLegal = (tier.quantitySold || 0) + (tier.quantityReserved || 0);
    if (minLegal > 0) {
      alert(`Cannot delete tier "${tier.name}" because it already has ${tier.quantitySold} tickets sold and ${tier.quantityReserved} reserved.`);
      return;
    }

    if (!window.confirm(`Are you sure you want to permanently delete tier "${tier.name}"?`)) {
      return;
    }

    try {
      await deleteAdminTicketType(eventId, tier.id);
      await loadEvent();
      setSuccessMsg(`Ticket tier "${tier.name}" deleted.`);
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 py-20 flex flex-col items-center justify-center text-slate-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#7fbd52] mb-3"></div>
        <p className="text-sm">Loading event details...</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-slate-50 py-20 text-center text-slate-500">
        <p className="text-base font-semibold text-slate-800">Event not found.</p>
        <Link to="/admin/events" className="text-xs text-[#598c34] underline mt-2 inline-block">
          Return to event list
        </Link>
      </div>
    );
  }

  const ticketTypes = event.ticketTypes || [];

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Back Link & Quick Info */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Link
            to="/admin/events"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#598c34] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Event Inventory</span>
          </Link>

          <div className="flex items-center gap-2">
            {event.status === 'PUBLISHED' && (
              <Link
                to={`/events/${event.slug || event.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>View Public Page</span>
              </Link>
            )}
            <span className="text-xs font-mono text-slate-400 bg-white border border-gray-200 px-2 py-1 rounded">
              ID: {event.id.slice(0, 8)}...
            </span>
          </div>
        </div>

        {/* Status Bar Card */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-full ${
              event.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-700' :
              event.status === 'DRAFT' ? 'bg-amber-100 text-amber-700' :
              event.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
              'bg-slate-100 text-slate-700'
            }`}>
              {event.status === 'PUBLISHED' && <CheckCircle className="w-5 h-5" />}
              {event.status === 'DRAFT' && <Clock className="w-5 h-5" />}
              {event.status === 'CANCELLED' && <XCircle className="w-5 h-5" />}
              {event.status === 'COMPLETED' && <CheckCircle className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Current Status:</span>
                <span className={`text-sm font-bold px-2.5 py-0.5 rounded-full ${
                  event.status === 'PUBLISHED' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                  event.status === 'DRAFT' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                  event.status === 'CANCELLED' ? 'bg-red-50 text-red-800 border border-red-200' :
                  'bg-slate-100 text-slate-800 border border-slate-200'
                }`}>
                  {event.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {event.status === 'DRAFT' && 'This event is private and cannot be viewed or purchased by customers.'}
                {event.status === 'PUBLISHED' && 'This event is active in the public catalogue and accepting ticket reservations.'}
                {event.status === 'CANCELLED' && 'This event has been cancelled and cannot accept new purchases or reservations.'}
                {event.status === 'COMPLETED' && 'This event has concluded.'}
              </p>
            </div>
          </div>

          {/* Status Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {event.status === 'DRAFT' && (
              <button
                type="button"
                onClick={() => handleStatusChange('PUBLISHED')}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold transition-colors shadow-sm"
              >
                Publish Event
              </button>
            )}

            {event.status === 'PUBLISHED' && (
              <button
                type="button"
                onClick={() => handleStatusChange('DRAFT')}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-semibold transition-colors shadow-sm"
              >
                Revert to Draft
              </button>
            )}

            {event.status !== 'CANCELLED' && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Cancel this event? Ticket purchases will be immediately disabled.')) {
                    handleStatusChange('CANCELLED');
                  }
                }}
                className="px-3.5 py-1.5 border border-red-300 text-red-600 hover:bg-red-50 rounded text-xs font-semibold transition-colors"
              >
                Cancel Event
              </button>
            )}
          </div>
        </div>

        {/* Global Notifications */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* TWO-COLUMN LAYOUT: Left (Event Metadata), Right (Ticket Tiers Management) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left Column: Event Metadata Form (7 cols) */}
          <div className="lg:col-span-7 bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 border-b border-gray-200 pb-3 mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#7fbd52]" />
              <span>Event Details & Metadata</span>
            </h2>

            <form onSubmit={handleEventSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  value={form.title}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Subtitle
                </label>
                <input
                  type="text"
                  name="subtitle"
                  value={form.subtitle}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="categoryId"
                    value={form.categoryId}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Age Restriction
                  </label>
                  <input
                    type="text"
                    name="ageRestriction"
                    value={form.ageRestriction}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  name="description"
                  rows="4"
                  required
                  value={form.description}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                />
              </div>

              {/* Schedule */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Date & Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    name="startDateTime"
                    required
                    value={form.startDateTime}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    End Date & Time (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    name="endDateTime"
                    value={form.endDateTime}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                  />
                </div>
              </div>

              {/* Venue */}
              <div className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Venue Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="venue"
                    required
                    value={form.venue}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      City / Location <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="location"
                      required
                      value={form.location}
                      onChange={handleFormChange}
                      className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Province <span className="text-red-500">*</span>
                    </label>
                    <select
                      name="province"
                      value={form.province}
                      onChange={handleFormChange}
                      className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                    >
                      {PROVINCES.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Media */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="sm:col-span-2">
                  <EventPosterUploader
                    value={form.imageUrl}
                    onChange={(newUrl) => setForm((prev) => ({ ...prev, imageUrl: newUrl }))}
                    label="Card Image / Event Poster"
                    required
                    helperText="Primary image displayed on public catalogue cards, search results, and event detail hero."
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Hero Banner URL (Optional)
                  </label>
                  <input
                    type="url"
                    name="bannerUrl"
                    value={form.bannerUrl}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Organizer Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="organizerName"
                    required
                    value={form.organizerName}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200 flex justify-end">
                <button
                  type="submit"
                  disabled={savingEvent}
                  className="inline-flex items-center gap-2 bg-[#7fbd52] hover:bg-[#598c34] text-white px-5 py-2 rounded text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingEvent ? 'Saving Changes...' : 'Save Event Details'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Ticket Tiers & Critical Inventory Management (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Ticket Tiers Card */}
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Ticket className="w-4 h-4 text-[#7fbd52]" />
                    <span>Ticket Tiers & Inventory</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Authoritative ticket capacity and pricing
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenAddTier}
                  className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded text-xs font-semibold transition-colors shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Tier</span>
                </button>
              </div>

              {/* Tiers List */}
              {ticketTypes.length === 0 ? (
                <div className="py-8 text-center text-slate-500 bg-slate-50 border border-dashed border-gray-200 rounded-lg">
                  <Ticket className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  <p className="text-xs font-medium text-slate-600">No ticket tiers configured</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Events require at least one tier to accept reservations.</p>
                  <button
                    type="button"
                    onClick={handleOpenAddTier}
                    className="mt-3 text-xs font-semibold text-[#598c34] hover:underline"
                  >
                    + Add first ticket tier
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {ticketTypes.map((tier) => {
                    const priceMinor = tier.priceMinor !== undefined ? tier.priceMinor : (tier.price || 0);
                    const priceRands = (priceMinor / 100).toFixed(2);
                    const sold = tier.quantitySold || 0;
                    const reserved = tier.quantityReserved || 0;
                    const available = tier.quantityAvailable ?? Math.max(0, tier.quantityTotal - sold - reserved);
                    const committed = sold + reserved;

                    return (
                      <div 
                        key={tier.id}
                        className="p-4 bg-slate-50 border border-gray-200 rounded-lg space-y-3 hover:border-gray-300 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-sm">{tier.name}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                tier.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' :
                                tier.status === 'SOLD_OUT' ? 'bg-red-100 text-red-800' :
                                'bg-gray-200 text-gray-700'
                              }`}>
                                {tier.status}
                              </span>
                            </div>
                            {tier.description && (
                              <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{tier.description}</p>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className="text-sm font-bold text-slate-900">R {priceRands}</span>
                            {tier.paymentPriceUsdMinor !== undefined && tier.paymentPriceUsdMinor !== null && (
                              <span className="block text-[11px] font-semibold text-emerald-700">
                                ${(tier.paymentPriceUsdMinor / 100).toFixed(2)} USD
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Inventory Breakdown Pill */}
                        <div className="grid grid-cols-4 gap-1 text-center bg-white border border-gray-200 rounded p-2 text-xs">
                          <div>
                            <span className="block text-[10px] uppercase font-semibold text-slate-400">Total</span>
                            <span className="font-bold text-slate-800">{tier.quantityTotal}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] uppercase font-semibold text-emerald-600">Sold</span>
                            <span className="font-bold text-emerald-700">{sold}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] uppercase font-semibold text-amber-600">Holds</span>
                            <span className="font-bold text-amber-700">{reserved}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] uppercase font-semibold text-blue-600">Avail</span>
                            <span className="font-bold text-blue-700">{available}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between text-xs pt-1">
                          <span className="text-[11px] text-slate-500">
                            Min legal capacity: <strong className="text-slate-700">{committed}</strong>
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenEditTier(tier)}
                              className="inline-flex items-center gap-1 text-slate-700 hover:text-[#598c34] font-medium"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>Edit Tier</span>
                            </button>
                            {committed === 0 && (
                              <button
                                type="button"
                                onClick={() => handleDeleteTier(tier)}
                                className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 font-medium"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Inventory & Pricing Safety Guide (Parts F & G) */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2 text-xs text-slate-600">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <ShieldAlert className="w-4 h-4 text-emerald-600" />
                <span>Authoritative Inventory Protection</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-slate-500">
                <li>
                  <strong>Anti-Overselling Rule:</strong> Total capacity cannot be reduced below current committed inventory (Sold + Active Reservations).
                </li>
                <li>
                  <strong>Price Change Safety:</strong> Updating a tier's price only affects new reservations. Existing orders and paid tickets remain locked to historical purchase amounts.
                </li>
                <li>
                  <strong>Currency Standard:</strong> All ticket prices are processed and locked in ZAR integer cents.
                </li>
              </ul>
            </div>

          </div>

        </div>

        {/* TIER MODAL (ADD / EDIT) */}
        {editingTier && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-lg border border-gray-200 shadow-xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                <h3 className="text-base font-bold text-slate-900">
                  {editingTier === 'NEW' ? 'Create Ticket Tier' : `Edit Tier: ${editingTier.name}`}
                </h3>
                <button
                  type="button"
                  onClick={handleCloseTierModal}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {tierError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{tierError}</span>
                </div>
              )}

              <form onSubmit={handleTierSubmit} className="space-y-4 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tier Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={tierForm.name}
                    onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })}
                    placeholder="e.g. VIP Access, Early Bird"
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={tierForm.description}
                    onChange={(e) => setTierForm({ ...tierForm, description: e.target.value })}
                    placeholder="e.g. Includes welcome drink & priority gate access"
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Price (ZAR) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">R</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={tierForm.priceRands}
                        onChange={(e) => setTierForm({ ...tierForm, priceRands: e.target.value })}
                        className="w-full pl-8 pr-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                      />
                    </div>
                    {editingTier !== 'NEW' && (
                      <p className="text-[10px] text-slate-400 mt-1">Applies to new orders only.</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Paystack ($ USD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="e.g. 49.00"
                        value={tierForm.priceUsdDollars}
                        onChange={(e) => setTierForm({ ...tierForm, priceUsdDollars: e.target.value })}
                        className="w-full pl-8 pr-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                      />
                    </div>
                    <p className="text-[10px] text-emerald-700 font-medium mt-1">Fixed USD charge</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Total Capacity <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={tierForm.quantityTotal}
                      onChange={(e) => setTierForm({ ...tierForm, quantityTotal: e.target.value })}
                      className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                    />
                    {editingTier && editingTier !== 'NEW' && (
                      <p className="text-[10px] text-amber-700 font-medium mt-1">
                        Min legal: {(editingTier.quantitySold || 0) + (editingTier.quantityReserved || 0)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Max Per Order (1–50)</label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={tierForm.maxPerOrder}
                      onChange={(e) => setTierForm({ ...tierForm, maxPerOrder: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                    <select
                      value={tierForm.status}
                      onChange={(e) => setTierForm({ ...tierForm, status: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INACTIVE">INACTIVE</option>
                      <option value="SOLD_OUT">SOLD_OUT</option>
                    </select>
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-200 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCloseTierModal}
                    className="px-3 py-1.5 border border-gray-300 rounded text-xs font-semibold text-slate-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingTier}
                    className="px-4 py-1.5 bg-[#7fbd52] hover:bg-[#598c34] text-white rounded text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    {savingTier ? 'Saving Tier...' : (editingTier === 'NEW' ? 'Create Tier' : 'Update Tier')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default AdminEventEditPage;

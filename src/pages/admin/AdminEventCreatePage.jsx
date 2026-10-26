import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Calendar, 
  MapPin, 
  FileText, 
  Image, 
  Tag, 
  Ticket, 
  AlertCircle, 
  Save 
} from 'lucide-react';
import { createAdminEvent } from '../../services/adminApi';
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

const AdminEventCreatePage = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [allowOverride, setAllowOverride] = useState(false);


  // Event form state matching backend schema
  const [form, setForm] = useState({
    title: '',
    subtitle: '',
    description: '',
    categoryId: '',
    venue: '',
    location: 'Cape Town',
    province: 'Western Cape',
    startDateTime: '',
    endDateTime: '',
    imageUrl: '',
    bannerUrl: '',
    organizerName: '',
    ageRestriction: 'All Ages'
  });

  // Optional initial ticket tier
  const [hasInitialTier, setHasInitialTier] = useState(true);
  const [tierForm, setTierForm] = useState({
    name: 'General Admission',
    description: 'Standard event entry ticket',
    priceRands: '150.00',
    quantityTotal: 100
  });

  useEffect(() => {
    async function initCategories() {
      try {
        const catList = await fetchCategories();
        setCategories(catList);
        if (catList.length > 0) {
          setForm((prev) => ({ ...prev, categoryId: catList[0].id }));
        }
      } catch (err) {
        console.error('Failed to load categories:', err);
      } finally {
        setLoadingCategories(false);
      }
    }
    initCategories();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleTierChange = (e) => {
    const { name, value } = e.target;
    setTierForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Strict client-side pre-validation matching backend requirements
    if (!form.title.trim() || form.title.trim().length < 3) {
      setError('Event title must be at least 3 characters.');
      return;
    }
    if (!form.categoryId) {
      setError('Please select an event category.');
      return;
    }
    if (!form.description.trim() || form.description.trim().length < 10) {
      setError('Description must be at least 10 characters.');
      return;
    }
    if (!form.venue.trim() || form.venue.trim().length < 2) {
      setError('Venue name must be at least 2 characters.');
      return;
    }
    if (!form.location.trim() || form.location.trim().length < 2) {
      setError('City / Location must be at least 2 characters.');
      return;
    }
    if (!form.startDateTime) {
      setError('Event start date and time are required.');
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
        setError('Event end date and time must be after the start date and time.');
        return;
      }
    }

    if (!form.imageUrl.trim() || form.imageUrl.trim().length < 5) {
      setError('Image URL must be at least 5 characters.');
      return;
    }

    if (!form.organizerName.trim() || form.organizerName.trim().length < 2) {
      setError('Organizer name must be at least 2 characters.');
      return;
    }

    // Build payload strictly conforming to adminCreateEventSchema
    const payload = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || undefined,
      description: form.description.trim(),
      categoryId: form.categoryId,
      venue: form.venue.trim(),
      location: form.location.trim(),
      province: form.province.trim() || undefined,
      startDateTime: startDate.toISOString(),
      endDateTime: endDate ? endDate.toISOString() : undefined,
      imageUrl: form.imageUrl.trim(),
      bannerUrl: form.bannerUrl.trim() || undefined,
      organizerName: form.organizerName.trim(),
      ageRestriction: form.ageRestriction.trim() || undefined,
      status: 'DRAFT',
      allowDuplicateOverride: Boolean(allowOverride)
    };

    if (hasInitialTier && tierForm.name.trim()) {
      if (tierForm.name.trim().length < 2) {
        setError('Tier name must be at least 2 characters.');
        return;
      }
      const priceCents = Math.round(parseFloat(tierForm.priceRands || '0') * 100);
      if (isNaN(priceCents) || priceCents < 0) {
        setError('Tier price must be a valid non-negative number in ZAR.');
        return;
      }
      const capacity = parseInt(tierForm.quantityTotal, 10);
      if (isNaN(capacity) || capacity <= 0) {
        setError('Tier total quantity must be greater than 0.');
        return;
      }

      payload.ticketTypes = [
        {
          name: tierForm.name.trim(),
          description: tierForm.description.trim() || undefined,
          priceMinor: priceCents,
          quantityTotal: capacity,
          maxPerOrder: 10
        }
      ];
    }

    setSubmitting(true);
    try {
      const newEvent = await createAdminEvent(payload);
      // Navigate to event edit page to allow further tier setup or publishing
      navigate(`/admin/events/${newEvent.id}/edit`);
    } catch (err) {
      if (err.code === 'DUPLICATE_EVENT_DETECTED') {
        setDuplicateWarning({
          message: err.message,
          details: err.details
        });
        setError(null);
      } else if (err.details && Array.isArray(err.details)) {
        setDuplicateWarning(null);
        const detailMsg = err.details
          .map((d) => (d.field ? `${d.field}: ${d.message}` : d.message))
          .join(' | ');
        setError(detailMsg || err.message);
      } else {
        setDuplicateWarning(null);
        setError(err.message || 'Failed to create event.');
      }
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Back Link & Header */}
        <div className="flex items-center justify-between">
          <Link
            to="/admin/events"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#598c34] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Event Inventory</span>
          </Link>
          <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded font-medium">
            New Event will save as DRAFT
          </span>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6 sm:p-8 shadow-sm">
          <div className="border-b border-gray-200 pb-4 mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Create New Event
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Configure event details, dates, venue information, and initial ticket inventory.
            </p>
          </div>

          {/* Duplicate Event Warning Callout */}
          {duplicateWarning && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-900 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-700 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-amber-950">Potential Duplicate Event Detected</div>
                  <p className="text-xs text-amber-800 leading-relaxed">{duplicateWarning.message}</p>
                  {duplicateWarning.details?.duplicateEvent && (
                    <div className="mt-2 p-2 bg-white/70 border border-amber-200 rounded text-xs font-mono text-slate-700 space-y-0.5">
                      <div><strong>Existing Event:</strong> {duplicateWarning.details.duplicateEvent.title}</div>
                      <div><strong>Date:</strong> {new Date(duplicateWarning.details.duplicateEvent.startDateTime).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                      <div><strong>Venue:</strong> {duplicateWarning.details.duplicateEvent.venue}</div>
                      <div><strong>Status:</strong> {duplicateWarning.details.duplicateEvent.status}</div>
                    </div>
                  )}
                </div>
              </div>
              <div className="pt-2 border-t border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-amber-800">
                  If this is a legitimate recurring event or a distinct event sharing a similar title, you may explicitly approve the duplicate.
                </p>
                <button
                  type="button"
                  onClick={async (e) => {
                    setAllowOverride(true);
                    // trigger submission with allowDuplicateOverride = true
                    const startDate = new Date(form.startDateTime);
                    const endDate = form.endDateTime ? new Date(form.endDateTime) : null;
                    const overridePayload = {
                      title: form.title.trim(),
                      subtitle: form.subtitle.trim() || undefined,
                      description: form.description.trim(),
                      categoryId: form.categoryId,
                      venue: form.venue.trim(),
                      location: form.location.trim(),
                      province: form.province.trim() || undefined,
                      startDateTime: startDate.toISOString(),
                      endDateTime: endDate ? endDate.toISOString() : undefined,
                      imageUrl: form.imageUrl.trim(),
                      bannerUrl: form.bannerUrl.trim() || undefined,
                      organizerName: form.organizerName.trim(),
                      ageRestriction: form.ageRestriction.trim() || undefined,
                      status: 'DRAFT',
                      allowDuplicateOverride: true
                    };
                    setSubmitting(true);
                    try {
                      const newEvent = await createAdminEvent(overridePayload);
                      navigate(`/admin/events/${newEvent.id}/edit`);
                    } catch (err) {
                      setError(err.message || 'Failed to create event.');
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded shadow-sm whitespace-nowrap transition-colors"
                >
                  Approve Duplicate & Proceed
                </button>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}


          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Core Details */}
            <div className="space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#7fbd52]" />
                <span>1. Event Information</span>
              </h2>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Event Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="title"
                    required
                    value={form.title}
                    onChange={handleChange}
                    placeholder="e.g. Cape Town Jazz & Wine Festival 2026"
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Subtitle / Catchphrase
                  </label>
                  <input
                    type="text"
                    name="subtitle"
                    value={form.subtitle}
                    onChange={handleChange}
                    placeholder="e.g. A celebration of local sound and vintage wines"
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
                      onChange={handleChange}
                      disabled={loadingCategories}
                      className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
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
                      onChange={handleChange}
                      placeholder="e.g. All Ages, No Under 18s"
                      className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    name="description"
                    rows="4"
                    required
                    value={form.description}
                    onChange={handleChange}
                    placeholder="Provide full event info, schedule, door opening times, parking details..."
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Date & Time */}
            <div className="space-y-4 pt-4 border-t border-gray-200">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#7fbd52]" />
                <span>2. Schedule</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Date & Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    name="startDateTime"
                    required
                    value={form.startDateTime}
                    onChange={handleChange}
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
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Venue & Location */}
            <div className="space-y-4 pt-4 border-t border-gray-200">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#7fbd52]" />
                <span>3. Venue & Location</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Venue Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="venue"
                    required
                    value={form.venue}
                    onChange={handleChange}
                    placeholder="e.g. Kirstenbosch National Botanical Gardens"
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    City / Location <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="location"
                    required
                    value={form.location}
                    onChange={handleChange}
                    placeholder="e.g. Cape Town"
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
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                  >
                    {PROVINCES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Media & Organizer */}
            <div className="space-y-4 pt-4 border-t border-gray-200">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <Image className="w-4 h-4 text-[#7fbd52]" />
                <span>4. Media & Organizer</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    onChange={handleChange}
                    placeholder="https://images.unsplash.com/photo-..."
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
                    onChange={handleChange}
                    placeholder="e.g. EventPass Productions"
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Optional Initial Ticket Tier */}
            <div className="space-y-4 pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Ticket className="w-4 h-4 text-[#7fbd52]" />
                  <span>5. Initial Ticket Tier (Optional)</span>
                </h2>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasInitialTier}
                    onChange={(e) => setHasInitialTier(e.target.checked)}
                    className="rounded text-[#7fbd52] focus:ring-[#7fbd52]"
                  />
                  <span>Create initial tier now</span>
                </label>
              </div>

              {hasInitialTier && (
                <div className="p-4 bg-slate-50 border border-gray-200 rounded-lg grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Tier Name
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={tierForm.name}
                      onChange={handleTierChange}
                      placeholder="e.g. General Admission"
                      className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Price (ZAR)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">R</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        name="priceRands"
                        value={tierForm.priceRands}
                        onChange={handleTierChange}
                        placeholder="150.00"
                        className="w-full pl-8 pr-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Total Inventory Capacity
                    </label>
                    <input
                      type="number"
                      min="1"
                      name="quantityTotal"
                      value={tierForm.quantityTotal}
                      onChange={handleTierChange}
                      placeholder="100"
                      className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-6 border-t border-gray-200 flex items-center justify-end gap-3">
              <Link
                to="/admin/events"
                className="px-4 py-2 border border-gray-300 text-slate-700 rounded text-sm font-semibold hover:bg-gray-50 transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 bg-[#7fbd52] hover:bg-[#598c34] text-white px-5 py-2 rounded text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? 'Creating Event...' : 'Create Event (Draft)'}</span>
              </button>
            </div>

          </form>
        </div>

      </div>
    </div>
  );
};

export default AdminEventCreatePage;

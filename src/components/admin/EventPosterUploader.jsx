import React, { useState, useRef } from 'react';
import { Upload, Image as ImageIcon, CheckCircle, AlertCircle, Loader2, X, ExternalLink } from 'lucide-react';
import { uploadAdminEventPoster } from '../../services/adminApi';
import { FALLBACK_EVENT_IMAGE, handleImageError, isEventImageValid } from '../../utils/imageFallback';

/**
 * EventPosterUploader
 * Administrator event poster image uploader component.
 * Supports direct file upload (JPEG, PNG, WebP <= 5MB) with instant local preview,
 * upload loading state, readable error banners, and manual URL input fallback.
 */
export const EventPosterUploader = ({
  value = '',
  onChange,
  label = 'Card Image / Event Poster',
  required = true,
  helperText = 'Primary image displayed on public catalog cards, search results, and event detail hero.'
}) => {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [fileDetails, setFileDetails] = useState(null);

  const displayImage = localPreview || value;

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setUploadSuccess(false);

    // Client-side quick validations
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Unsupported file format. Please select a JPEG, PNG, or WebP image.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setUploadError('File exceeds the maximum allowed size of 4 MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Set local preview immediately
    const objectUrl = URL.createObjectURL(file);
    setLocalPreview(objectUrl);
    setFileDetails({
      name: file.name,
      sizeKb: Math.round(file.size / 1024)
    });

    // Upload to server
    setUploading(true);
    try {
      const result = await uploadAdminEventPoster(file);
      onChange(result.url);
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 5000);
    } catch (err) {
      console.error('Poster upload failed:', err);
      URL.revokeObjectURL(objectUrl);
      setLocalPreview(null);
      setFileDetails(null);
      if (err.code === 'STORAGE_NOT_CONFIGURED') {
        setUploadError(
          'Cloud storage is not configured on the server. You can enter an image URL directly into the fallback field below.'
        );
      } else {
        setUploadError(err.message || 'Failed to upload image. Please try again or use an image URL directly.');
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClear = () => {
    if (localPreview) {
      URL.revokeObjectURL(localPreview);
      setLocalPreview(null);
    }
    setFileDetails(null);
    setUploadError(null);
    setUploadSuccess(false);
    onChange('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-slate-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        {displayImage && (
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-red-600 hover:text-red-700 font-medium inline-flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" />
            <span>Remove Image</span>
          </button>
        )}
      </div>

      {/* Main Upload & Preview Area */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start bg-slate-50 border border-gray-200 rounded-lg p-4">
        {/* Left: Visual Preview Box (5 cols) */}
        <div className="md:col-span-5">
          <div className="relative aspect-[16/10] bg-slate-900 rounded-md overflow-hidden border border-gray-300 shadow-inner flex items-center justify-center">
            {displayImage ? (
              <img
                src={displayImage}
                alt="Event Poster Preview"
                className="w-full h-full object-cover"
                onError={handleImageError}
              />
            ) : (
              <div className="text-center p-4">
                <ImageIcon className="w-10 h-10 text-slate-600 mx-auto mb-1.5" />
                <p className="text-xs text-slate-400 font-medium">No poster selected</p>
                <p className="text-[10px] text-slate-500 mt-0.5">JPEG, PNG, or WebP up to 5MB</p>
              </div>
            )}

            {/* Uploading Overlay */}
            {uploading && (
              <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center p-3 text-white text-center animate-fade-in">
                <Loader2 className="w-7 h-7 text-[#7fbd52] animate-spin mb-2" />
                <p className="text-xs font-semibold">Uploading to secure storage...</p>
                <p className="text-[10px] text-slate-300 mt-0.5">Validating magic bytes & format</p>
              </div>
            )}
          </div>
          {fileDetails && (
            <p className="text-[11px] text-slate-500 mt-1 truncate">
              File: <span className="font-semibold text-slate-700">{fileDetails.name}</span> ({fileDetails.sizeKb} KB)
            </p>
          )}
        </div>

        {/* Right: Upload Actions & Feedback (7 cols) */}
        <div className="md:col-span-7 space-y-3">
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              id="event-poster-file-input"
              disabled={uploading}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#7fbd52] hover:bg-[#598c34] text-white px-4 py-2 rounded text-xs font-semibold transition-colors shadow-sm disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Uploading Poster...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Choose Image from Computer</span>
                </>
              )}
            </button>
            <p className="text-[11px] text-slate-400 mt-1">
              Supports JPEG, PNG, and WebP up to 5 MB. Content is validated server-side.
            </p>
          </div>

          {/* Success Banner */}
          {uploadSuccess && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded text-xs flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Poster uploaded successfully and linked to event!</span>
            </div>
          )}

          {/* Error Banner */}
          {uploadError && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold">Upload Notice:</span> {uploadError}
              </div>
            </div>
          )}

          {/* Missing or Invalid Image Warning for Admins */}
          {(!value || !isEventImageValid(value)) && !uploading && (
            <div className="p-2.5 bg-amber-50 border border-amber-300 text-amber-900 rounded text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold">Missing / Invalid Image Warning:</span>{' '}
                {!value
                  ? 'This event has no image. It will remain hidden from customers in the public catalog until a valid image is uploaded.'
                  : 'The current image URL is recognized as a placeholder, test stub, or invalid format. The event is excluded from customer discovery until a genuine poster is linked.'}
              </div>
            </div>
          )}

          {/* Fallback Image URL Input */}
          <div className="pt-2 border-t border-gray-200 space-y-1">
            <label className="block text-[11px] font-semibold text-slate-600">
              Direct Image URL (Persistent CDN URL or Fallback)
            </label>
            <div className="relative">
              <input
                type="url"
                value={value}
                onChange={(e) => {
                  setLocalPreview(null);
                  onChange(e.target.value);
                }}
                placeholder="https://images.unsplash.com/photo-... or persistent CDN link"
                className="w-full px-3 py-1.5 text-xs text-slate-900 bg-white border border-gray-300 rounded focus:border-[#7fbd52] focus:outline-none pr-8 font-mono"
              />
              {value && (
                <a
                  href={value}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  title="Open image in new tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              {helperText}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventPosterUploader;

import React from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useLikes } from '../context/LikesContext';
import { FALLBACK_EVENT_IMAGE, handleImageError } from '../utils/imageFallback';

const EventCard = ({ event }) => {
  const { isLiked, toggleLike } = useLikes();
  const liked = isLiked(event.id);

  return (
    <div className="group bg-white border border-gray-200 hover:border-gray-300 rounded overflow-hidden flex flex-col transition-all hover:shadow-sm">
      {/* Event Image Box */}
      <div className="relative aspect-[16/10] bg-gray-100 overflow-hidden">
        <Link to={`/events/${event.slug || event.id}`} className="block w-full h-full">
          <img
            src={event.imageUrl || event.bannerUrl || event.image || FALLBACK_EVENT_IMAGE}
            alt={event.title}
            className="w-full h-full object-cover group-hover:opacity-95 transition-opacity"
            loading="lazy"
            onError={handleImageError}
          />
        </Link>

        {/* Favorite Heart in Bottom Right of Image */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleLike(event.id);
          }}
          aria-label={liked ? "Remove from favourites" : "Add to favourites"}
          className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-white/90 hover:bg-white flex items-center justify-center text-slate-600 hover:text-red-500 shadow-sm transition-colors"
        >
          <Heart className={`w-3.5 h-3.5 ${liked ? 'fill-red-500 text-red-500' : 'text-slate-600'}`} />
        </button>
      </div>

      {/* Event Details: Date -> Title -> Venue -> Price */}
      <div className="p-3.5 flex flex-col flex-1">
        {/* Date in uppercase */}
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
          {event.dateDisplay ? event.dateDisplay.toUpperCase() : ''}
        </div>

        {/* Title */}
        <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#598c34] uppercase tracking-tight line-clamp-2 leading-snug mb-1">
          <Link to={`/events/${event.slug || event.id}`}>
            {event.title}
          </Link>
        </h3>

        {/* Venue/Location */}
        <p className="text-xs text-slate-500 line-clamp-1 mb-3">
          {event.venue}
        </p>

        {/* Price */}
        <div className="mt-auto pt-2 border-t border-gray-100 text-sm font-bold text-slate-900">
          {event.priceDisplay}
        </div>
      </div>
    </div>
  );
};

export default EventCard;

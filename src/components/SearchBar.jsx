import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Loader2 } from 'lucide-react';
import { fetchEvents } from '../services/eventApi';
import { handleImageError, isEventImageValid } from '../utils/imageFallback';

const SearchBar = ({ className = '' }) => {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [quickResults, setQuickResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setQuickResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(() => {
      setIsSearching(true);
      fetchEvents({ search: trimmed, limit: 6 })
        .then((data) => {
          const valid = (data.items || []).filter((ev) => isEventImageValid(ev.imageUrl));
          setQuickResults(valid.slice(0, 4));
          setIsSearching(false);
        })
        .catch(() => {
          setQuickResults([]);
          setIsSearching(false);
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSearch = (e) => {
    if (e) e.preventDefault();
    if (query.trim()) {
      navigate(`/events?search=${encodeURIComponent(query.trim())}`);
      setIsFocused(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setQuickResults([]);
  };

  return (
    <div className={`relative w-full ${className}`}>
      <form onSubmit={handleSearch} className="relative flex items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          placeholder="Search for any event, artist, or venue..."
          className="w-full h-11 pl-4 pr-20 text-xs sm:text-sm bg-white border border-gray-300 rounded-full focus:outline-none focus:border-[#7fbd52] focus:ring-2 focus:ring-[#7fbd52]/20 transition-all placeholder:text-gray-400 font-sans shadow-sm"
        />

        <div className="absolute right-1.5 flex items-center gap-1">
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="submit"
            className="w-8 h-8 rounded-full bg-[#7fbd52] hover:bg-[#6fa844] flex items-center justify-center text-white transition-all shadow-sm"
            aria-label="Search"
          >
            {isSearching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </button>
        </div>
      </form>

      {/* Quick Search Preview Dropdown */}
      {isFocused && query.trim() && (
        <div 
          className="absolute left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 overflow-hidden"
          onMouseDown={(e) => e.preventDefault()} // Keep focus while clicking
        >
          {isSearching && quickResults.length === 0 ? (
            <div className="px-4 py-3 text-xs text-slate-400 text-center flex items-center justify-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#7fbd52]" />
              <span>Searching database...</span>
            </div>
          ) : quickResults.length > 0 ? (
            <div>
              <div className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Matching Events
              </div>
              {quickResults.map((ev) => (
                <div
                  key={ev.id}
                  onClick={() => {
                    navigate(`/events/${ev.slug || ev.id}`);
                    setIsFocused(false);
                  }}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <img
                    src={ev.imageUrl || ev.bannerUrl || ev.image}
                    alt={ev.title}
                    className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                    onError={(e) => {
                      handleImageError(e, ev.id);
                      setQuickResults((prev) => prev.filter((item) => item.id !== ev.id));
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{ev.title}</p>
                    <p className="text-[11px] text-slate-500 truncate">{ev.venue} • {ev.priceDisplay}</p>
                  </div>
                </div>
              ))}
              <div className="border-t border-gray-100 mt-1 pt-1 px-4 py-1.5">
                <button
                  type="button"
                  onClick={handleSearch}
                  className="text-xs font-bold text-[#6aa340] hover:underline"
                >
                  View all results for "{query}" →
                </button>
              </div>
            </div>
          ) : (
            <div className="px-4 py-3 text-xs text-slate-500 text-center">
              No matching events found for "{query}".
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchBar;

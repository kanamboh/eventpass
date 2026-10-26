import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { 
  ChevronDown, 
  Search, 
  SlidersHorizontal,
  AlertCircle
} from 'lucide-react';
import { fetchEvents } from '../services/eventApi';
import EventCard from '../components/EventCard';
import { useLikes } from '../context/LikesContext';
import { isEventImageValid } from '../utils/imageFallback';

// Webtickets Category Tree Data populated with real public events
const CATEGORY_TREE = [
  {
    id: 'entertainment',
    name: 'Entertainment',
    items: [
      { id: 'featured', label: 'Featured', category: 'all' },
      { id: 'zeitz-mocaa', label: 'Zeitz MOCAA Film Caravan', search: 'Zeitz MOCAA' },
      { id: 'somnyama', label: 'THE SOMNYAMA SHOW: Halloween', search: 'SOMNYAMA' },
      { id: 'umngqungqo', label: 'UMNGQUNGQO Orchestral Artscape', search: 'UMNGQUNGQO' },
      { id: 'live-tour', label: '+LIVE+ Arena Tour', search: '+LIVE+' },
      { id: 'leon-bridges', label: 'Leon Bridges Happiness Tour', search: 'Leon Bridges' },
      { id: 'kirstenbosch', label: 'Kirstenbosch Summer Sunset', search: 'Kirstenbosch' },
      { id: 'nataniel', label: 'Nataniël: SOOIBRAND', search: 'Nataniël' },
      { id: 'karen-zoid', label: 'Karen Zoid in ZOID SPAWN', search: 'Karen Zoid' },
      { id: 'dancers-dogs', label: 'Dancers Love Dogs', search: 'Dancers Love Dogs' },
      {
        id: 'music',
        label: 'Music',
        category: 'music',
        subItems: [
          { id: 'music-all', label: 'All Music', category: 'music' },
          { id: 'music-orchestral', label: 'Orchestral & Choral', category: 'music', search: 'Orchestral' },
          { id: 'music-rock', label: 'Rock & Alternative', category: 'music', search: 'Rock' },
          { id: 'music-maskhandi', label: 'Maskhandi Festival', category: 'music', search: 'Maskhandi' },
          { id: 'music-soul', label: 'Soul & R&B Concerts', category: 'music', search: 'Leon' },
        ]
      },
      {
        id: 'theatre',
        label: 'Theatre & Dance',
        category: 'theatre',
        subItems: [
          { id: 'theatre-all', label: 'All Theatre & Dance', category: 'theatre' },
          { id: 'theatre-romeo', label: 'Roméo et Juliette Ballet', category: 'theatre', search: 'Juliette' },
          { id: 'theatre-giselle', label: 'Giselle Ballet', category: 'theatre', search: 'Giselle' },
          { id: 'theatre-history', label: 'HISTORY BOYS', category: 'theatre', search: 'HISTORY BOYS' },
          { id: 'theatre-phantom', label: 'The Phantom of the Opera', search: 'Phantom' },
        ]
      }
    ]
  },
  {
    id: 'tourism',
    name: 'Tourism & Activities',
    category: 'lifestyle',
    items: [
      { id: 'tourism-all', label: 'All Tourism & Activities', category: 'lifestyle' },
      { id: 'film-caravan', label: 'Pan-African Film Screenings', category: 'lifestyle', search: 'Zeitz' },
      { id: 'guided-hikes', label: "Lion's Head Moonlight Hike", category: 'lifestyle', search: 'Hike' },
    ]
  },
  {
    id: 'race-entries',
    name: 'Race Entries',
    category: 'sports',
    items: [
      { id: 'sports-all', label: 'All Race Entries & Sports', category: 'sports' },
      { id: 'cycle-tour', label: 'Cape Town Cycle Tour 2027', category: 'sports', search: 'Cycle' },
      { id: 'marathon', label: 'Sanlam Cape Town Marathon & 10km', category: 'sports', search: 'Marathon' },
      { id: 'rugby', label: 'Springboks vs New Zealand (SARU)', category: 'sports', search: 'Rugby' },
    ]
  },
  {
    id: 'festivals',
    name: 'Festivals & Expos',
    category: 'festivals',
    items: [
      { id: 'festivals-all', label: 'All Festivals & Expos', category: 'festivals' },
      { id: 'killarney', label: 'Killarney Motor Show 2026', category: 'festivals', search: 'Killarney' },
      { id: 'best-day-out', label: 'Best Day Out Festival 2026', category: 'festivals', search: 'Best Day Out' },
      { id: 'rands-holidae', label: 'Rands Holidae - To.Gather Again', category: 'festivals', search: 'Rands' },
      { id: 'classic-car', label: 'Franschhoek Classic Car Festival', category: 'festivals', search: 'Car' },
      { id: 'urban-revival', label: 'Urban Revival Conference 2026', category: 'festivals', search: 'Urban Revival' },
      { id: 'mommy-me', label: 'Mommy & Me Expo 2026', category: 'festivals', search: 'Mommy' },
    ]
  },
  {
    id: 'food-wine',
    name: 'Food & Wine',
    category: 'food',
    items: [
      { id: 'food-all', label: 'All Food & Wine', category: 'food' },
      { id: 'villiera', label: 'Villiera Fizzy Fest (Cap Classique)', category: 'food', search: 'Villiera' },
      { id: 'franschhoek-champagne', label: 'Franschhoek Cap Classique Festival', category: 'food', search: 'Champagne' },
      { id: 'wine-harvest', label: 'Stellenbosch Wine Harvest Feast', category: 'food', search: 'Harvest' },
      { id: 'street-food', label: 'Durban Street Food Festival', category: 'food', search: 'Street' },
    ]
  }
];

const REGIONS = [
  { label: 'Western Cape', value: 'western-cape' },
  { label: 'All Regions', value: 'all' },
  { label: 'Cape Town', value: 'Cape Town' },
  { label: 'Stellenbosch & Winelands', value: 'Stellenbosch' },
  { label: 'Gauteng (Johannesburg)', value: 'Johannesburg' },
  { label: 'KwaZulu-Natal (Durban)', value: 'Durban' }
];

const TIME_FILTERS = [
  { label: 'Anytime', value: 'anytime' },
  { label: 'This Weekend', value: 'weekend' },
  { label: 'This Month', value: 'month' },
  { label: 'Next 30 Days', value: 'upcoming' }
];

const ITEMS_PER_PAGE = 12; // 4 rows of 3 on desktop for visual balance

const EventsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { likedEvents } = useLikes();

  const categoryParam = searchParams.get('category') || 'all';
  const regionParam = searchParams.get('location') || 'western-cape';
  const searchParam = searchParams.get('search') || '';
  const filterParam = searchParams.get('filter') || '';
  const sortParam = searchParams.get('sort') || 'date';
  const timeParam = searchParams.get('when') || 'anytime';
  const pageParam = parseInt(searchParams.get('page') || '1', 10);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(pageParam || 1);

  // Live backend data states
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Sync state when pageParam in URL changes
  useEffect(() => {
    setCurrentPage(pageParam || 1);
  }, [pageParam]);

  // Fetch events from server whenever filters/pagination change
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);

    fetchEvents({
      page: currentPage,
      limit: ITEMS_PER_PAGE,
      category: categoryParam !== 'all' ? categoryParam : undefined,
      location: regionParam !== 'all' ? regionParam : undefined,
      search: searchParam || undefined,
      sort: sortParam,
      when: timeParam !== 'anytime' ? timeParam : undefined
    })
      .then((data) => {
        if (isCancelled) return;
        const validItems = (data.items || []).filter((e) => isEventImageValid(e.imageUrl));
        if (filterParam === 'likes') {
          // If viewing favorites, filter by likedEvents ids
          const liked = validItems.filter(
            (e) => likedEvents.includes(e.id) || likedEvents.includes(e.slug)
          );
          setEvents(liked);
          setTotalCount(liked.length);
          setTotalPages(Math.ceil(liked.length / ITEMS_PER_PAGE) || 1);
        } else {
          setEvents(validItems);
          setTotalCount(data.total !== undefined ? data.total : validItems.length);
          setTotalPages(data.totalPages || Math.ceil(validItems.length / ITEMS_PER_PAGE) || 1);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (isCancelled) return;
        console.error('Failed to load events:', err);
        setError(err.message || 'Unable to load events from the catalog. Please try again.');
        setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [categoryParam, regionParam, searchParam, filterParam, sortParam, timeParam, currentPage, likedEvents]);

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === 'all' || value === 'anytime') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    // Reset page to 1 when changing search or filters
    if (key !== 'page') {
      next.delete('page');
      setCurrentPage(1);
    }
    setSearchParams(next);
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    const next = new URLSearchParams(searchParams);
    if (newPage === 1) next.delete('page');
    else next.set('page', newPage.toString());
    setSearchParams(next);
    window.scrollTo({ top: 120, behavior: 'smooth' });
  };

  const handleSidebarClick = (category, search) => {
    const next = new URLSearchParams(searchParams);
    if (category) {
      if (category === 'all') next.delete('category');
      else next.set('category', category);
    }
    if (search !== undefined) {
      if (!search) next.delete('search');
      else next.set('search', search);
    }
    next.delete('page');
    setCurrentPage(1);
    setSearchParams(next);
    setMobileSidebarOpen(false);
  };

  const validCurrentPage = Math.max(1, Math.min(currentPage, totalPages || 1));

  // Dynamic Title & Breadcrumbs matching Webtickets reference
  const { pageTitle, breadcrumbCategory, breadcrumbSub } = useMemo(() => {
    if (filterParam === 'likes') {
      return { pageTitle: 'My Account - Favourites', breadcrumbCategory: 'MY ACCOUNT', breadcrumbSub: 'FAVOURITES' };
    }
    if (searchParam) {
      return { pageTitle: `Search - "${searchParam}"`, breadcrumbCategory: 'SEARCH', breadcrumbSub: searchParam.toUpperCase() };
    }
    if (categoryParam === 'music') {
      return { pageTitle: 'Entertainment - Music', breadcrumbCategory: 'ENTERTAINMENT', breadcrumbSub: 'MUSIC' };
    }
    if (categoryParam === 'theatre') {
      return { pageTitle: 'Entertainment - Theatre', breadcrumbCategory: 'ENTERTAINMENT', breadcrumbSub: 'THEATRE' };
    }
    if (categoryParam === 'sports') {
      return { pageTitle: 'Race Entries & Sports', breadcrumbCategory: 'RACE ENTRIES', breadcrumbSub: 'SPORTS' };
    }
    if (categoryParam === 'festivals') {
      return { pageTitle: 'Festivals & Expos', breadcrumbCategory: 'FESTIVALS', breadcrumbSub: 'EXPOS' };
    }
    if (categoryParam === 'food') {
      return { pageTitle: 'Food & Wine', breadcrumbCategory: 'FOOD & WINE', breadcrumbSub: 'FEASTS' };
    }
    if (categoryParam === 'lifestyle') {
      return { pageTitle: 'Tourism & Activities', breadcrumbCategory: 'TOURISM', breadcrumbSub: 'ACTIVITIES' };
    }
    return { pageTitle: 'Entertainment - Featured', breadcrumbCategory: 'ENTERTAINMENT', breadcrumbSub: 'FEATURED' };
  }, [categoryParam, searchParam, filterParam]);

  return (
    <div className="bg-white min-h-[calc(100vh-140px)] text-slate-800">
      
      {/* ==================================================
          PAGE TITLE AREA
          ================================================== */}
      <section className="bg-white border-b border-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          {/* Main Title */}
          <h1 className="text-xl sm:text-2xl font-normal sm:font-medium text-slate-800 tracking-tight">
            {pageTitle}
          </h1>

          {/* Breadcrumb Navigation on the Right */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <Link to="/" className="hover:text-slate-700 transition-colors">
              HOME
            </Link>
            <span className="text-slate-300">→</span>
            <Link to="/events" className="hover:text-slate-700 transition-colors">
              {breadcrumbCategory}
            </Link>
            <span className="text-slate-300">→</span>
            <span className="text-slate-700 font-bold">
              {breadcrumbSub}
            </span>
          </nav>
        </div>
      </section>

      {/* ==================================================
          CONTENT AREA: SIDEBAR + EVENT LISTING
          ================================================== */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Mobile Category Sidebar Trigger */}
        <div className="lg:hidden mb-4">
          <button
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-300 rounded text-xs font-bold text-slate-700 uppercase tracking-wider"
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#598c34]" />
              <span>Webtickets Categories</span>
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${mobileSidebarOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 items-start">
          
          {/* ==================================================
              LEFT: NARROW CATEGORY SIDEBAR TREE
              ================================================== */}
          <aside className={`w-full lg:w-56 xl:w-60 flex-shrink-0 ${mobileSidebarOpen ? 'block' : 'hidden lg:block'}`}>
            <div className="border-b border-gray-200 pb-2 mb-3">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Webtickets Categories
              </h2>
            </div>

            <div className="space-y-4 text-xs font-sans">
              {CATEGORY_TREE.map((branch) => {
                const isBranchActive = branch.category && categoryParam === branch.category;

                return (
                  <div key={branch.id} className="space-y-1">
                    {/* Top Level Category Node */}
                    <div 
                      onClick={() => handleSidebarClick(branch.category || 'all', '')}
                      className={`font-bold cursor-pointer transition-colors ${
                        isBranchActive || (branch.id === 'entertainment' && categoryParam === 'all' && !searchParam)
                          ? 'text-[#598c34]'
                          : 'text-slate-900 hover:text-[#598c34]'
                      }`}
                    >
                      {branch.name}
                    </div>

                    {/* Sub-tree Items */}
                    {branch.items && branch.items.length > 0 && (
                      <ul className="pl-3 space-y-1 border-l border-gray-200 ml-1">
                        {branch.items.map((item) => {
                          // Subcategory with subItems (e.g. Music, Theatre)
                          if (item.subItems) {
                            const isSubCatActive = categoryParam === item.category;
                            return (
                              <li key={item.id} className="pt-1">
                                <span 
                                  onClick={() => handleSidebarClick(item.category, '')}
                                  className={`font-semibold cursor-pointer block hover:text-[#598c34] ${
                                    isSubCatActive ? 'text-[#598c34]' : 'text-slate-700'
                                  }`}
                                >
                                  {item.label}
                                </span>
                                <ul className="pl-3 space-y-0.5 mt-0.5 border-l border-gray-100 ml-1">
                                  {item.subItems.map((sub) => {
                                    const isActive = (sub.search && searchParam === sub.search) || 
                                                     (!sub.search && categoryParam === sub.category && !searchParam);
                                    return (
                                      <li key={sub.id}>
                                        <button
                                          type="button"
                                          onClick={() => handleSidebarClick(sub.category, sub.search || '')}
                                          className={`text-left text-[11px] py-0.5 block hover:text-[#598c34] hover:underline transition-colors ${
                                            isActive ? 'text-[#598c34] font-bold' : 'text-slate-500'
                                          }`}
                                        >
                                          {sub.label}
                                        </button>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </li>
                            );
                          }

                          // Simple Item
                          const isActive = (item.search && searchParam === item.search) ||
                                           (item.category === 'all' && categoryParam === 'all' && !searchParam && item.id === 'featured');

                          return (
                            <li key={item.id}>
                              <button
                                type="button"
                                onClick={() => handleSidebarClick(item.category, item.search || '')}
                                className={`text-left text-xs py-0.5 block hover:text-[#598c34] hover:underline transition-colors ${
                                  isActive ? 'text-[#598c34] font-bold' : 'text-slate-600'
                                }`}
                              >
                                {item.label}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>

          {/* ==================================================
              RIGHT: FILTER CONTROLS & THREE-COLUMN EVENT GRID
              ================================================== */}
          <main className="flex-1 min-w-0 w-full">
            
            {/* Filter Area: [ Western Cape ▼ ]  [ Anytime ▼ ]  N items */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-6 border-b border-gray-200">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Region Filter */}
                <div className="relative">
                  <select
                    value={regionParam}
                    onChange={(e) => updateParam('location', e.target.value)}
                    className="h-8 pl-2.5 pr-7 text-xs text-slate-700 bg-white border border-gray-300 rounded hover:border-gray-400 focus:outline-none focus:border-[#7fbd52] appearance-none cursor-pointer"
                  >
                    {REGIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {/* Time Filter */}
                <div className="relative">
                  <select
                    value={timeParam}
                    onChange={(e) => updateParam('when', e.target.value)}
                    className="h-8 pl-2.5 pr-7 text-xs text-slate-700 bg-white border border-gray-300 rounded hover:border-gray-400 focus:outline-none focus:border-[#7fbd52] appearance-none cursor-pointer"
                  >
                    {TIME_FILTERS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {/* Items Count */}
                <span className="text-xs text-slate-500 font-medium pl-1">
                  {loading ? 'Loading events...' : `${totalCount} ${totalCount === 1 ? 'item' : 'items'}`}
                </span>
              </div>

              {/* Compact Sort on the Right */}
              <div className="relative">
                <select
                  value={sortParam}
                  onChange={(e) => updateParam('sort', e.target.value)}
                  className="h-8 pl-2.5 pr-7 text-xs text-slate-600 bg-white border border-gray-300 rounded hover:border-gray-400 focus:outline-none appearance-none cursor-pointer"
                >
                  <option value="date">Sort: Date</option>
                  <option value="popular">Sort: Popular</option>
                  <option value="price-low">Sort: Price (Low to High)</option>
                  <option value="price-high">Sort: Price (High to Low)</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Loading Skeleton State */}
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div key={idx} className="bg-white border border-gray-200 rounded overflow-hidden flex flex-col animate-pulse">
                    <div className="aspect-[16/10] bg-slate-100"></div>
                    <div className="p-3.5 flex flex-col flex-1 space-y-2.5">
                      <div className="h-2.5 w-20 bg-slate-200 rounded"></div>
                      <div className="h-4 w-5/6 bg-slate-200 rounded"></div>
                      <div className="h-3 w-1/2 bg-slate-200 rounded"></div>
                      <div className="mt-auto pt-2 border-t border-gray-100 flex justify-between items-center">
                        <div className="h-4 w-16 bg-slate-200 rounded"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              /* Error State */
              <div className="py-16 text-center border border-gray-200 rounded p-8 bg-gray-50/50">
                <div className="w-10 h-10 rounded-full bg-red-50 text-red-500 mx-auto flex items-center justify-center mb-3">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 mb-1">
                  Unable to load events
                </h3>
                <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
                  {error}
                </p>
                <button
                  onClick={() => handlePageChange(1)}
                  className="h-8 px-4 text-xs font-semibold bg-[#7fbd52] text-white rounded hover:bg-[#6fa844] transition-colors"
                >
                  Try Again
                </button>
              </div>
            ) : events.length > 0 ? (
              /* Three-Column Event Grid */
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {events.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      onImageError={(failedId) => {
                        setEvents((prev) => prev.filter((e) => e.id !== failedId));
                      }}
                    />
                  ))}
                </div>

                {/* Pagination matching Webtickets */}
                {totalPages > 1 && (
                  <nav aria-label="Event pagination" className="flex items-center justify-center gap-1.5 pt-10 pb-4">
                    <button
                      onClick={() => handlePageChange(validCurrentPage - 1)}
                      disabled={validCurrentPage === 1}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      « Previous
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                      <button
                        key={pg}
                        onClick={() => handlePageChange(pg)}
                        className={`w-8 h-8 text-xs font-bold rounded border transition-colors ${
                          validCurrentPage === pg
                            ? 'bg-[#7fbd52] text-white border-[#7fbd52]'
                            : 'bg-white text-slate-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {pg}
                      </button>
                    ))}
                    <button
                      onClick={() => handlePageChange(validCurrentPage + 1)}
                      disabled={validCurrentPage === totalPages}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Next »
                    </button>
                  </nav>
                )}
              </>
            ) : (
              /* Empty Search / Filter State */
              <div className="py-16 text-center border border-gray-200 rounded p-8">
                <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-slate-800 mb-1">
                  No events found in this category or region
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Try selecting "All Regions" or browsing all categories.
                </p>
                <button
                  onClick={() => {
                    setSearchParams(new URLSearchParams());
                  }}
                  className="h-8 px-4 text-xs font-semibold bg-[#7fbd52] text-white rounded hover:bg-[#6fa844] transition-colors"
                >
                  View All Events
                </button>
              </div>
            )}

          </main>
        </div>

      </div>

    </div>
  );
};

export default EventsPage;

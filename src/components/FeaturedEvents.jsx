import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Flame } from 'lucide-react';
import { fetchEvents } from '../services/eventApi';
import EventCard from './EventCard';
import EventTabs from './EventTabs';

const FeaturedEvents = () => {
  const [activeCategory, setActiveCategory] = useState('all');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    setLoading(true);

    fetchEvents({
      category: activeCategory !== 'all' ? activeCategory : undefined,
      limit: 8
    })
      .then((data) => {
        if (isCancelled) return;
        setEvents(data.items || []);
        setLoading(false);
      })
      .catch((err) => {
        if (isCancelled) return;
        console.error('Failed to load featured events:', err);
        setEvents([]);
        setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [activeCategory]);

  return (
    <section className="py-12 sm:py-16 bg-[#f8fafc]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header with Title and "View All" */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 gap-4">
          <div>
            <div className="flex items-center gap-2 text-[#7fbd52] text-xs font-extrabold uppercase tracking-widest mb-1">
              <Flame className="w-4 h-4" />
              <span>Don't Miss Out</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 font-sans tracking-tight">
              Featured Events
            </h2>
          </div>

          <Link
            to="/events"
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#6aa340] hover:text-[#598c34] transition-colors"
          >
            <span>Browse Full Calendar</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Category Tabs */}
        <div className="mb-8">
          <EventTabs
            activeCategory={activeCategory}
            onSelectCategory={setActiveCategory}
          />
        </div>

        {/* Grid of Events */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div key={idx} className="bg-white border border-gray-200 rounded overflow-hidden flex flex-col animate-pulse">
                <div className="aspect-[16/10] bg-slate-100"></div>
                <div className="p-3.5 flex flex-col flex-1 space-y-2">
                  <div className="h-2.5 w-16 bg-slate-200 rounded"></div>
                  <div className="h-4 w-3/4 bg-slate-200 rounded"></div>
                  <div className="h-3 w-1/2 bg-slate-200 rounded"></div>
                  <div className="mt-auto pt-2 border-t border-gray-100">
                    <div className="h-4 w-12 bg-slate-200 rounded"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : events.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-200 p-8">
            <p className="text-base font-bold text-slate-700">No events found in this category.</p>
            <p className="text-xs text-slate-500 mt-1">Check back soon or explore other categories.</p>
            <button
              onClick={() => setActiveCategory('all')}
              className="mt-4 btn-webticket-primary text-xs"
            >
              Reset Filters
            </button>
          </div>
        )}

      </div>
    </section>
  );
};

export default FeaturedEvents;

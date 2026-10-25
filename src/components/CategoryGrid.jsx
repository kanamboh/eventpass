import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CATEGORIES } from '../data/mockEvents';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { FALLBACK_EVENT_IMAGE, handleImageError } from '../utils/imageFallback';

const categoryTiles = CATEGORIES.filter((c) => c.id !== 'all');

const CategoryGrid = () => {
  const [showAll, setShowAll] = useState(false);

  const displayedCategories = showAll ? categoryTiles : categoryTiles.slice(0, 3);

  return (
    <section className="py-12 bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8">
          <div>
            <span className="text-xs font-extrabold uppercase tracking-widest text-[#7fbd52]">
              Explore Experiences
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 font-sans tracking-tight">
              Popular Categories
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 sm:mt-0">
            Browse through hundreds of live events across South Africa
          </p>
        </div>

        {/* Categories Grid (WebTickets 3-across or 4-across responsive) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedCategories.map((cat) => (
            <Link
              key={cat.id}
              to={`/events?category=${cat.id}`}
              className="category-tile-card group block relative"
            >
              <img
                src={cat.image || FALLBACK_EVENT_IMAGE}
                alt={cat.name}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={handleImageError}
              />
              {/* Dark Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10 group-hover:from-black/90 group-hover:via-black/40 transition-all duration-300"></div>

              {/* Title */}
              <div className="absolute inset-x-4 bottom-5 text-center z-10">
                <h3 className="text-xl font-bold text-white tracking-wide drop-shadow-md group-hover:text-[#7fbd52] transition-colors">
                  {cat.name}
                </h3>
                <span className="inline-block text-[11px] font-semibold text-gray-300 tracking-wider uppercase mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  Explore Events →
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* Toggle Button */}
        <div className="text-center mt-8">
          <button
            onClick={() => setShowAll(!showAll)}
            className="btn-webticket-outline text-xs h-10 px-6 gap-2"
          >
            <span>{showAll ? 'Show Less' : 'See All Categories'}</span>
            {showAll ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

      </div>
    </section>
  );
};

export default CategoryGrid;

import React from 'react';
import { CATEGORIES } from '../data/mockEvents';

const EventTabs = ({ activeCategory, onSelectCategory }) => {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
      {CATEGORIES.map((cat) => {
        const isActive = activeCategory === cat.id;
        return (
          <button
            key={cat.id}
            onClick={() => onSelectCategory(cat.id)}
            className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap shadow-sm ${
              isActive
                ? 'bg-[#7fbd52] text-white shadow-md shadow-[#7fbd52]/20'
                : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-gray-200'
            }`}
          >
            {cat.name}
          </button>
        );
      })}
    </div>
  );
};

export default EventTabs;

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar, 
  MapPin, 
  Tag, 
  Search, 
  ShieldCheck, 
  ArrowRight 
} from 'lucide-react';
import { CITIES, CATEGORIES } from '../data/mockEvents';
import { fetchEvents } from '../services/eventApi';
import { FALLBACK_EVENT_IMAGE, handleImageError } from '../utils/imageFallback';

const Hero = () => {
  const [featuredEvents, setFeaturedEvents] = useState([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [selectedCity, setSelectedCity] = useState('All Cities');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedWhen, setSelectedWhen] = useState('anytime');
  const navigate = useNavigate();

  useEffect(() => {
    let isCancelled = false;
    fetchEvents({ featured: true, limit: 5 })
      .then((data) => {
        if (isCancelled) return;
        if (data.items && data.items.length > 0) {
          setFeaturedEvents(data.items);
        }
      })
      .catch((err) => {
        console.error('Failed to load hero featured events:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  const slideCount = featuredEvents.length || 1;

  // Auto-advance hero slides every 6 seconds
  useEffect(() => {
    if (slideCount <= 1) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slideCount);
    }, 6000);
    return () => clearInterval(timer);
  }, [slideCount]);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slideCount);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slideCount) % slideCount);
  };

  const defaultHeroEvent = {
    id: 'zeitz-mocaa-sambizanga',
    slug: 'zeitz-mocaa-sambizanga',
    title: 'Experience South Africa’s Greatest Live Events',
    subtitle: 'Official, secure ticketing for top concerts, festivals, theatre, and sports across South Africa.',
    dateDisplay: 'Upcoming Season 2026',
    venue: 'Premier Venues Nationwide',
    city: 'Cape Town & Johannesburg',
    priceDisplay: 'From R30',
    imageUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80'
  };

  const activeEvent = featuredEvents[currentSlide] || defaultHeroEvent;

  const handleFilterSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (selectedCity !== 'All Cities') params.set('location', selectedCity);
    if (selectedCategory !== 'all') params.set('category', selectedCategory);
    if (selectedWhen !== 'anytime') params.set('when', selectedWhen);
    navigate(`/events?${params.toString()}`);
  };

  return (
    <section className="relative bg-topographic text-white pt-6 pb-12 sm:pb-16 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Main Hero Showcase Banner */}
        <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md min-h-[400px] sm:min-h-[480px] flex items-center">
          
          {/* Background Image with Cinematic Overlay */}
          <div className="absolute inset-0 z-0">
            <img
              src={activeEvent.bannerUrl || activeEvent.imageUrl || activeEvent.image || FALLBACK_EVENT_IMAGE}
              alt={activeEvent.title}
              className="w-full h-full object-cover object-center transform scale-105 transition-transform duration-1000 ease-out"
              onError={handleImageError}
            />
            <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-slate-950 via-slate-950/90 to-slate-950/20"></div>
            <div className="absolute inset-0 bg-[#1a2b49]/40 mix-blend-multiply"></div>
          </div>

          {/* Slide Content */}
          <div className="relative z-10 p-6 sm:p-10 lg:p-14 max-w-2xl">
            {/* Badge */}
            {activeEvent.badge && (
              <span className="inline-block bg-[#7fbd52] text-white text-xs uppercase font-extrabold px-3 py-1 rounded-full tracking-wider mb-3 shadow-md">
                {activeEvent.badge}
              </span>
            )}

            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white leading-tight font-sans tracking-tight mb-3">
              {activeEvent.title}
            </h1>

            <p className="text-sm sm:text-base text-gray-200 line-clamp-2 mb-6 font-normal">
              {activeEvent.subtitle || activeEvent.description}
            </p>

            {/* Meta details */}
            <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-gray-300 mb-8">
              <span className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10">
                <Calendar className="w-4 h-4 text-[#7fbd52]" />
                <span>{activeEvent.dateDisplay}</span>
              </span>
              <span className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10">
                <MapPin className="w-4 h-4 text-[#7fbd52]" />
                <span className="truncate max-w-[200px] sm:max-w-none">{activeEvent.venue}</span>
              </span>
              <span className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10 font-bold text-white">
                <Tag className="w-4 h-4 text-[#7fbd52]" />
                <span>{activeEvent.priceDisplay}</span>
              </span>
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to={`/events/${activeEvent.slug || activeEvent.id}`}
                className="btn-webticket-primary text-sm px-8 h-12"
              >
                <span>Book Now</span>
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>

              <Link
                to="/events"
                className="btn-webticket-outline border-white/40 text-white hover:border-[#7fbd52] hover:bg-[#7fbd52] text-sm h-12 px-6"
              >
                View All Events
              </Link>
            </div>
          </div>

          {/* Navigation Arrows */}
          <div className="absolute right-4 bottom-4 sm:bottom-auto sm:right-6 sm:top-1/2 sm:-translate-y-1/2 z-20 flex sm:flex-col gap-2">
            <button
              onClick={prevSlide}
              aria-label="Previous event"
              className="w-10 h-10 rounded-full bg-black/40 hover:bg-[#7fbd52] text-white flex items-center justify-center backdrop-blur-sm border border-white/20 transition-all hover:scale-105"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={nextSlide}
              aria-label="Next event"
              className="w-10 h-10 rounded-full bg-black/40 hover:bg-[#7fbd52] text-white flex items-center justify-center backdrop-blur-sm border border-white/20 transition-all hover:scale-105"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Dot Indicators */}
          <div className="absolute left-6 bottom-4 sm:bottom-6 z-20 flex items-center gap-2">
            {featuredEvents.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                aria-label={`Go to slide ${index + 1}`}
                className={`h-2 rounded-full transition-all ${
                  currentSlide === index ? 'w-8 bg-[#7fbd52]' : 'w-2 bg-white/40 hover:bg-white/70'
                }`}
              />
            ))}
          </div>

        </div>

        {/* Quick Filter Dock Bar below Hero (Webtickets Style) */}
        <div className="mt-8 bg-white text-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl border border-gray-100">
          <form onSubmit={handleFilterSearch} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 items-center">
            
            {/* City Selector */}
            <div className="relative">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Where (City)
              </label>
              <div className="relative flex items-center">
                <MapPin className="w-4 h-4 text-[#7fbd52] absolute left-3 pointer-events-none" />
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="w-full h-11 pl-9 pr-8 text-xs font-semibold bg-slate-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#7fbd52] focus:bg-white transition-all text-slate-700"
                >
                  {CITIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Category Selector */}
            <div className="relative">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Category
              </label>
              <div className="relative flex items-center">
                <Tag className="w-4 h-4 text-[#7fbd52] absolute left-3 pointer-events-none" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full h-11 pl-9 pr-8 text-xs font-semibold bg-slate-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#7fbd52] focus:bg-white transition-all text-slate-700"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* When / Date Selector */}
            <div className="relative">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                When
              </label>
              <div className="relative flex items-center">
                <Calendar className="w-4 h-4 text-[#7fbd52] absolute left-3 pointer-events-none" />
                <select
                  value={selectedWhen}
                  onChange={(e) => setSelectedWhen(e.target.value)}
                  className="w-full h-11 pl-9 pr-8 text-xs font-semibold bg-slate-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#7fbd52] focus:bg-white transition-all text-slate-700"
                >
                  <option value="anytime">Anytime</option>
                  <option value="weekend">This Weekend</option>
                  <option value="month">This Month</option>
                  <option value="upcoming">Next 30 Days</option>
                </select>
              </div>
            </div>

            {/* Submit Search Button */}
            <div className="pt-2 sm:pt-4">
              <button
                type="submit"
                className="w-full btn-webticket-primary h-11 text-xs gap-2 shadow-md"
              >
                <Search className="w-4 h-4" />
                <span>Find Events</span>
              </button>
            </div>

          </form>
        </div>

      </div>
    </section>
  );
};

export default Hero;

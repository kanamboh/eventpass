import React from 'react';
import Hero from '../components/Hero';
import CategoryGrid from '../components/CategoryGrid';
import FeaturedEvents from '../components/FeaturedEvents';
import RetailPartnerBanner from '../components/RetailPartnerBanner';
import Newsletter from '../components/Newsletter';

const HomePage = () => {
  return (
    <div>
      {/* 1. Hero Showcase with Topographic Pattern */}
      <Hero />

      {/* 2. Popular Categories Tiles */}
      <CategoryGrid />

      {/* 3. Featured & Categorized Events */}
      <FeaturedEvents />

      {/* 4. Retail Partner Till Integration */}
      <RetailPartnerBanner />

      {/* 5. Newsletter Sign Up */}
      <Newsletter />
    </div>
  );
};

export default HomePage;

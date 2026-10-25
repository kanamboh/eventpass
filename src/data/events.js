/**
 * EventPass Central Public Event Data Source
 * Seed metadata derived from public Webtickets South Africa listings.
 * 
 * Schema:
 * {
 *   id,
 *   title,
 *   date,
 *   time,
 *   venue,
 *   location,
 *   price,
 *   category,
 *   image
 * }
 */

export const CATEGORIES = [
  { id: 'all', name: 'All Events', icon: 'Sparkles' },
  { id: 'music', name: 'Music & Concerts', icon: 'Music', image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80' },
  { id: 'theatre', name: 'Theatre & Dance', icon: 'Drama', image: 'https://images.unsplash.com/photo-1469488865564-c2de10f69f96?auto=format&fit=crop&w=800&q=80' },
  { id: 'sports', name: 'Sports & Active', icon: 'Trophy', image: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=800&q=80' },
  { id: 'festivals', name: 'Festivals & Expos', icon: 'Calendar', image: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=800&q=80' },
  { id: 'food', name: 'Food & Wine', icon: 'Utensils', image: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=800&q=80' },
  { id: 'lifestyle', name: 'Tourism & Outdoors', icon: 'Compass', image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80' }
];

export const CITIES = [
  'All Cities',
  'Cape Town',
  'Stellenbosch',
  'Johannesburg',
  'Durban',
  'Pretoria',
  'Gqeberha'
];

export const EVENTS = [
  // 1. Zeitz MOCAA presents Pan-African Film Caravan
  {
    id: 'zeitz-mocaa-sambizanga',
    title: 'Zeitz MOCAA presents Pan-African Film Caravan, screening Sambizanga by Sarah Maldoror',
    date: '30 Oct 2026',
    time: '18:00',
    venue: 'Zeitz MOCAA, V&A Waterfront',
    location: 'Cape Town',
    city: 'Cape Town',
    price: 30,
    priceDisplay: 'From R30',
    category: 'lifestyle',
    image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '30 Oct 2026 18:00',
    rawDate: '2026-10-30T18:00:00',
    featured: false,
    popular: true,
    description: 'Zeitz MOCAA in partnership with the Pan-African Film Caravan presents a rare screening of Sarah Maldorors groundbreaking 1972 feature Sambizanga. Set in Angola on the eve of the armed liberation struggle, the film chronicles the courage of Maria as she searches for her detained activist husband.',
    tiers: [
      { id: 'zm-1', name: 'General Admission', price: 30, description: 'Cinema screening entry + gallery access', available: 100 }
    ]
  },

  // 2. THE SOMNYAMA SHOW: CAPE TOWN HALLOWEEN EDITION
  {
    id: 'somnyama-show-halloween',
    title: 'THE SOMNYAMA SHOW: CAPE TOWN HALLOWEEN EDITION',
    date: '31 Oct 2026',
    time: '19:00',
    venue: 'Hearty Collective, Cape Town',
    location: 'Cape Town',
    city: 'Cape Town',
    price: 150,
    priceDisplay: 'R150 - R250',
    category: 'music',
    image: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '31 Oct 2026 19:00',
    rawDate: '2026-10-31T19:00:00',
    featured: true,
    popular: true,
    description: 'Cape Towns premier Halloween music and costume experience at Hearty Collective. Featuring cutting-edge electronic beats, live Afro-house artists, and immersive stage installations.',
    tiers: [
      { id: 'ss-1', name: 'Early Bird', price: 150, description: 'Phase 1 General Entry', available: 80 },
      { id: 'ss-2', name: 'Final Release', price: 250, description: 'General Access to both stages', available: 150 }
    ]
  },

  // 3. UMNGQUNGQO ORCHESTRAL EXPERIENCE LIVE AT ARTSCAPE
  {
    id: 'umngqungqo-orchestral-artscape',
    title: 'UMNGQUNGQO ORCHESTRAL EXPERIENCE LIVE AT ARTSCAPE',
    date: '31 Oct 2026',
    time: '19:00',
    venue: 'Artscape, Opera House, Cape Town',
    location: 'Cape Town',
    city: 'Cape Town',
    price: 250,
    priceDisplay: 'R250 - R400',
    category: 'music',
    image: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '31 Oct 2026 19:00',
    rawDate: '2026-10-31T19:00:00',
    featured: true,
    popular: true,
    description: 'A breathtaking fusion of indigenous African instruments, traditional choir harmonies, and the Cape Town Philharmonic Orchestra in the majestic Artscape Opera House.',
    tiers: [
      { id: 'uo-1', name: 'Balcony Tier B', price: 250, description: 'Upper tier reserved seating', available: 90 },
      { id: 'uo-2', name: 'Stalls Main', price: 400, description: 'Central acoustic sightlines', available: 140 }
    ]
  },

  // 4. Killarney Motor Show 2026
  {
    id: 'killarney-motor-show-2026',
    title: 'Killarney Motor Show 2026',
    date: '01 Nov 2026',
    time: '10:00',
    venue: 'Killarney International Raceway',
    location: 'Cape Town',
    city: 'Cape Town',
    price: 50,
    priceDisplay: 'R50 - R1500',
    category: 'festivals',
    image: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '01 Nov 2026 10:00',
    rawDate: '2026-11-01T10:00:00',
    featured: true,
    popular: true,
    description: 'The Western Capes biggest motoring expo! Over 2000 exhibits spanning supercars, vintage restorations, live drift arena shows, custom bike displays, and tractor pulls.',
    tiers: [
      { id: 'kms-1', name: 'Child (6-12 yrs)', price: 50, description: 'Under 6 enter free', available: 200 },
      { id: 'kms-2', name: 'Adult Day Pass', price: 120, description: 'General paddock & grandstand entry', available: 600 },
      { id: 'kms-3', name: 'VIP Pit Lane Suite', price: 1500, description: 'Buffet lunch, pit walk & hospitality', available: 30 }
    ]
  },

  // 5. Dancers Love Dogs
  {
    id: 'dancers-love-dogs-2026',
    title: 'Dancers Love Dogs',
    date: '03 Nov 2026',
    time: '19:30',
    venue: 'Artscape, Opera House, Cape Town',
    location: 'Cape Town',
    city: 'Cape Town',
    price: 450,
    priceDisplay: 'From R450',
    category: 'theatre',
    image: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '03 Nov 2026 19:30',
    rawDate: '2026-11-03T19:30:00',
    featured: false,
    popular: true,
    description: 'A heart-warming celebration of world-class ballet, contemporary, and tap companies joining forces to raise critical sterilization and rescue funds for companion animals.',
    tiers: [
      { id: 'dld-1', name: 'Reserved Seating', price: 450, description: 'All ticket proceeds benefit animal sterilization clinics', available: 250 }
    ]
  },

  // 6. Nataniël: SOOIBRAND
  {
    id: 'nataniel-sooibrand',
    title: 'Nataniël: SOOIBRAND',
    date: '04 Nov 2026',
    time: '19:00',
    venue: 'Artscape, Theatre, Cape Town',
    location: 'Cape Town',
    city: 'Cape Town',
    price: 280,
    priceDisplay: 'R280 - R360',
    category: 'theatre',
    image: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '04 Nov 2026 19:00',
    rawDate: '2026-11-04T19:00:00',
    featured: false,
    popular: true,
    description: 'South Africas singular icon of storytelling, couture, and musical cabaret presents SOOIBRAND. Accompanied by Charl du Plessis on Steinway piano and an extraordinary vocal ensemble.',
    tiers: [
      { id: 'nat-1', name: 'Balcony', price: 280, description: 'Balcony reserved seating', available: 60 },
      { id: 'nat-2', name: 'Stalls', price: 360, description: 'Central auditorium main floor', available: 95 }
    ]
  },

  // 7. Khayelitsha Maskhandi Festival
  {
    id: 'khayelitsha-maskhandi-festival',
    title: 'Khayelitsha Maskhandi Festival',
    date: '07 Nov 2026',
    time: '11:00',
    venue: 'Khayelitsha Rugby Stadium',
    location: 'Cape Town',
    city: 'Cape Town',
    price: 200,
    priceDisplay: 'R200 - R500',
    category: 'music',
    image: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '07 Nov 2026 11:00',
    rawDate: '2026-11-07T11:00:00',
    featured: true,
    popular: true,
    description: 'A vibrant outdoor gathering celebrating traditional Maskhandi acoustic mastery, energetic Zulu and Xhosa dance teams, and authentic cultural gastronomy in Khayelitsha.',
    tiers: [
      { id: 'kmf-1', name: 'General Field Entry', price: 200, description: 'Full day stadium admission', available: 350 },
      { id: 'kmf-2', name: 'VIP Tent Pass', price: 500, description: 'Shaded seating & hospitality lounge', available: 50 }
    ]
  },

  // 8. Villiera Fizzy Fest
  {
    id: 'villiera-fizzy-fest',
    title: 'Villiera Fizzy Fest',
    date: '14 Nov 2026',
    time: '12:00',
    venue: 'Villiera Wines, Stellenbosch',
    location: 'Stellenbosch',
    city: 'Stellenbosch',
    price: 280,
    priceDisplay: 'R280 - R350',
    category: 'food',
    image: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '14 Nov 2026 12:00',
    rawDate: '2026-11-14T12:00:00',
    featured: false,
    popular: true,
    description: 'Sip on award-winning Méthode Cap Classique sparklings, fresh Saldanha oysters, and artisanal tapas among ancient trees on the Villiera wine estate in Stellenbosch.',
    tiers: [
      { id: 'vff-1', name: 'Tasting Pass', price: 280, description: 'Includes glass + 10 bubbly tastings', available: 160 },
      { id: 'vff-2', name: 'Tasting + Oyster Combo', price: 350, description: 'Includes tasting pass plus 6 fresh oysters', available: 75 }
    ]
  },

  // 9. Urban Revival Conference 2026 - Cape Town
  {
    id: 'urban-revival-conference-2026',
    title: 'Urban Revival Conference 2026 - Cape Town',
    date: '15 Nov 2026',
    time: '14:00',
    venue: 'Good Hope Christian Centre Ottery',
    location: 'Cape Town',
    city: 'Cape Town',
    price: 249.50,
    priceDisplay: 'R249.50 - R1999',
    category: 'festivals',
    image: 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '15 Nov 2026 14:00',
    rawDate: '2026-11-15T14:00:00',
    featured: false,
    popular: false,
    description: 'A transformative 3-day spiritual empowerment gathering bringing international keynote speakers, inspiring choral worship, and leadership workshops.',
    tiers: [
      { id: 'urc-1', name: 'General Delegate Pass', price: 249.50, description: 'Full conference auditorium pass', available: 300 },
      { id: 'urc-2', name: 'Leadership VIP Pass', price: 1999, description: 'Includes executive dinner and front-row seating', available: 35 }
    ]
  },

  // 10. Karen Zoid in ZOID SPAWN (CPT)
  {
    id: 'karen-zoid-spawn-cpt',
    title: 'Karen Zoid in ZOID SPAWN (CPT)',
    date: '17 Nov 2026',
    time: '20:00',
    venue: 'Theatre On The Bay, Camps Bay',
    location: 'Cape Town',
    city: 'Cape Town',
    price: 180,
    priceDisplay: 'R180 - R325',
    category: 'music',
    image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '17 Nov 2026 20:00',
    rawDate: '2026-11-17T20:00:00',
    featured: true,
    popular: true,
    description: 'South Africas Queen of Rock brings her signature high-octane rock anthems and poetic acoustic ballads to the intimate Theatre On The Bay in Camps Bay.',
    tiers: [
      { id: 'kz-1', name: 'Rear Stalls', price: 180, description: 'Stalls row L-P', available: 45 },
      { id: 'kz-2', name: 'Prime Stalls', price: 325, description: 'Stalls row A-K closest to stage', available: 70 }
    ]
  },

  // 11. Roméo et Juliette
  {
    id: 'romeo-et-juliette-artscape',
    title: 'Roméo et Juliette',
    date: '18 Nov 2026',
    time: '19:00',
    venue: 'Artscape, Theatre, Cape Town',
    location: 'Cape Town',
    city: 'Cape Town',
    price: 180,
    priceDisplay: 'R180 - R720',
    category: 'theatre',
    image: 'https://images.unsplash.com/photo-1469488865564-c2de10f69f96?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1469488865564-c2de10f69f96?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '18 Nov 2026 19:00',
    rawDate: '2026-11-18T19:00:00',
    featured: true,
    popular: true,
    description: 'Cape Town City Ballet presents Sergei Prokofievs immortal tragic masterpiece, directed with passionate choreography and sumptuous Renaissance stage design with live orchestra.',
    tiers: [
      { id: 'rj-1', name: 'Balcony', price: 180, description: 'Upper tier reserved seating', available: 50 },
      { id: 'rj-2', name: 'Stalls Central', price: 420, description: 'Main floor seating', available: 80 },
      { id: 'rj-3', name: 'Royal Box VIP', price: 720, description: 'Premium box with interval refreshments', available: 16 }
    ]
  },

  // 12. From Hanover Street – A Concert Commemorating 60 Years
  {
    id: 'from-hanover-street-concert',
    title: 'From Hanover Street – A Concert Commemorating 60 Years',
    date: '24 Nov 2026',
    time: '20:00',
    venue: 'Artscape, Opera House, Cape Town',
    location: 'Cape Town',
    city: 'Cape Town',
    price: 200,
    priceDisplay: 'R200 - R350',
    category: 'music',
    image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '24 Nov 2026 20:00',
    rawDate: '2026-11-24T20:00:00',
    featured: true,
    popular: true,
    description: 'A landmark musical homage celebrating the enduring spirit, jazz legends, and cultural heartbeat of District Six, commemorating 60 years of memories, resilient jazz harmonies, and spoken word.',
    tiers: [
      { id: 'fhs-1', name: 'Upper Tier', price: 200, description: 'Auditorium upper tier', available: 85 },
      { id: 'fhs-2', name: 'Main Stalls', price: 350, description: 'Central acoustic floor', available: 110 }
    ]
  },

  // 13. HISTORY BOYS
  {
    id: 'history-boys-theatre-on-the-bay',
    title: 'HISTORY BOYS',
    date: '26 Nov 2026',
    time: '20:00',
    venue: 'Theatre On The Bay, Camps Bay',
    location: 'Cape Town',
    city: 'Cape Town',
    price: 250,
    priceDisplay: 'R250 - R375',
    category: 'theatre',
    image: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '26 Nov 2026 20:00',
    rawDate: '2026-11-26T20:00:00',
    featured: false,
    popular: true,
    description: 'Alan Bennetts Olivier and Tony Award-winning theatrical triumph about an eccentric teacher, his gifted class of grammar-school boys, and the pursuit of history, love, and Oxford admissions.',
    tiers: [
      { id: 'hb-1', name: 'Standard Seat', price: 250, description: 'Side stalls', available: 40 },
      { id: 'hb-2', name: 'Center Stalls', price: 375, description: 'Prime central view', available: 65 }
    ]
  },

  // 14. Rands Holidae - To.Gather Again
  {
    id: 'rands-holidae-togather-again',
    title: 'Rands Holidae - To.Gather Again',
    date: '27 Nov 2026',
    time: '12:00',
    venue: 'Nekkies Holiday Resort',
    location: 'Cape Town',
    city: 'Cape Town',
    price: 599.99,
    priceDisplay: 'From R599.99',
    category: 'festivals',
    image: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '27 Nov 2026 12:00',
    rawDate: '2026-11-27T12:00:00',
    featured: true,
    popular: true,
    description: 'The premier summer lifestyle weekend getaway on the banks of the Breede River. Top national Afro-tech and Amapiano artists, luxury poolside cabanas, braai banquet pits, and non-stop celebration.',
    tiers: [
      { id: 'rh-1', name: 'Weekend General Pass', price: 599.99, description: 'Friday and Saturday festival access', available: 200 }
    ]
  },

  // 15. Giselle
  {
    id: 'giselle-adam-small-theatre',
    title: 'Giselle',
    date: '27 Nov - 06 Dec 2026',
    time: '19:30',
    venue: 'The Adam Small Theatre, Stellenbosch',
    location: 'Stellenbosch',
    city: 'Stellenbosch',
    price: 200,
    priceDisplay: 'R200 - R320',
    category: 'theatre',
    image: 'https://images.unsplash.com/photo-1518834107812-67b0b7c58434?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1518834107812-67b0b7c58434?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '27 Nov - 06 Dec 2026',
    rawDate: '2026-11-27T19:30:00',
    featured: false,
    popular: true,
    description: 'The quintessence of romantic ballet. The poignant tale of innocent peasant girl Giselle, whose tragic heartbreak and ghostly devotion transcend death to forgive the prince who deceived her.',
    tiers: [
      { id: 'gis-1', name: 'Balcony', price: 200, description: 'Balcony seating', available: 50 },
      { id: 'gis-2', name: 'Main Stalls', price: 320, description: 'Prime central stalls', available: 85 }
    ]
  },

  // 16. Best Day Out Festival 2026
  {
    id: 'best-day-out-festival-2026',
    title: 'Best Day Out Festival 2026',
    date: '28 Nov 2026',
    time: '10:00',
    venue: "The Company's Garden, Cape Town",
    location: 'Cape Town',
    city: 'Cape Town',
    price: 120,
    priceDisplay: 'R120 - R400',
    category: 'festivals',
    image: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '28 Nov 2026 10:00',
    rawDate: '2026-11-28T10:00:00',
    featured: true,
    popular: true,
    description: 'A sun-drenched family picnic and cultural celebration in the heart of historic Cape Town. Featuring artisan makers markets, giant garden games, live folk and indie bands, craft gin gardens, and kids creative pavilions.',
    tiers: [
      { id: 'bdo-1', name: 'Kids Pass (4-12 yrs)', price: 120, description: 'Includes activity wristband', available: 120 },
      { id: 'bdo-2', name: 'Adult Day Pass', price: 220, description: 'General access to grounds and music stages', available: 250 },
      { id: 'bdo-3', name: 'Family Bundle (4 Pass)', price: 400, description: 'Entry for 2 Adults + 2 Kids', available: 60 }
    ]
  },

  // 17. Leon Bridges Presents: The Happiness Anytime Tour - Cape Town
  {
    id: 'leon-bridges-kirstenbosch-tour',
    title: 'Leon Bridges Presents: The Happiness Anytime Tour - Cape Town',
    date: '30 Nov 2026',
    time: '18:00',
    venue: 'Kirstenbosch Botanical Garden',
    location: 'Cape Town',
    city: 'Cape Town',
    price: 995,
    priceDisplay: 'From R995',
    category: 'music',
    image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '30 Nov 2026 18:00',
    rawDate: '2026-11-30T18:00:00',
    featured: true,
    popular: true,
    description: 'Grammy Award-winning Texas soul maestro Leon Bridges brings his smooth vintage R&B, modern soul poetry, and hypnotic live band to the breathtaking Kirstenbosch amphitheatre under Table Mountain.',
    tiers: [
      { id: 'lb-1', name: 'General Lawn Admission', price: 995, description: 'Lawn amphitheatre picnic access', available: 180 },
      { id: 'lb-2', name: 'Golden Circle', price: 1495, description: 'Front-stage dedicated viewing area', available: 45 }
    ]
  },

  // 18. Capitec Franschhoek Cap Classique and Champagne Festival
  {
    id: 'franschhoek-cap-classique-champagne',
    title: 'Capitec Franschhoek Cap Classique and Champagne Festival',
    date: '05 Dec 2026',
    time: '11:00',
    venue: 'Franschhoek Monument',
    location: 'Stellenbosch',
    city: 'Stellenbosch',
    price: 400,
    priceDisplay: 'R400 - R450',
    category: 'food',
    image: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '05 Dec 2026 11:00',
    rawDate: '2026-12-05T11:00:00',
    featured: true,
    popular: true,
    description: 'The social event of the Cape summer calendar. Dressed in signature blue and white, festival-goers sip the finest Cap Classiques and genuine French Champagnes alongside gourmet dishes curated by Franschhoeks top chefs.',
    tiers: [
      { id: 'fcc-1', name: 'Saturday Entry Pass', price: 400, description: 'Includes tasting glass + 10 coupons', available: 110 },
      { id: 'fcc-2', name: 'Sunday Entry Pass', price: 450, description: 'Includes tasting glass + 10 coupons', available: 90 }
    ]
  },

  // 19. +LIVE+ The Ultimate South African Arena Tour
  {
    id: 'live-sa-tour-2026',
    title: '+LIVE+ The Ultimate South African Arena Tour',
    date: '24 Oct 2026',
    time: '19:30',
    venue: 'GrandWest Grand Arena, Goodwood',
    location: 'Cape Town',
    city: 'Cape Town',
    price: 495,
    priceDisplay: 'From R495',
    category: 'music',
    image: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '24 Oct 2026 19:30',
    rawDate: '2026-10-24T19:30:00',
    featured: true,
    popular: true,
    description: 'Multi-platinum 90s alt-rock titans return for an electrifying nationwide arena run featuring anthems Lightning Crashes, I Alone, and All Over You.',
    tiers: [
      { id: 'live-1', name: 'General Seated (Upper)', price: 495, description: 'Upper tier sightlines', available: 120 },
      { id: 'live-2', name: 'Golden Circle (Standing)', price: 795, description: 'Direct stage front pit access', available: 45 }
    ]
  },

  // 20. Kirstenbosch Summer Sunset Concert: Goldfish & Friends
  {
    id: 'kirstenbosch-summer-sunset',
    title: 'Kirstenbosch Summer Sunset Concert: Goldfish & Friends',
    date: '01 Nov 2026',
    time: '16:00',
    venue: 'Kirstenbosch National Botanical Garden',
    location: 'Cape Town',
    city: 'Cape Town',
    price: 290,
    priceDisplay: 'From R290',
    category: 'music',
    image: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '01 Nov 2026 16:00',
    rawDate: '2026-11-01T16:00:00',
    featured: true,
    popular: true,
    description: 'Cape Towns beloved Sunday summer ritual on the lush lawns of Kirstenbosch with live electronic live beats by Goldfish.',
    tiers: [
      { id: 'kb-1', name: 'Adult Lawn Entry', price: 290, description: 'Main amphitheatre lawn', available: 200 }
    ]
  },

  // 21. Mommy & Me Expo 2026
  {
    id: 'mommy-and-me-expo-2026',
    title: 'Mommy & Me Expo 2026',
    date: '03 Oct 2026',
    time: '09:00',
    venue: "D'Aria Wine Estate, Durbanville",
    location: 'Cape Town',
    city: 'Cape Town',
    price: 100,
    priceDisplay: 'From R100',
    category: 'festivals',
    image: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '03 Oct 2026 09:00',
    rawDate: '2026-10-03T09:00:00',
    featured: false,
    popular: true,
    description: 'The premier pregnancy, parenting and family lifestyle celebration in Durbanvilles wine valley.',
    tiers: [
      { id: 'mme-1', name: 'Standard Day Pass', price: 100, description: 'Access to exhibition floor', available: 300 }
    ]
  },

  // 22. Franschhoek Classic Car Festival 2026
  {
    id: 'franschhoek-car-festival-2026',
    title: 'Franschhoek Classic Car Festival 2026',
    date: '17 Oct 2026',
    time: '10:00',
    venue: 'Franschhoek Motor Museum Estate',
    location: 'Stellenbosch',
    city: 'Stellenbosch',
    price: 180,
    priceDisplay: 'From R180',
    category: 'festivals',
    image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '17 Oct 2026 10:00',
    rawDate: '2026-10-17T10:00:00',
    featured: true,
    popular: true,
    description: 'Over 150 vintage, motorsport, and supercar legends showcased among the vines of Franschhoek.',
    tiers: [
      { id: 'fccf-1', name: 'General Admission', price: 180, description: 'Museum + show grounds access', available: 200 }
    ]
  },

  // 23. Castle Lager Rugby Championship: Springboks vs New Zealand
  {
    id: 'springboks-vs-all-blacks',
    title: 'Castle Lager Rugby Championship: Springboks vs New Zealand',
    date: '14 Nov 2026',
    time: '17:00',
    venue: 'FNB Stadium, Nasrec',
    location: 'Johannesburg',
    city: 'Johannesburg',
    price: 350,
    priceDisplay: 'From R350',
    category: 'sports',
    image: 'https://images.unsplash.com/photo-1544698310-74ea9d1c8258?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1544698310-74ea9d1c8258?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '14 Nov 2026 17:00',
    rawDate: '2026-11-14T17:00:00',
    featured: true,
    popular: true,
    description: 'The greatest rivalry in international sport under the highveld lights at FNB Stadium.',
    tiers: [
      { id: 'rug-1', name: 'Upper Stand Bronze', price: 350, description: 'Upper tier reserved seating', available: 150 },
      { id: 'rug-2', name: 'Mid Tier Silver', price: 750, description: 'Mid-height sideline seats', available: 80 }
    ]
  },

  // 24. The Phantom of the Opera: West End Musical Spectacular
  {
    id: 'phantom-of-the-opera-artscape',
    title: 'The Phantom of the Opera: West End Musical Spectacular',
    date: '20 Oct 2026',
    time: '20:00',
    venue: 'Artscape Opera House, Foreshore',
    location: 'Cape Town',
    city: 'Cape Town',
    price: 250,
    priceDisplay: 'From R250',
    category: 'theatre',
    image: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '20 Oct 2026 20:00',
    rawDate: '2026-10-20T20:00:00',
    featured: true,
    popular: false,
    description: 'Andrew Lloyd Webbers romantic masterpiece returns with dazzling sets and costumes at Artscape.',
    tiers: [
      { id: 'pot-1', name: 'Balcony Tier B', price: 250, description: 'Second tier central seating', available: 60 },
      { id: 'pot-2', name: 'Stalls Rows G-P', price: 480, description: 'Main floor stalls', available: 90 }
    ]
  },

  // 25. Stellenbosch Wine Harvest & Gourmet Feast
  {
    id: 'stellenbosch-wine-harvest-feast',
    title: 'Stellenbosch Wine Harvest & Gourmet Feast',
    date: '07 Nov 2026',
    time: '12:00',
    venue: 'Spier Wine Farm, Baden Powell Dr',
    location: 'Stellenbosch',
    city: 'Stellenbosch',
    price: 320,
    priceDisplay: 'From R320',
    category: 'food',
    image: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '07 Nov 2026 12:00',
    rawDate: '2026-11-07T12:00:00',
    featured: false,
    popular: true,
    description: 'Taste over 80 award-winning Cabernets, Chenins, and sparklings poured by top Cape winemakers.',
    tiers: [
      { id: 'swh-1', name: 'Tasting Pass + Riedel Glass', price: 320, description: 'Branded crystal glass & 20 tokens', available: 160 }
    ]
  },

  // 26. Sanlam Cape Town Marathon & 10km Peace Run
  {
    id: 'san-lam-cape-town-marathon-2026',
    title: 'Sanlam Cape Town Marathon & 10km Peace Run',
    date: '18 Oct 2026',
    time: '06:15',
    venue: 'Green Point A-Track & Atlantic Seaboard',
    location: 'Cape Town',
    city: 'Cape Town',
    price: 390,
    priceDisplay: 'From R390',
    category: 'sports',
    image: 'https://images.unsplash.com/photo-1530549387789-4c1017266635?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1530549387789-4c1017266635?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '18 Oct 2026 06:15',
    rawDate: '2026-10-18T06:15:00',
    featured: true,
    popular: true,
    description: 'Africas only Abbott World Marathon Majors candidate race along the scenic Atlantic coastline.',
    tiers: [
      { id: 'ctm-1', name: '10km Peace Run Entry', price: 390, description: 'Timing chip and finisher medal', available: 300 },
      { id: 'ctm-2', name: '42.2km Marathon Entry', price: 650, description: 'Official technical tee included', available: 100 }
    ]
  },

  // 27. Durban Street Food & Music Carnival
  {
    id: 'durban-street-food-festival',
    title: 'Durban Street Food & Music Carnival',
    date: '28 Nov 2026',
    time: '11:00',
    venue: 'Suncoast Sun Park, Promenade',
    location: 'Durban',
    city: 'Durban',
    price: 90,
    priceDisplay: 'From R90',
    category: 'food',
    image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '28 Nov 2026 11:00',
    rawDate: '2026-11-28T11:00:00',
    featured: false,
    popular: false,
    description: 'A sensory celebration of authentic Durban curries, bunny chows, craft brews, and live Afro-house beats.',
    tiers: [
      { id: 'dsf-1', name: 'General Admission', price: 90, description: 'Entry to market and concert lawn', available: 400 }
    ]
  },

  // 28. Guided Full Moon Hike & Stargazing Experience
  {
    id: 'lions-head-moonlight-hike',
    title: 'Guided Full Moon Hike & Stargazing Experience',
    date: '23 Oct 2026',
    time: '17:45',
    venue: "Lion's Head Trailhead, Signal Hill Rd",
    location: 'Cape Town',
    city: 'Cape Town',
    price: 150,
    priceDisplay: 'From R150',
    category: 'lifestyle',
    image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '23 Oct 2026 17:45',
    rawDate: '2026-10-23T17:45:00',
    featured: false,
    popular: true,
    description: 'Ascend Cape Towns most famous peak accompanied by certified mountain guides and astronomy enthusiasts.',
    tiers: [
      { id: 'fmh-1', name: 'Guided Hiker Pass', price: 150, description: 'Certified guide leadership and hot chocolate', available: 50 }
    ]
  },

  // 29. Rocking the Daisies Festival 2026
  {
    id: 'rocking-the-daisies-2026',
    title: 'Rocking the Daisies Festival 2026',
    date: '02 Oct 2026',
    time: '12:00',
    venue: 'Cloof Wine Estate, Darling',
    location: 'Cape Town',
    city: 'Cape Town',
    price: 895,
    priceDisplay: 'From R895',
    category: 'music',
    image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '02 Oct 2026 12:00',
    rawDate: '2026-10-02T12:00:00',
    featured: true,
    popular: true,
    description: 'South Africas biggest eco-friendly music, arts, and lifestyle festival celebrating multi-genre stages.',
    tiers: [
      { id: 'rtd-1', name: 'Weekend General Pass', price: 895, description: 'Full festival and camping access', available: 150 }
    ]
  },

  // 30. Cape Town Cycle Tour 2027
  {
    id: 'cape-town-cycle-tour-2027',
    title: 'Cape Town Cycle Tour 2027',
    date: '14 Mar 2027',
    time: '06:00',
    venue: 'Grand Parade & Cape Peninsula',
    location: 'Cape Town',
    city: 'Cape Town',
    price: 490,
    priceDisplay: 'From R490',
    category: 'sports',
    image: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=1200&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=1200&q=80',
    dateDisplay: '14 Mar 2027 06:00',
    rawDate: '2027-03-14T06:00:00',
    featured: true,
    popular: true,
    description: 'The worlds largest timed cycle race covering 109km of breathtaking peninsula scenery.',
    tiers: [
      { id: 'ctct-1', name: 'General Entry (CSA Licensed)', price: 490, description: 'Includes official timing chip & medal', available: 500 }
    ]
  }
];

export default EVENTS;



# EventPass - Educational Ticketing Web Application

An educational event-ticketing web application inspired by the publicly visible UI, layout, and user experience of [Webtickets South Africa](https://www.webtickets.co.za/v2/).

Built with **React**, **Vite**, **Tailwind CSS**, **React Router v6**, and **Lucide React**.

---

## 🎨 Visual Design & Architectural Decisions

Following our thorough inspection of WebTickets SA:

1. **Color Palette & Visual Identity**:
   - **Primary Green Accent**: `#7fbd52` (signature WebTickets green) with hover state `#6fa844` and deep forest `#598c34`.
   - **Slate / Dark Blue Typography**: `#1a2b49` and `#0f172a` for high-contrast, executive headings.
   - **Neutral Canvas**: `#f8fafc` subtle gray-slate background with clean `#ffffff` cards and subtle borders (`#e2e8f0` / `#dfdfdf`).
   - **Typography**: Google Font **Maven Pro** with **Inter** fallback, matching the exact font stack found in the reference site stylesheet.
   - **Pill Buttons**: Classic WebTickets rounded pill CTA buttons (`border-radius: 9999px` / `22px`), uppercase text with `0.06em` letter spacing.

2. **Topographic Hero & Carousel**:
   - Vector contour SVG overlay (`.bg-topographic`) mimicking the South African outdoor contour aesthetic.
   - Cinematic hero carousel with auto-rotation, slide indicators, and fast-booking CTA.
   - Integrated quick-search dock with Location (City), Category, and Date filters.

3. **Event Presentation & Category Navigation**:
   - Popular Category Tiles (`.category-tile`) featuring dark gradient vignettes, centered bold white titles, and hover zoom effect with "See All Categories" expander.
   - Event Cards (`EventCard.jsx`) with 16:10 aspect ratio image, date badge ("From 24 Oct 2026 19:30"), venue pin, price presentation ("From R495"), and interactive heart "Like" button.

4. **Retail Partner Integration (Pick n Pay)**:
   - WebTickets' signature retail integration is faithfully reflected: Pick n Pay header badge, in-store payment collection instructions, and supermarket checkout options.

5. **Multi-Column Dark Footer**:
   - 4-column layout matching reference:
     1. *Sell Tickets With Us* (with green CTA)
     2. *Find Events & Partner Countries* (Namibia, Botswana, Zambia, Malawi)
     3. *Help & Info* (FAQs, terms, privacy, promoter portal)
     4. *My Account* (Tickets, orders, passes)
   - Social icons, 256-bit SSL security badge, and retail payment logos (Visa, Mastercard, Ozow Instant EFT, SnapScan, Pick n Pay).

---

## 🚀 Routes Implemented

- `/` - **Home Page**: Hero carousel, search dock, popular categories, featured events tabs, retail partner banner, newsletter sign up.
- `/events` - **Browse Events**: Multi-faceted filter sidebar (categories, cities, price slider, search keyword, favorites/likes filter, sorting).
- `/events/:id` - **Event Details**: High-res cover image, date/venue card, interactive ticket tier selector (`+` / `-`), subtotal calculations, organizer verified badge, event description, and entry rules.
- `/cart` - **Shopping Cart**: 10-minute ticket hold reservation timer, item quantity management, service fee, promo code discount (`LIVE10`), and Pick n Pay retail notice.
- `/checkout` - **Checkout Flow**: 3-step checkout (Buyer Information -> Delivery Choice: Digital QR vs PnP Store Print -> Payment: Card, Ozow EFT, SnapScan, Pay in-store at PnP) with order confirmation.
- `/login` - **Sign In**: User authentication screen with email/mobile and Pick n Pay Smart Shopper reminder.
- `/register` - **Register**: Account creation with South African city picker and loyalty number input.
- `/my-tickets` - **My Tickets**: User tickets dashboard displaying active event passes, booking reference codes (`WT-`), and interactive scannable QR code modal with printable PDF action.

---

## 🛠️ Project Structure

```
src/
├── assets/                  # Static assets & graphics
├── components/
│   ├── CategoryGrid.jsx     # Popular category tiles with expand toggle
│   ├── EventCard.jsx        # Standardized event card with like heart
│   ├── EventTabs.jsx        # Category navigation filter tabs
│   ├── FeaturedEvents.jsx   # Featured showcase with responsive grid
│   ├── Footer.jsx           # Dark 4-column footer with payment badges
│   ├── Header.jsx           # Top promo bar, logo, cart, search & drawer
│   ├── Hero.jsx             # Topographic background, carousel & filter dock
│   ├── Newsletter.jsx       # Email newsletter subscription section
│   ├── RetailPartnerBanner.jsx # Pick n Pay in-store payment banner
│   └── SearchBar.jsx        # Pill-shaped search bar with live dropdown
├── context/
│   ├── CartContext.jsx      # Ticket cart, reservation timer & order history
│   └── LikesContext.jsx     # Favourites & like badge counter state
├── data/
│   └── mockEvents.js        # South African events, categories & cities
├── layouts/
│   └── RootLayout.jsx       # Persistent header, footer & scroll restoration
├── pages/
│   ├── HomePage.jsx
│   ├── EventsPage.jsx
│   ├── EventDetailsPage.jsx
│   ├── CartPage.jsx
│   ├── CheckoutPage.jsx
│   ├── LoginPage.jsx
│   ├── RegisterPage.jsx
│   └── MyTicketsPage.jsx
├── App.jsx                  # React Router configuration
├── index.css                # Tailwind directives & custom topographic rules
└── main.jsx                 # Application root entry
```

---

## 💻 Running the Application

### Development Server:
```bash
npm run dev
```
The application will be live at `http://localhost:5173/` or `http://127.0.0.1:5173/`.

### Production Build:
```bash
npm run build
npm run preview
```

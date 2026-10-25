import { strict as assert } from 'assert';

const BASE_URL = 'http://localhost:5000/api';

const results = [];

function recordTest(name, passed, detail = '') {
  results.push({ name, passed, detail });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [${passed ? 'PASS' : 'FAIL'}] ${name} ${detail ? `(${detail})` : ''}`);
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  let json = null;
  try {
    json = await res.json();
  } catch (err) {
    // raw text response if not JSON
  }

  return { status: res.status, headers: res.headers, data: json };
}

async function runTests() {
  console.log('🧪 Starting Event Catalog & Inventory API Test Suite...\n');

  let sampleEventId = null;
  let sampleEventSlug = null;

  // 1. GET /api/events
  try {
    const res = await request('/events');
    assert.equal(res.status, 200);
    assert.equal(res.data.status, 'success');
    assert.ok(Array.isArray(res.data.data.items), 'items must be an array');
    assert.ok(res.data.data.items.length > 0, 'items should not be empty');
    assert.equal(res.data.data.page, 1);
    assert.equal(res.data.data.limit, 12);
    assert.ok(res.data.data.total >= 30, 'total published events should be at least 30');
    assert.ok(res.data.data.totalPages >= 3, 'totalPages should be at least 3');

    sampleEventId = res.data.data.items[0].id;
    sampleEventSlug = res.data.data.items[0].slug;

    recordTest('1. GET /api/events returns paginated public catalog', true, `total: ${res.data.data.total}`);
  } catch (err) {
    recordTest('1. GET /api/events returns paginated public catalog', false, err.message);
  }

  // 2. Pagination (page=2, limit=6)
  try {
    const res = await request('/events?page=2&limit=6');
    assert.equal(res.status, 200);
    assert.equal(res.data.data.page, 2);
    assert.equal(res.data.data.limit, 6);
    assert.equal(res.data.data.items.length, 6);
    assert.equal(res.data.data.totalPages, Math.ceil(res.data.data.total / 6));

    recordTest('2. Pagination supports page and limit parameters', true, `returned ${res.data.data.items.length} items`);
  } catch (err) {
    recordTest('2. Pagination supports page and limit parameters', false, err.message);
  }

  // 3. Maximum page size enforcement (reject > 50)
  try {
    const res = await request('/events?limit=51');
    assert.equal(res.status, 400);
    assert.equal(res.data.status, 'error');
    assert.equal(res.data.code, 'VALIDATION_ERROR');

    recordTest('3. Maximum page size limit (>50) is strictly rejected with 400', true, res.data.message);
  } catch (err) {
    recordTest('3. Maximum page size limit (>50) is strictly rejected with 400', false, err.message);
  }

  // 4. Search filtering
  try {
    const res = await request('/events?search=orchestral');
    assert.equal(res.status, 200);
    assert.ok(res.data.data.items.length > 0, 'should find matches for "orchestral"');
    const matched = res.data.data.items.some(
      (e) => e.title.toLowerCase().includes('orchestral') || e.venue.toLowerCase().includes('artscape') || (e.description && e.description.toLowerCase().includes('orchestral'))
    );
    assert.ok(matched, 'match must contain search term in title, venue, or description');

    recordTest('4. Search query accurately filters title/venue/description', true, `found ${res.data.data.items.length} matches`);
  } catch (err) {
    recordTest('4. Search query accurately filters title/venue/description', false, err.message);
  }

  // 5. Category filtering
  try {
    const res = await request('/events?category=music');
    assert.equal(res.status, 200);
    assert.ok(res.data.data.items.length > 0);
    const allMusic = res.data.data.items.every((e) => e.category === 'music');
    assert.ok(allMusic, 'all returned events must have category "music"');

    recordTest('5. Category filtering scopes catalog to specific category', true, `all ${res.data.data.items.length} items match music`);
  } catch (err) {
    recordTest('5. Category filtering scopes catalog to specific category', false, err.message);
  }

  // 6. Date filtering (when=anytime vs when=upcoming)
  try {
    const res = await request('/events?when=upcoming');
    assert.equal(res.status, 200);
    assert.equal(res.data.status, 'success');

    recordTest('6. Date filtering (when=upcoming/anytime) executes successfully', true, `returned ${res.data.data.items.length} items`);
  } catch (err) {
    recordTest('6. Date filtering (when=upcoming/anytime) executes successfully', false, err.message);
  }

  // 7. Event details by UUID
  try {
    const res = await request(`/events/${sampleEventId}`);
    assert.equal(res.status, 200);
    assert.equal(res.data.status, 'success');
    const ev = res.data.data.event;
    assert.equal(ev.id, sampleEventId);
    assert.ok(ev.title, 'event must have title');
    assert.ok(ev.venue, 'event must have venue');
    assert.ok(ev.dateDisplay, 'event must have formatted dateDisplay');
    assert.ok(Array.isArray(ev.ticketTypes), 'event must have ticketTypes');

    recordTest('7. GET /api/events/:id returns full event details and ticket types', true, ev.title);
  } catch (err) {
    recordTest('7. GET /api/events/:id returns full event details and ticket types', false, err.message);
  }

  // 8. Event slug lookup (GET /api/events/slug/:slug and GET /api/events/:slug)
  try {
    const res1 = await request(`/events/slug/${sampleEventSlug}`);
    assert.equal(res1.status, 200);
    assert.equal(res1.data.data.event.slug, sampleEventSlug);

    const res2 = await request(`/events/${sampleEventSlug}`);
    assert.equal(res2.status, 200);
    assert.equal(res2.data.data.event.slug, sampleEventSlug);

    recordTest('8. Event slug lookup works via /api/events/slug/:slug and /api/events/:slug', true, sampleEventSlug);
  } catch (err) {
    recordTest('8. Event slug lookup works via /api/events/slug/:slug and /api/events/:slug', false, err.message);
  }

  // 9. Unpublished/Draft event is NOT publicly visible
  try {
    const resCatalog = await request('/events?search=Private%20Orchestra');
    assert.equal(resCatalog.status, 200);
    assert.equal(resCatalog.data.data.items.length, 0, 'DRAFT event must not appear in public catalog');

    const resDraft = await request('/events/slug/draft-secret-orchestra');
    assert.equal(resDraft.status, 404, 'Direct access to DRAFT event slug must return 404');
    assert.equal(resDraft.data.code, 'EVENT_NOT_FOUND');

    recordTest('9. Unpublished/Draft event is strictly excluded from public API (404 on direct lookup)', true);
  } catch (err) {
    recordTest('9. Unpublished/Draft event is strictly excluded from public API (404 on direct lookup)', false, err.message);
  }

  // 10. Nonexistent event returns 404
  try {
    const res = await request('/events/nonexistent-event-slug-12345');
    assert.equal(res.status, 404);
    assert.equal(res.data.status, 'error');
    assert.equal(res.data.code, 'EVENT_NOT_FOUND');

    recordTest('10. Nonexistent event lookup returns clean 404 EVENT_NOT_FOUND', true, res.data.message);
  } catch (err) {
    recordTest('10. Nonexistent event lookup returns clean 404 EVENT_NOT_FOUND', false, err.message);
  }

  // 11. Nonexistent category handling
  try {
    const res = await request('/events?category=nonexistent-category-slug');
    assert.equal(res.status, 200);
    assert.equal(res.data.status, 'success');
    assert.equal(res.data.data.items.length, 0);
    assert.equal(res.data.data.total, 0);

    recordTest('11. Nonexistent category returns empty items list with 200 status', true);
  } catch (err) {
    recordTest('11. Nonexistent category returns empty items list with 200 status', false, err.message);
  }

  // 12. GET /api/events/:id/ticket-types
  try {
    const res = await request(`/events/${sampleEventSlug}/ticket-types`);
    assert.equal(res.status, 200);
    assert.equal(res.data.status, 'success');
    assert.ok(Array.isArray(res.data.data.ticketTypes));
    assert.ok(res.data.data.ticketTypes.length > 0);

    const firstTier = res.data.data.ticketTypes[0];
    assert.ok(typeof firstTier.priceMinor === 'number', 'priceMinor must be integer');
    assert.ok(typeof firstTier.quantityTotal === 'number', 'quantityTotal must be integer');
    assert.ok(typeof firstTier.quantityAvailable === 'number', 'quantityAvailable must be integer');
    assert.equal(firstTier.currency, 'ZAR');

    recordTest('12. GET /api/events/:id/ticket-types returns active ticket tiers', true, `tiers: ${res.data.data.ticketTypes.length}`);
  } catch (err) {
    recordTest('12. GET /api/events/:id/ticket-types returns active ticket tiers', false, err.message);
  }

  // 13. Authoritative Inventory Calculation: available = quantityTotal - quantitySold - quantityReserved
  try {
    const res = await request(`/events/${sampleEventSlug}/ticket-types`);
    const tier = res.data.data.ticketTypes[0];
    const expectedAvailable = Math.max(0, tier.quantityTotal - tier.quantitySold - tier.quantityReserved);
    assert.equal(tier.quantityAvailable, expectedAvailable, 'Server must compute available = total - sold - reserved');
    assert.ok(tier.quantityAvailable >= 0, 'Available quantity must never be negative');

    recordTest('13. Server-side inventory calculation strictly authoritative & non-negative', true, 
      `Total: ${tier.quantityTotal}, Sold: ${tier.quantitySold}, Res: ${tier.quantityReserved} -> Avail: ${tier.quantityAvailable}`);
  } catch (err) {
    recordTest('13. Server-side inventory calculation strictly authoritative & non-negative', false, err.message);
  }

  // 14. Malformed query parameters rejected cleanly
  try {
    const resPage = await request('/events?page=invalid');
    assert.equal(resPage.status, 400);
    assert.equal(resPage.data.code, 'VALIDATION_ERROR');

    const resNeg = await request('/events?page=-5');
    assert.equal(resNeg.status, 400);
    assert.equal(resNeg.data.code, 'VALIDATION_ERROR');

    recordTest('14. Malformed page parameters (page=invalid, page=-5) rejected with 400 VALIDATION_ERROR', true);
  } catch (err) {
    recordTest('14. Malformed page parameters (page=invalid, page=-5) rejected with 400 VALIDATION_ERROR', false, err.message);
  }

  // 15. Invalid / Disallowed Sort Field rejected cleanly (no arbitrary field injection)
  try {
    const res = await request('/events?sort=passwordHash');
    assert.equal(res.status, 400);
    assert.equal(res.data.code, 'VALIDATION_ERROR');

    recordTest('15. Disallowed sort fields (e.g. sort=passwordHash) rejected via explicit allowlist', true, res.data.message);
  } catch (err) {
    recordTest('15. Disallowed sort fields (e.g. sort=passwordHash) rejected via explicit allowlist', false, err.message);
  }

  // 16. SQL injection-style search strings handled safely
  try {
    const sqlInjectionPayload = "'; DROP TABLE events; --";
    const res = await request(`/events?search=${encodeURIComponent(sqlInjectionPayload)}`);
    assert.equal(res.status, 200, 'Parameterized queries must safely execute without database error');
    assert.equal(res.data.data.items.length, 0);

    recordTest('16. SQL injection strings handled safely by parameterized queries without leaking errors', true);
  } catch (err) {
    recordTest('16. SQL injection strings handled safely by parameterized queries without leaking errors', false, err.message);
  }

  // 17. Excessive pagination
  try {
    const res = await request('/events?page=9999');
    assert.equal(res.status, 200);
    assert.equal(res.data.data.items.length, 0);
    assert.equal(res.data.data.page, 9999);
    assert.ok(res.data.data.totalPages > 0);

    recordTest('17. Excessive pagination (page=9999) handled gracefully with empty list', true);
  } catch (err) {
    recordTest('17. Excessive pagination (page=9999) handled gracefully with empty list', false, err.message);
  }

  // 18. Sensitive database fields are NOT returned
  try {
    const res = await request(`/events/${sampleEventId}`);
    const event = res.data.data.event;

    assert.equal(event.passwordHash, undefined);
    assert.equal(event.password, undefined);
    assert.equal(event.tokens, undefined);
    assert.equal(event.session, undefined);
    assert.equal(event.adminMetadata, undefined);

    recordTest('18. Sensitive database fields (passwordHash, sessions, tokens) strictly omitted from API DTO', true);
  } catch (err) {
    recordTest('18. Sensitive database fields (passwordHash, sessions, tokens) strictly omitted from API DTO', false, err.message);
  }

  // 19. Categories listing endpoint
  try {
    const res = await request('/categories');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.data.categories));
    assert.ok(res.data.data.categories.length >= 6);
    assert.ok(typeof res.data.data.categories[0].eventCount === 'number');

    recordTest('19. GET /api/categories returns category tree with live event counts', true, `categories: ${res.data.data.categories.length}`);
  } catch (err) {
    recordTest('19. GET /api/categories returns category tree with live event counts', false, err.message);
  }

  // 20. Category-scoped events endpoint
  try {
    const res = await request('/categories/music/events');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.data.items));
    assert.ok(res.data.data.items.every((e) => e.category === 'music'));

    recordTest('20. GET /api/categories/:slug/events returns category-scoped events', true, `items: ${res.data.data.items.length}`);
  } catch (err) {
    recordTest('20. GET /api/categories/:slug/events returns category-scoped events', false, err.message);
  }

  console.log('\n==================================================');
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`📊 Test Results: ${passedCount} / ${results.length} PASSED`);
  console.log('==================================================\n');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

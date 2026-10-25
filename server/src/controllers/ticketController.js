import * as ticketService from '../services/ticketService.js';
import { validateTicketSchema, checkInTicketSchema } from '../validators/ticketValidators.js';
import { getUserById } from '../services/authService.js';

/**
 * GET /api/tickets/my-tickets
 * Customer ticket listing with strict ownership filtering (BOLA Defense)
 */
export const listMyTickets = async (req, res, next) => {
  try {
    const tickets = await ticketService.getMyTickets(req.user.id);
    res.json({
      success: true,
      count: tickets.length,
      data: tickets
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/tickets/:id
 * Retrieve single ticket details by UUID (BOLA Protected)
 */
export const getById = async (req, res, next) => {
  try {
    const ticket = await ticketService.getTicketById(req.params.id, req.user.id, req.user.role);
    res.json({
      success: true,
      data: ticket
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/tickets/ref/:reference
 * Retrieve single ticket details by public reference code (BOLA Protected)
 */
export const getByReference = async (req, res, next) => {
  try {
    const ticket = await ticketService.getTicketByReference(req.params.reference, req.user.id, req.user.role);
    res.json({
      success: true,
      data: ticket
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Authenticate gate scanner or staff operator
 * Requires either:
 *  A) An active session with role 'ADMIN'
 *  B) A valid pre-shared scanner API key via 'x-scanner-key' header (or Authorization: Bearer <key>)
 * Customers are strictly rejected with 403 FORBIDDEN.
 * Unauthenticated requests without a valid scanner key are strictly rejected with 401 UNAUTHENTICATED.
 */
export const authenticateGateOperator = async (req) => {
  // 1. Session-based authentication (Staff / Admin user)
  if (req.session?.userId) {
    const user = await getUserById(req.session.userId);
    if (user) {
      if (user.role === 'CUSTOMER') {
        return {
          authorized: false,
          code: 'FORBIDDEN',
          status: 403,
          message: 'Customers are not authorized to perform gate check-in operations.'
        };
      }
      return {
        authorized: true,
        operatorId: user.id,
        role: user.role
      };
    }
  }

  // 2. Hardware / Gate Turnstile API Key authentication
  const expectedScannerKey = process.env.SCANNER_API_KEY || 'eventpass-gate-scanner-2026-key';
  const providedScannerKey =
    req.headers['x-scanner-key'] ||
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

  if (providedScannerKey) {
    if (providedScannerKey === expectedScannerKey) {
      const terminalId = req.headers['x-terminal-id'] || 'GATE_TERMINAL';
      return {
        authorized: true,
        operatorId: terminalId,
        role: 'SCANNER'
      };
    }
    return {
      authorized: false,
      code: 'UNAUTHENTICATED',
      status: 401,
      message: 'Invalid scanner credential.'
    };
  }

  // 3. Neither staff session nor valid scanner key provided
  return {
    authorized: false,
    code: 'UNAUTHENTICATED',
    status: 401,
    message: 'Authentication required: gate check-in requires a valid scanner credential or staff authorization.'
  };
};

/**
 * POST /api/tickets/validate
 * Read-only gate lookup / scanner preview
 */
export const validate = async (req, res, next) => {
  try {
    const validatedData = validateTicketSchema.parse(req.body);
    const authResult = await authenticateGateOperator(req).catch(() => ({ authorized: false }));
    const result = await ticketService.validateTicket({
      ...validatedData,
      isStaffOrScanner: authResult.authorized
    });
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/tickets/check-in
 * Atomic turnstile entry action (VALID -> CHECKED_IN)
 * Enforces staff/admin or scanner authorization:
 * - Customers are strictly forbidden (403)
 * - Unauthenticated requests without a valid scanner key are strictly forbidden (401)
 * - Hardware turnstiles must supply valid x-scanner-key
 * - Staff must have an authenticated ADMIN session
 */
export const checkIn = async (req, res, next) => {
  try {
    // Authenticate operator (staff or hardware scanner)
    const authResult = await authenticateGateOperator(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({
        status: 'error',
        code: authResult.code,
        message: authResult.message
      });
    }

    const validatedData = checkInTicketSchema.parse(req.body);
    const staffId = authResult.operatorId || validatedData.staffId || 'GATE_STAFF';
    const result = await ticketService.checkInTicket({
      ...validatedData,
      staffId
    });
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
};



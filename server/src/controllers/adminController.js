import * as adminService from '../services/adminService.js';
import {
  adminListEventsQuerySchema,
  adminCreateEventSchema,
  adminUpdateEventSchema,
  adminUpdateEventStatusSchema,
  adminCreateTicketTypeSchema,
  adminUpdateTicketTypeSchema,
  adminListUsersQuerySchema,
  adminUpdateUserRoleSchema
} from '../validators/adminValidators.js';

/**
 * GET /api/admin/events
 */
export const listEvents = async (req, res, next) => {
  try {
    const query = adminListEventsQuerySchema.parse(req.query);
    const result = await adminService.listAdminEvents(query);
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/events/:id
 */
export const getEvent = async (req, res, next) => {
  try {
    const event = await adminService.getAdminEventById(req.params.id);
    res.json({
      success: true,
      data: { event }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/admin/events
 */
export const createEvent = async (req, res, next) => {
  try {
    const validatedData = adminCreateEventSchema.parse(req.body);
    const event = await adminService.createAdminEvent({
      adminUserId: req.user.id,
      data: validatedData
    });
    res.status(201).json({
      success: true,
      message: 'Event created successfully.',
      data: { event }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/admin/events/upload-poster
 */
export const uploadPoster = async (req, res, next) => {
  try {
    const uploadResult = await adminService.uploadEventPoster({
      adminUserId: req.user.id,
      file: req.file
    });

    res.status(201).json({
      success: true,
      message: 'Poster image uploaded successfully.',
      data: uploadResult
    });
  } catch (err) {
    next(err);
  }
};


/**
 * PUT /api/admin/events/:id
 */
export const updateEvent = async (req, res, next) => {
  try {
    const validatedData = adminUpdateEventSchema.parse(req.body);
    const event = await adminService.updateAdminEvent({
      adminUserId: req.user.id,
      eventId: req.params.id,
      data: validatedData
    });
    res.json({
      success: true,
      message: 'Event updated successfully.',
      data: { event }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/admin/events/:id/status
 */
export const updateEventStatus = async (req, res, next) => {
  try {
    const { status } = adminUpdateEventStatusSchema.parse(req.body);
    const event = await adminService.updateAdminEventStatus({
      adminUserId: req.user.id,
      eventId: req.params.id,
      status
    });
    res.json({
      success: true,
      message: `Event status updated to ${status}.`,
      data: { event }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/admin/events/:id/ticket-types
 */
export const createTicketType = async (req, res, next) => {
  try {
    const validatedData = adminCreateTicketTypeSchema.parse(req.body);
    const ticketType = await adminService.createAdminTicketType({
      adminUserId: req.user.id,
      eventId: req.params.id,
      data: validatedData
    });
    res.status(201).json({
      success: true,
      message: 'Ticket tier created successfully.',
      data: { ticketType }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/admin/events/:id/ticket-types/:ticketTypeId
 */
export const updateTicketType = async (req, res, next) => {
  try {
    const validatedData = adminUpdateTicketTypeSchema.parse(req.body);
    const ticketType = await adminService.updateAdminTicketType({
      adminUserId: req.user.id,
      eventId: req.params.id,
      ticketTypeId: req.params.ticketTypeId,
      data: validatedData
    });
    res.json({
      success: true,
      message: 'Ticket tier updated successfully.',
      data: { ticketType }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/admin/events/:id/ticket-types/:ticketTypeId
 */
export const deleteTicketType = async (req, res, next) => {
  try {
    const result = await adminService.deleteAdminTicketType({
      adminUserId: req.user.id,
      eventId: req.params.id,
      ticketTypeId: req.params.ticketTypeId
    });
    res.json({
      success: true,
      message: result.message
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Promotional Code Management Endpoints
 */
import {
  adminListPromoCodesQuerySchema,
  adminCreatePromoCodeSchema,
  adminUpdatePromoCodeSchema
} from '../validators/promoCodeValidators.js';
import {
  listAdminPromoCodes,
  getAdminPromoCodeById,
  createAdminPromoCode,
  updateAdminPromoCode,
  deleteAdminPromoCode
} from '../services/promoCodeService.js';

export const listPromoCodes = async (req, res, next) => {
  try {
    const query = adminListPromoCodesQuerySchema.parse(req.query);
    const result = await listAdminPromoCodes(query);
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
};

export const getPromoCode = async (req, res, next) => {
  try {
    const promoCode = await getAdminPromoCodeById(req.params.id);
    res.json({
      success: true,
      data: { promoCode }
    });
  } catch (err) {
    next(err);
  }
};

export const createPromoCode = async (req, res, next) => {
  try {
    const validatedData = adminCreatePromoCodeSchema.parse(req.body);
    const promoCode = await createAdminPromoCode({
      adminUserId: req.user.id,
      data: validatedData
    });
    res.status(201).json({
      success: true,
      message: 'Promotional code created successfully.',
      data: { promoCode }
    });
  } catch (err) {
    next(err);
  }
};

export const updatePromoCode = async (req, res, next) => {
  try {
    const validatedData = adminUpdatePromoCodeSchema.parse(req.body);
    const promoCode = await updateAdminPromoCode({
      adminUserId: req.user.id,
      id: req.params.id,
      data: validatedData
    });
    res.json({
      success: true,
      message: 'Promotional code updated successfully.',
      data: { promoCode }
    });
  } catch (err) {
    next(err);
  }
};

export const togglePromoCodeStatus = async (req, res, next) => {
  try {
    const { isActive } = req.body;
    const promoCode = await updateAdminPromoCode({
      adminUserId: req.user.id,
      id: req.params.id,
      data: { isActive: Boolean(isActive) }
    });
    res.json({
      success: true,
      message: `Promotional code ${promoCode.isActive ? 'activated' : 'deactivated'} successfully.`,
      data: { promoCode }
    });
  } catch (err) {
    next(err);
  }
};

export const deletePromoCode = async (req, res, next) => {
  try {
    const result = await deleteAdminPromoCode({
      adminUserId: req.user.id,
      id: req.params.id
    });
    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/users
 * SUPER_ADMIN only
 */
export const listUsers = async (req, res, next) => {
  try {
    const query = adminListUsersQuerySchema.parse(req.query);
    const result = await adminService.listAdminUsers(query);
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/admin/users/:id/role
 * SUPER_ADMIN only
 */
export const updateUserRole = async (req, res, next) => {
  try {
    const { role } = adminUpdateUserRoleSchema.parse(req.body);
    const updatedUser = await adminService.updateAdminUserRole({
      adminUserId: req.user.id,
      targetUserId: req.params.id,
      newRole: role
    });
    res.json({
      success: true,
      message: `User role successfully updated to ${role}.`,
      data: { user: updatedUser }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/users/audit-logs
 * SUPER_ADMIN only
 */
export const getUserAuditLogs = async (req, res, next) => {
  try {
    const logs = await adminService.getAdminUserAuditLogs(30);
    res.json({
      success: true,
      data: { logs }
    });
  } catch (err) {
    next(err);
  }
};



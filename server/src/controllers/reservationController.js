import {
  createReservation,
  getUserReservations,
  getReservationById,
  cancelReservation
} from '../services/reservationService.js';
import { createReservationSchema, uuidParamSchema } from '../validators/reservationValidators.js';

/**
 * Controller: Create ticket reservation
 * POST /api/reservations
 */
export const create = async (req, res, next) => {
  try {
    const validatedData = createReservationSchema.parse(req.body);
    const result = await createReservation({
      userId: req.user.id,
      sessionId: req.sessionID || req.user.id,
      ticketTypeId: validatedData.ticketTypeId,
      quantity: validatedData.quantity
    });

    res.status(201).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: List active reservations for authenticated user
 * GET /api/reservations
 */
export const list = async (req, res, next) => {
  try {
    const data = await getUserReservations(req.user.id);
    res.status(200).json({
      status: 'success',
      data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: Get single reservation by ID
 * GET /api/reservations/:id
 */
export const getById = async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const reservation = await getReservationById(id, req.user.id);
    res.status(200).json({
      status: 'success',
      data: {
        reservation
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: Cancel active reservation and release inventory
 * DELETE /api/reservations/:id
 */
export const cancel = async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const reservation = await cancelReservation(id, req.user.id);
    res.status(200).json({
      status: 'success',
      message: 'Reservation successfully cancelled and inventory released.',
      data: {
        reservation
      }
    });
  } catch (error) {
    next(error);
  }
};

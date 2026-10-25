import { createOrder, getUserOrders, getOrderById } from '../services/orderService.js';
import { createOrderSchema, uuidParamSchema } from '../validators/orderValidators.js';

/**
 * Controller: Create order from active reservations
 * POST /api/orders
 */
export const create = async (req, res, next) => {
  try {
    const validatedData = createOrderSchema.parse(req.body);
    const order = await createOrder({
      userId: req.user.id,
      user: req.user,
      reservationIds: validatedData.reservationIds,
      buyerDetails: validatedData.buyerDetails,
      promoCode: validatedData.promoCode,
      idempotencyKey: validatedData.idempotencyKey
    });

    res.status(201).json({
      status: 'success',
      data: {
        order
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: List orders for authenticated user
 * GET /api/orders
 */
export const list = async (req, res, next) => {
  try {
    const orders = await getUserOrders(req.user.id);
    res.status(200).json({
      status: 'success',
      data: {
        orders
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: Get specific order by ID
 * GET /api/orders/:id
 */
export const getById = async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const order = await getOrderById(id, req.user.id);
    res.status(200).json({
      status: 'success',
      data: {
        order
      }
    });
  } catch (error) {
    next(error);
  }
};

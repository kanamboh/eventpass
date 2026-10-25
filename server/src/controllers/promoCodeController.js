import { validatePromoCodeSchema } from '../validators/promoCodeValidators.js';
import { validatePromoCodeAgainstCart } from '../services/promoCodeService.js';

/**
 * Controller: Validate promotional code against customer cart items
 * POST /api/promocodes/validate
 */
export const validate = async (req, res, next) => {
  try {
    const validatedData = validatePromoCodeSchema.parse(req.body);

    const result = await validatePromoCodeAgainstCart({
      code: validatedData.code,
      items: validatedData.items,
      userId: req.user?.id || null,
      customerEmail: validatedData.email || req.user?.email || null
    });

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

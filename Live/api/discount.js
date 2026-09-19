// التحقق من كود الخصم — المسار: /api/discount
// الأكواد في متغيّر البيئة DISCOUNT_CODES (راجع _discounts.js للشكل). الصفحة بتبعت الكود بس،
// والسيرفر بيرد بالنسبة لو الكود صح — من غير ما أي كود تاني يوصل للمتصفح

import { guardRequest } from './_cors.js';
import { parseDiscountCodes, checkDiscount } from './_discounts.js';

export default async function handler(req, res) {
  if (!guardRequest(req, res)) return;
  const code = req.body && typeof req.body.code === 'string' ? req.body.code : '';
  // تأخير بسيط بيصعّب تجربة أكواد كتير ورا بعض بسرعة
  await new Promise(function (r) { setTimeout(r, 400); });
  const today = new Date().toISOString().slice(0, 10);
  const result = checkDiscount(parseDiscountCodes(process.env.DISCOUNT_CODES), code, today);
  res.status(200).json(result.valid
    ? { valid: true, code: result.code, percent: result.percent }
    : { valid: false, expired: !!result.expired });
}

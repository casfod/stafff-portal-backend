import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { protect } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  refreshTokenSchema,
} from '../validators/auth.validator';

const router = Router();

router.post('/register',       validate(registerSchema),       authController.register);
router.post('/login',          validate(loginSchema),          authController.login);
router.post('/refresh-token',  validate(refreshTokenSchema),   authController.refreshToken);
router.post('/forgot-password',validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema),  authController.resetPassword);
router.get('/me',              protect,                        authController.getMe);

export default router;

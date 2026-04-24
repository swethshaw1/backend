import { Router } from 'express';
import { body, param } from 'express-validator';
import * as authController from '../controllers/auth.controller';
import * as locationController from '../controllers/location.controller';
import * as attendanceController from '../controllers/attendance.controller';
import * as userController from '../controllers/user.controller';
import { authenticate, authorize } from '../middleware/auth';
import { validateRequest } from '../middleware/validate';

const router = Router();

/**
 * Authentication Routes
 */
router.post('/auth/register',
  [body('email').isEmail(), body('password').isLength({ min: 6 }), body('name').notEmpty()],
  validateRequest,
  authController.register
);

router.post('/auth/login',
  [body('email').isEmail(), body('password').notEmpty()],
  validateRequest,
  authController.login
);

router.post('/auth/refresh', authController.refreshTokens);

router.post('/auth/logout', authenticate, authController.logout);

router.get('/auth/me', authenticate, authController.getMe);

/**
 * User and Administration Routes
 */
router.get('/users', authenticate, authorize('admin', 'supervisor'), userController.getUsers);

router.patch('/users/:id', authenticate, authorize('admin'),
  [param('id').isUUID()],
  validateRequest,
  userController.updateUser
);

router.post('/users/assign-supervisor', authenticate, authorize('admin'),
  [body('client_id').isUUID(), body('supervisor_id').isUUID()],
  validateRequest,
  userController.assignSupervisor
);

/**
 * Invitation Management Routes
 */
router.post('/invitations', authenticate, authorize('admin', 'supervisor'),
  [body('email').isEmail(), body('role').isIn(['supervisor', 'client'])],
  validateRequest,
  userController.sendInvitation
);

router.get('/invitations', authenticate, authorize('admin', 'supervisor'), userController.getInvitations);

router.get('/invitations/validate/:token', userController.validateInvitation);

/**
 * Geo-fence Location Routes
 */
router.post('/locations', authenticate, authorize('admin'),
  [
    body('name').notEmpty(),
    body('latitude').isFloat({ min: -90, max: 90 }),
    body('longitude').isFloat({ min: -180, max: 180 }),
    body('radius_meters').optional().isInt({ min: 10, max: 5000 }),
  ],
  validateRequest,
  locationController.createLocation
);

router.get('/locations', authenticate, locationController.getLocations);

router.patch('/locations/:id', authenticate, authorize('admin'),
  [param('id').isUUID()],
  validateRequest,
  locationController.updateLocation
);

router.delete('/locations/:id', authenticate, authorize('admin'),
  [param('id').isUUID()],
  validateRequest,
  locationController.deleteLocation
);

/**
 * Attendance Tracking Routes
 */
router.post('/attendance/mark', authenticate, authorize('client', 'supervisor'),
  [
    body('latitude').isFloat({ min: -90, max: 90 }),
    body('longitude').isFloat({ min: -180, max: 180 }),
    body('accuracy_meters').isFloat({ min: 0 }),
    body('location_id').isUUID(),
  ],
  validateRequest,
  attendanceController.markAttendance
);

router.get('/attendance/my', authenticate, attendanceController.getMyAttendance);

router.get('/attendance', authenticate, authorize('admin', 'supervisor'), attendanceController.getAllAttendance);

router.get('/attendance/summary/:user_id?', authenticate, attendanceController.getAttendanceSummary);

export default router;


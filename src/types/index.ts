/**
 * Defines the possible roles for a user in the system.
 */
export type UserRole = 'admin' | 'supervisor' | 'client';

/**
 * Represents a user in the database.
 */
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  supervisor_id?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Represents a defined geo-fence location for attendance tracking.
 */
export interface GeoFenceLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  created_by: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Represents an attendance record submitted by a user.
 */
export interface AttendanceRecord {
  id: string;
  user_id: string;
  location_id: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number;
  distance_from_center: number;
  status: 'success' | 'outside_radius' | 'low_accuracy' | 'failed';
  marked_at: string;
  created_at: string;
}

/**
 * Represents an invitation sent to a prospective user.
 */
export interface Invitation {
  id: string;
  email: string;
  role: UserRole;
  invited_by: string;
  token: string;
  expires_at: string;
  accepted_at?: string | null;
  created_at: string;
}

/**
 * JWT Payload structure used for authentication.
 */
export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

/**
 * Generic API response structure.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/**
 * Common query parameters for paginated and filtered requests.
 */
export interface PaginationQuery {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
}


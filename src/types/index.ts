export type UserRole = 'admin' | 'supervisor' | 'client';

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

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
}

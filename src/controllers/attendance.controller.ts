import { Response } from 'express';
import { supabase } from '../utils/supabase';
import { AuthRequest } from '../middleware/auth';
import { haversineDistance, isInsideGeoFence, GPS_ACCURACY_THRESHOLD } from '../utils/geofence';

/**
 * Marks attendance for the authenticated user based on their current location.
 * Validates GPS accuracy and geo-fence proximity.
 */
export const markAttendance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { latitude, longitude, accuracy_meters, location_id } = req.body;
    const userId = req.user!.userId;

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);

    const { count: alreadyMarked } = await supabase
      .from('attendance_records')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('marked_at', todayStart.toISOString())
      .lte('marked_at', todayEnd.toISOString());

    if (alreadyMarked && alreadyMarked > 0) {
      res.status(422).json({ 
        success: false, 
        error: 'You have already marked your attendance for today.' 
      });
      return;
    }

    const { data: location, error: locError } = await supabase
      .from('geo_fence_locations')
      .select('*')
      .eq('id', location_id)
      .eq('is_active', true)
      .single();

    if (locError || !location) {
      res.status(404).json({ success: false, error: 'Geo-fence location not found or inactive' });
      return;
    }

    if (accuracy_meters > GPS_ACCURACY_THRESHOLD) {
      const record = await insertAttendanceRecord({
        user_id: userId,
        location_id,
        latitude,
        longitude,
        accuracy_meters,
        distance_from_center: haversineDistance(latitude, longitude, location.latitude, location.longitude),
        status: 'low_accuracy',
      });

      res.status(422).json({
        success: false,
        error: `GPS accuracy is too low (${Math.round(accuracy_meters)}m). Required: ≤${GPS_ACCURACY_THRESHOLD}m. Please move to an open area and try again.`,
        data: { record, accuracy_threshold: GPS_ACCURACY_THRESHOLD },
      });
      return;
    }

    const distanceFromCenter = haversineDistance(latitude, longitude, location.latitude, location.longitude);
    const inside = isInsideGeoFence(latitude, longitude, location.latitude, location.longitude, location.radius_meters);

    const status = inside ? 'success' : 'outside_radius';
    const record = await insertAttendanceRecord({
      user_id: userId,
      location_id,
      latitude,
      longitude,
      accuracy_meters,
      distance_from_center: distanceFromCenter,
      status,
    });

    if (!inside) {
      res.status(422).json({
        success: false,
        error: `You are ${Math.round(distanceFromCenter)}m from the attendance zone. Required: within ${location.radius_meters}m.`,
        data: { record, distance_from_center: distanceFromCenter, radius: location.radius_meters },
      });
      return;
    }

    res.status(201).json({
      success: true,
      message: 'Attendance marked successfully!',
      data: { record, distance_from_center: distanceFromCenter },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Retrieves attendance records for the currently authenticated user.
 * Supports pagination and date range filtering.
 */
export const getMyAttendance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { page = 1, limit = 20, from, to } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = supabase
      .from('attendance_records')
      .select(`
        *,
        geo_fence_locations(name, latitude, longitude, radius_meters)
      `, { count: 'exact' })
      .eq('user_id', userId)
      .order('marked_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (from) query = query.gte('marked_at', from as string);
    if (to) query = query.lte('marked_at', to as string);

    const { data, error, count } = await query;

    if (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch attendance records' });
      return;
    }

    res.json({
      success: true,
      data,
      meta: { total: count, page: Number(page), limit: Number(limit) },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Retrieves all attendance records based on the user's role.
 * Admins can see all records, while supervisors can only see their assigned clients.
 */
export const getAllAttendance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 50, from, to, user_id, location_id } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const role = req.user!.role;
    const userId = req.user!.userId;

    let query = supabase
      .from('attendance_records')
      .select(`
        *,
        users(id, name, email, role),
        geo_fence_locations(name)
      `, { count: 'exact' })
      .order('marked_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (role === 'supervisor') {
      const { data: clients } = await supabase
        .from('users')
        .select('id')
        .eq('supervisor_id', userId);
      const clientIds = (clients || []).map((c: { id: string }) => c.id);
      
      if (user_id && !clientIds.includes(user_id as string)) {
        res.status(403).json({ success: false, error: 'You do not have permission to view this user\'s attendance' });
        return;
      }

      query = query.in('user_id', clientIds.length > 0 ? clientIds : ['none']);
    } else if (role !== 'admin') {
      query = query.eq('user_id', userId);
    }

    if (user_id && role === 'admin') query = query.eq('user_id', user_id as string);
    if (location_id) query = query.eq('location_id', location_id as string);
    if (from) query = query.gte('marked_at', from as string);
    if (to) query = query.lte('marked_at', to as string);

    const { data, error, count } = await query;

    if (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch attendance records' });
      return;
    }

    res.json({
      success: true,
      data,
      meta: { total: count, page: Number(page), limit: Number(limit) },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Generates an attendance summary for the last 30 days.
 * Access is restricted based on user role and ownership.
 */
export const getAttendanceSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { user_id } = req.params;
    const role = req.user!.role;
    const callerId = req.user!.userId;
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let query = supabase
      .from('attendance_records')
      .select('status, marked_at')
      .gte('marked_at', thirtyDaysAgo.toISOString())
      .order('marked_at', { ascending: false });

    if (user_id) {
      if (role === 'supervisor') {
        const { data: user } = await supabase.from('users').select('supervisor_id').eq('id', user_id).single();
        if (user?.supervisor_id !== callerId) {
          res.status(403).json({ success: false, error: 'Permission denied' });
          return;
        }
      }
      query = query.eq('user_id', user_id);
    } else {
      if (role === 'supervisor') {
        const { data: clients } = await supabase.from('users').select('id').eq('supervisor_id', callerId);
        const clientIds = (clients || []).map((c: any) => c.id);
        query = query.in('user_id', clientIds.length > 0 ? clientIds : ['none']);
      } else if (role === 'client') {
        query = query.eq('user_id', callerId);
      }
    }

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch summary' });
      return;
    }

    const summary = {
      total: data.length,
      successful: data.filter((r: { status: string }) => r.status === 'success').length,
      failed: data.filter((r: { status: string }) => r.status !== 'success').length,
      last_30_days: data,
    };

    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Internal helper to insert an attendance record into the database.
 */
async function insertAttendanceRecord(payload: {
  user_id: string;
  location_id: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number;
  distance_from_center: number;
  status: string;
}) {
  const { data } = await supabase
    .from('attendance_records')
    .insert(payload)
    .select('*')
    .single();
  return data;
}


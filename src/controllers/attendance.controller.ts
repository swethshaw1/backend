import { Response } from 'express';
import { supabase } from '../utils/supabase';
import { AuthRequest } from '../middleware/auth';
import { haversineDistance, isInsideGeoFence, GPS_ACCURACY_THRESHOLD } from '../utils/geofence';

export const markAttendance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { latitude, longitude, accuracy_meters, location_id } = req.body;
    const userId = req.user!.userId;

    // 0. Check if already marked today (UTC)
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

    // 1. Fetch the geo-fence location
    const { data: location, error: locError } = await supabase
      .from('geo_fence_locations')
      .select('*')
      .eq('id', location_id)
      .eq('is_active', true)
      .single();

    if (locError || !location) {
      console.error('[ATTENDANCE:MARK] Geo-fence location error:', locError);
      res.status(404).json({ success: false, error: 'Geo-fence location not found or inactive' });
      return;
    }

    // 2. Validate GPS accuracy
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

    // 3. Calculate distance and check geofence
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
    console.error('Mark attendance error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

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
      console.error('[ATTENDANCE:GET_MY] Query error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch attendance records' });
      return;
    }

    res.json({
      success: true,
      data,
      meta: { total: count, page: Number(page), limit: Number(limit) },
    });
  } catch (err) {
    console.error('[ATTENDANCE:GET_MY] Internal error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

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

    // Visibility Rules:
    // Admin: Can see everything (clients + supervisors)
    // Supervisor: Can see only their assigned clients
    if (role === 'supervisor') {
      const { data: clients } = await supabase
        .from('users')
        .select('id')
        .eq('supervisor_id', userId);
      const clientIds = (clients || []).map((c: { id: string }) => c.id);
      
      // If user_id was requested, ensure it's one of their clients
      if (user_id && !clientIds.includes(user_id as string)) {
        res.status(403).json({ success: false, error: 'You do not have permission to view this user\'s attendance' });
        return;
      }

      query = query.in('user_id', clientIds.length > 0 ? clientIds : ['none']);
    } else if (role !== 'admin') {
      // Clients or others should only see their own (this route is usually for admins/supervisors though)
      query = query.eq('user_id', userId);
    }

    if (user_id && role === 'admin') query = query.eq('user_id', user_id as string);
    if (location_id) query = query.eq('location_id', location_id as string);
    if (from) query = query.gte('marked_at', from as string);
    if (to) query = query.lte('marked_at', to as string);

    const { data, error, count } = await query;

    if (error) {
      console.error('[ATTENDANCE:GET_ALL] Query error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch attendance records' });
      return;
    }

    res.json({
      success: true,
      data,
      meta: { total: count, page: Number(page), limit: Number(limit) },
    });
  } catch (err) {
    console.error('[ATTENDANCE:GET_ALL] Internal error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const getAttendanceSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { user_id } = req.params;
    const role = req.user!.role;
    const callerId = req.user!.userId;
    
    // 30-day summary
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let query = supabase
      .from('attendance_records')
      .select('status, marked_at')
      .gte('marked_at', thirtyDaysAgo.toISOString())
      .order('marked_at', { ascending: false });

    if (user_id) {
      // Permission check if a specific user is requested
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
      // If admin and no user_id, it skips filtering and fetches ALL records.
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ATTENDANCE:SUMMARY] Query error:', error);
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
    console.error('[ATTENDANCE:SUMMARY] Internal error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// Helper
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

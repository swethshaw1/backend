import { Response } from 'express';
import { supabase } from '../utils/supabase';
import { AuthRequest } from '../middleware/auth';

export const createLocation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, latitude, longitude, radius_meters } = req.body;

    const { data, error } = await supabase
      .from('geo_fence_locations')
      .insert({
        name,
        latitude,
        longitude,
        radius_meters: radius_meters ?? 100,
        created_by: req.user!.userId,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[LOCATION:CREATE] DB error:', error);
      res.status(500).json({ success: false, error: 'Failed to create location' });
      return;
    }

    res.status(201).json({ success: true, data });
  } catch (err) {
    console.error('[LOCATION:CREATE] Internal error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const getLocations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('geo_fence_locations')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[LOCATION:GET_ALL] DB error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch locations' });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('[LOCATION:GET_ALL] Internal error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const updateLocation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, latitude, longitude, radius_meters, is_active } = req.body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (latitude !== undefined) updateData.latitude = latitude;
    if (longitude !== undefined) updateData.longitude = longitude;
    if (radius_meters !== undefined) updateData.radius_meters = radius_meters;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await supabase
      .from('geo_fence_locations')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      console.error('[LOCATION:UPDATE] DB error or not found:', error);
      res.status(404).json({ success: false, error: 'Location not found' });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('[LOCATION:UPDATE] Internal error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const deleteLocation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('geo_fence_locations')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('[LOCATION:DELETE] DB error:', error);
      res.status(500).json({ success: false, error: 'Failed to delete location' });
      return;
    }

    res.json({ success: true, message: 'Location deactivated successfully' });
  } catch (err) {
    console.error('[LOCATION:DELETE] Internal error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

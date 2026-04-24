import { Response } from 'express';
import { supabase } from '../utils/supabase';
import { AuthRequest } from '../middleware/auth';

/**
 * Creates a new geo-fence location.
 */
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
      res.status(500).json({ success: false, error: 'Failed to create location' });
      return;
    }

    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Retrieves all active geo-fence locations.
 */
export const getLocations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('geo_fence_locations')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch locations' });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Updates an existing geo-fence location's details.
 */
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
      res.status(404).json({ success: false, error: 'Location not found' });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Deactivates a geo-fence location (soft delete).
 */
export const deleteLocation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('geo_fence_locations')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      res.status(500).json({ success: false, error: 'Failed to delete location' });
      return;
    }

    res.json({ success: true, message: 'Location deactivated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};


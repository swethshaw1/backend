import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../utils/supabase';
import { AuthRequest } from '../middleware/auth';

/**
 * Retrieves a list of users.
 * Supervisors are restricted to viewing only their assigned clients.
 */
export const getUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { role, supervisor_id } = req.query;
    const callerRole = req.user!.role;
    const callerId = req.user!.userId;

    let query = supabase
      .from('users')
      .select('id, email, name, role, supervisor_id, is_active, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (callerRole === 'supervisor') {
      query = query.eq('supervisor_id', callerId);
    } else {
      if (role) query = query.eq('role', role as string);
      if (supervisor_id) query = query.eq('supervisor_id', supervisor_id as string);
    }

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch users' });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Updates a user's profile information.
 */
export const updateUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, role, supervisor_id, is_active } = req.body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;
    if (supervisor_id !== undefined) updateData.supervisor_id = supervisor_id;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select('id, email, name, role, supervisor_id, is_active, updated_at')
      .single();

    if (error || !data) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Assigns a supervisor to a client.
 */
export const assignSupervisor = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { client_id, supervisor_id } = req.body;

    const { data: supervisor } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', supervisor_id)
      .eq('role', 'supervisor')
      .single();

    if (!supervisor) {
      res.status(404).json({ success: false, error: 'Supervisor not found' });
      return;
    }

    const { data, error } = await supabase
      .from('users')
      .update({ supervisor_id })
      .eq('id', client_id)
      .select('id, email, name, role, supervisor_id')
      .single();

    if (error || !data) {
      res.status(404).json({ success: false, error: 'Client not found' });
      return;
    }

    res.json({ success: true, data, message: 'Supervisor assigned successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Sends an invitation to a new user.
 * Includes auto-assignment logic if a supervisor invites an already registered user.
 */
export const sendInvitation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, role } = req.body;
    const invitedBy = req.user!.userId;
    const callerRole = req.user!.role;

    if (callerRole === 'supervisor' && role !== 'client') {
      res.status(403).json({ success: false, error: 'Supervisors can only invite clients' });
      return;
    }

    const { data: existingUser } = await supabase
      .from('users')
      .select('id, supervisor_id')
      .eq('email', email)
      .single();

    if (existingUser && callerRole === 'supervisor' && !existingUser.supervisor_id) {
      await supabase
        .from('users')
        .update({ supervisor_id: invitedBy })
        .eq('id', existingUser.id);
      
      res.status(200).json({ 
        success: true, 
        message: 'Client was already registered and has been assigned to you.',
        data: { user_id: existingUser.id }
      });
      return;
    }

    const { data: existing } = await supabase
      .from('invitations')
      .select('id')
      .eq('email', email)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (existing) {
      res.status(409).json({ success: false, error: 'An active invitation already exists for this email' });
      return;
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const token = uuidv4();
    const supervisorId = callerRole === 'supervisor' ? invitedBy : null;

    const { data, error } = await supabase
      .from('invitations')
      .insert({
        email,
        role,
        invited_by: invitedBy,
        supervisor_id: supervisorId,
        token,
        expires_at: expiresAt.toISOString(),
      })
      .select('*')
      .single();

    if (error || !data) {
      res.status(500).json({ success: false, error: 'Failed to create invitation' });
      return;
    }

    res.status(201).json({
      success: true,
      data: {
        invitation: data,
        invite_link: `geoattendance://invite?token=${token}`,
      },
      message: 'Invitation created successfully',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Retrieves a list of invitations.
 * Supervisors only see invitations they have issued.
 */
export const getInvitations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const callerRole = req.user!.role;

    let query = supabase
      .from('invitations')
      .select('*')
      .order('created_at', { ascending: false });

    if (callerRole === 'supervisor') {
      query = query.eq('invited_by', userId);
    }

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch invitations' });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Validates an invitation token.
 */
export const validateInvitation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { token } = req.params;

    const { data, error } = await supabase
      .from('invitations')
      .select('email, role, expires_at, accepted_at')
      .eq('token', token)
      .single();

    if (error || !data) {
      res.status(404).json({ success: false, error: 'Invitation not found' });
      return;
    }

    if (data.accepted_at) {
      res.status(410).json({ success: false, error: 'Invitation already used' });
      return;
    }

    if (new Date(data.expires_at) < new Date()) {
      res.status(410).json({ success: false, error: 'Invitation has expired' });
      return;
    }

    res.json({ success: true, data: { email: data.email, role: data.role } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};


import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../utils/supabase';
import { AuthRequest } from '../middleware/auth';

export const getUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { role, supervisor_id } = req.query;
    const callerRole = req.user!.role;
    const callerId = req.user!.userId;

    let query = supabase
      .from('users')
      .select('id, email, name, role, supervisor_id, is_active, created_at, updated_at')
      .order('created_at', { ascending: false });

    // Supervisors can only see their own clients
    if (callerRole === 'supervisor') {
      query = query.eq('supervisor_id', callerId);
    } else {
      if (role) query = query.eq('role', role as string);
      if (supervisor_id) query = query.eq('supervisor_id', supervisor_id as string);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[USER:GET_ALL] DB error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch users' });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('[USER:GET_ALL] Internal error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

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
      console.error('[USER:UPDATE] DB error or user not found:', error);
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('[USER:UPDATE] Internal error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const assignSupervisor = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { client_id, supervisor_id } = req.body;

    // Verify supervisor exists and has the right role
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
      console.error('[USER:ASSIGN_SUPERVISOR] DB error or client not found:', error);
      res.status(404).json({ success: false, error: 'Client not found' });
      return;
    }

    res.json({ success: true, data, message: 'Supervisor assigned successfully' });
  } catch (err) {
    console.error('[USER:ASSIGN_SUPERVISOR] Internal error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// Invitations
export const sendInvitation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, role } = req.body;
    const invitedBy = req.user!.userId;
    const callerRole = req.user!.role;

    // Supervisors can only invite clients
    if (callerRole === 'supervisor' && role !== 'client') {
      console.error('[USER:SEND_INVITE] Supervisor tried to invite non-client role:', role);
      res.status(403).json({ success: false, error: 'Supervisors can only invite clients' });
      return;
    }

    // AUTO-ASSIGNMENT LOGIC:
    // If the email already exists in 'users' and doesn't have a supervisor,
    // and the inviter is a supervisor, assign them immediately.
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, supervisor_id')
      .eq('email', email)
      .single();

    if (existingUser && callerRole === 'supervisor' && !existingUser.supervisor_id) {
      console.log(`[USER:SEND_INVITE] Auto-assigning existing user ${email} to supervisor ${invitedBy}`);
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

    // Check no existing active invitation
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
    expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiry

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
      console.error('[USER:SEND_INVITE] DB error:', error);
      res.status(500).json({ success: false, error: 'Failed to create invitation' });
      return;
    }

    // In production: send invitation email with deep link
    // For now, return the token for testing
    res.status(201).json({
      success: true,
      data: {
        invitation: data,
        // Deep link the mobile app would use: geoattendance://invite?token=xxx
        invite_link: `geoattendance://invite?token=${token}`,
      },
      message: 'Invitation created successfully',
    });
  } catch (err) {
    console.error('[USER:SEND_INVITE] Internal error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

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
      console.error('[USER:GET_INVITES] DB error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch invitations' });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('[USER:GET_INVITES] Internal error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

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
    console.error('[USER:VALIDATE_INVITE] Internal error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

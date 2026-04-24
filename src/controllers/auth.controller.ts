import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../utils/supabase';
import { generateAccessToken, generateRefreshToken, verifyToken } from '../utils/jwt';
import { AuthRequest } from '../middleware/auth';

/**
 * Registers a new user. 
 * Requires a valid invitation unless it's the first user in the system (who becomes Admin).
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name } = req.body;

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) {
      res.status(409).json({ success: false, error: 'Email already registered' });
      return;
    }

    const { data: invitation } = await supabase
      .from('invitations')
      .select('*')
      .eq('email', email)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    const isFirstUser = await checkIfFirstUser();
    if (!isFirstUser && !invitation) {
      res.status(403).json({
        success: false,
        error: 'Registration requires a valid invitation',
      });
      return;
    }

    const password_hash = await bcrypt.hash(password, 12);
    const role = isFirstUser ? 'admin' : invitation?.role || 'client';
    const supervisor_id = invitation?.supervisor_id || null;

    const { data: user, error } = await supabase
      .from('users')
      .insert({ email, name, password_hash, role, supervisor_id })
      .select('id, email, name, role, supervisor_id, is_active, created_at')
      .single();

    if (error || !user) {
      res.status(500).json({ success: false, error: 'Failed to create user' });
      return;
    }

    if (invitation) {
      await supabase
        .from('invitations')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invitation.id);
    }

    const accessToken = generateAccessToken(user.id, user.email, user.role);
    const refreshToken = generateRefreshToken(user.id, user.email, user.role);

    await storeRefreshToken(user.id, refreshToken);

    res.status(201).json({
      success: true,
      data: { user, accessToken, refreshToken },
      message: 'Registration successful',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Authenticates a user and provides access and refresh tokens.
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('is_active', true)
      .single();

    if (error || !user) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    const accessToken = generateAccessToken(user.id, user.email, user.role);
    const refreshToken = generateRefreshToken(user.id, user.email, user.role);

    await storeRefreshToken(user.id, refreshToken);

    const { password_hash: _pw, ...userSafe } = user;

    res.json({
      success: true,
      data: { user: userSafe, accessToken, refreshToken },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Refreshes an expired access token using a valid refresh token.
 */
export const refreshTokens = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ success: false, error: 'Refresh token required' });
      return;
    }

    const payload = verifyToken(refreshToken);

    const { data: stored } = await supabase
      .from('refresh_tokens')
      .select('*')
      .eq('token', refreshToken)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!stored) {
      res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
      return;
    }

    const accessToken = generateAccessToken(payload.userId, payload.email, payload.role);
    const newRefreshToken = generateRefreshToken(payload.userId, payload.email, payload.role);

    await supabase.from('refresh_tokens').delete().eq('token', refreshToken);
    await storeRefreshToken(payload.userId, newRefreshToken);

    res.json({ success: true, data: { accessToken, refreshToken: newRefreshToken } });
  } catch (err) {
    res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
  }
};

/**
 * Logs out a user by invalidating their refresh token.
 */
export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await supabase.from('refresh_tokens').delete().eq('token', refreshToken);
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Returns the currently authenticated user's profile information.
 */
export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, role, supervisor_id, is_active, created_at, updated_at')
      .eq('id', req.user!.userId)
      .single();

    if (error || !user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Internal helper to check if any users exist in the system.
 */
async function checkIfFirstUser(): Promise<boolean> {
  const { count } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true });
  return (count ?? 0) === 0;
}

/**
 * Internal helper to store a new refresh token in the database.
 */
async function storeRefreshToken(userId: string, token: string): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  await supabase.from('refresh_tokens').insert({
    id: uuidv4(),
    user_id: userId,
    token,
    expires_at: expiresAt.toISOString(),
  });
}


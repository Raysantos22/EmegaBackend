// pages/api/users/profile.js
import { supabaseAdmin } from '../../../lib/supabase-admin'
import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  try {
    // Get the user from the request
    const token = req.headers.authorization?.replace('Bearer ', '')
    
    if (!token) {
      return res.status(401).json({ error: 'No authorization token provided' })
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    switch (req.method) {
      case 'GET':
        return await getUserProfile(req, res, user.id)
      case 'PUT':
        return await updateUserProfile(req, res, user.id)
      default:
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('API Error:', error)
    return res.status(500).json({ error: 'Internal server error', message: error.message })
  }
}

async function getUserProfile(req, res, userId) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return res.status(404).json({ error: 'User profile not found' })
    }
    throw error
  }

  return res.status(200).json({
    success: true,
    user: data
  })
}

async function updateUserProfile(req, res, userId) {
  const {
    full_name,
    phone,
    address,
    preferences
  } = req.body

  const updateData = {
    updated_at: new Date().toISOString()
  }

  if (full_name !== undefined) updateData.full_name = full_name
  if (phone !== undefined) updateData.phone = phone
  if (address !== undefined) updateData.address = address
  if (preferences !== undefined) updateData.preferences = preferences

  const { data, error } = await supabaseAdmin
    .from('users')
    .update(updateData)
    .eq('id', userId)
    .select()

  if (error) {
    throw error
  }

  if (!data || data.length === 0) {
    return res.status(404).json({ error: 'User not found' })
  }

  return res.status(200).json({
    success: true,
    user: data[0],
    message: 'Profile updated successfully'
  })
}
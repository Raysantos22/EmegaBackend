// pages/api/users/index.js - For admin user management
import { supabaseAdmin } from '../../../lib/supabase-admin'

export default async function handler(req, res) {
  try {
    switch (req.method) {
      case 'GET':
        return await getUsers(req, res)
      default:
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('API Error:', error)
    return res.status(500).json({ error: 'Internal server error', message: error.message })
  }
}

async function getUsers(req, res) {
  const { 
    page = 1, 
    limit = 20, 
    search,
    role,
    is_active = true
  } = req.query

  let query = supabaseAdmin
    .from('users')
    .select('id, email, full_name, role, is_active, created_at, last_login', { count: 'exact' })

  // Add filters
  if (search) {
    query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`)
  }

  if (role) {
    query = query.eq('role', role)
  }

  if (is_active !== undefined) {
    query = query.eq('is_active', is_active === 'true')
  }

  // Add sorting
  query = query.order('created_at', { ascending: false })

  // Add pagination
  const from = (parseInt(page) - 1) * parseInt(limit)
  const to = from + parseInt(limit) - 1
  query = query.range(from, to)

  const { data, error, count } = await query

  if (error) {
    throw error
  }

  return res.status(200).json({
    success: true,
    users: data || [],
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count || 0,
      pages: Math.ceil((count || 0) / parseInt(limit))
    }
  })
}
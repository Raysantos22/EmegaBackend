// pages/api/banners/index.js
import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  try {
    switch (req.method) {
      case 'GET':
        return await getBanners(req, res)
      case 'POST':
        return await createBanner(req, res)
      default:
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('Banner API Error:', error)
    return res.status(500).json({ error: 'Internal server error', message: error.message })
  }
}

async function getBanners(req, res) {
  const { active_only = 'false' } = req.query

  let query = supabase
    .from('banners')
    .select('*')

  // Filter for active banners only if requested
  if (active_only === 'true') {
    query = query.eq('is_active', true)
    
    // Also filter by date range if applicable
    const now = new Date().toISOString()
    query = query
      .or(`start_date.is.null,start_date.lte.${now}`)
      .or(`end_date.is.null,end_date.gte.${now}`)
  }

  // Order by display_order, then by created_at
  query = query.order('display_order', { ascending: true })
    .order('created_at', { ascending: false })

  const { data, error } = await query

  if (error) {
    throw error
  }

  return res.status(200).json({
    success: true,
    banners: data || []
  })
}

async function createBanner(req, res) {
  const {
    title,
    subtitle,
    image_url,
    text_color = 'white',
    action_type = 'category',
    action_value,
    is_active = true,
    display_order = 0,
    start_date,
    end_date
  } = req.body

  if (!title || !image_url) {
    return res.status(400).json({ 
      error: 'Missing required fields', 
      required: ['title', 'image_url'] 
    })
  }

  const bannerData = {
    title,
    subtitle,
    image_url,
    text_color,
    action_type,
    action_value,
    is_active,
    display_order: parseInt(display_order) || 0,
    start_date: start_date || null,
    end_date: end_date || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('banners')
    .insert([bannerData])
    .select()

  if (error) {
    throw error
  }

  return res.status(201).json({
    success: true,
    banner: data[0],
    message: 'Banner created successfully'
  })
}
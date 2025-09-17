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

// pages/api/banners/[id].js
import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  const { id } = req.query

  try {
    switch (req.method) {
      case 'GET':
        return await getBanner(req, res, id)
      case 'PUT':
        return await updateBanner(req, res, id)
      case 'DELETE':
        return await deleteBanner(req, res, id)
      default:
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('Banner API Error:', error)
    return res.status(500).json({ error: 'Internal server error', message: error.message })
  }
}

async function getBanner(req, res, id) {
  const { data, error } = await supabase
    .from('banners')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return res.status(404).json({ error: 'Banner not found' })
    }
    throw error
  }

  return res.status(200).json({
    success: true,
    banner: data
  })
}

async function updateBanner(req, res, id) {
  const {
    title,
    subtitle,
    image_url,
    text_color,
    action_type,
    action_value,
    is_active,
    display_order,
    start_date,
    end_date
  } = req.body

  const updateData = {
    updated_at: new Date().toISOString()
  }

  // Only update fields that are provided
  if (title !== undefined) updateData.title = title
  if (subtitle !== undefined) updateData.subtitle = subtitle
  if (image_url !== undefined) updateData.image_url = image_url
  if (text_color !== undefined) updateData.text_color = text_color
  if (action_type !== undefined) updateData.action_type = action_type
  if (action_value !== undefined) updateData.action_value = action_value
  if (is_active !== undefined) updateData.is_active = is_active
  if (display_order !== undefined) updateData.display_order = parseInt(display_order)
  if (start_date !== undefined) updateData.start_date = start_date || null
  if (end_date !== undefined) updateData.end_date = end_date || null

  const { data, error } = await supabase
    .from('banners')
    .update(updateData)
    .eq('id', id)
    .select()

  if (error) {
    throw error
  }

  if (!data || data.length === 0) {
    return res.status(404).json({ error: 'Banner not found' })
  }

  return res.status(200).json({
    success: true,
    banner: data[0],
    message: 'Banner updated successfully'
  })
}

async function deleteBanner(req, res, id) {
  const { data, error } = await supabase
    .from('banners')
    .delete()
    .eq('id', id)
    .select()

  if (error) {
    throw error
  }

  if (!data || data.length === 0) {
    return res.status(404).json({ error: 'Banner not found' })
  }

  return res.status(200).json({
    success: true,
    message: 'Banner deleted successfully'
  })
}

// pages/api/banners/reorder.js
import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { bannerOrders } = req.body

    if (!Array.isArray(bannerOrders)) {
      return res.status(400).json({ error: 'bannerOrders must be an array' })
    }

    // Update all banner orders in a transaction-like manner
    const updates = bannerOrders.map(({ id, display_order }) => ({
      id,
      display_order,
      updated_at: new Date().toISOString()
    }))

    const { data, error } = await supabase
      .from('banners')
      .upsert(updates, { onConflict: 'id' })
      .select()

    if (error) {
      throw error
    }

    return res.status(200).json({
      success: true,
      banners: data,
      message: 'Banner order updated successfully'
    })

  } catch (error) {
    console.error('Reorder error:', error)
    return res.status(500).json({ error: 'Internal server error', message: error.message })
  }
}
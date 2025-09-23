// pages/api/banners/[id].js
import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  const { id } = req.query

  // Add debugging logs
  console.log('API Route called:', req.method, req.url)
  console.log('Banner ID:', id)
  console.log('Request body:', req.body)

  // Validate that ID exists and is not undefined
  if (!id) {
    console.log('No ID provided')
    return res.status(400).json({ error: 'Banner ID is required' })
  }

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
  console.log('Getting banner with ID:', id)
  
  const { data, error } = await supabase
    .from('banners')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Supabase error:', error)
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

// Alternative approach for updateBanner function
// Enhanced debug version - replace your updateBanner function with this
// Updated updateBanner function - allows empty/null values for all fields
async function updateBanner(req, res, id) {
  console.log('Updating banner with ID:', id)

  const bannerId = parseInt(id, 10)
  if (isNaN(bannerId)) {
    return res.status(400).json({ error: 'Invalid banner ID' })
  }

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

  // Build update object - allow empty strings and null values
  const updateData = {}
  
  // Allow empty strings for text fields
  if (title !== undefined) updateData.title = title || '' // Allow empty string
  if (subtitle !== undefined) updateData.subtitle = subtitle || '' // Allow empty string
  if (image_url !== undefined) updateData.image_url = image_url || '' // Allow empty string
  if (text_color !== undefined) updateData.text_color = text_color || 'white' // Default to white
  if (action_type !== undefined) updateData.action_type = action_type || 'category' // Default
  if (action_value !== undefined) updateData.action_value = action_value || '' // Allow empty
  if (is_active !== undefined) updateData.is_active = Boolean(is_active)
  if (display_order !== undefined) updateData.display_order = parseInt(display_order) || 0
  if (start_date !== undefined) updateData.start_date = start_date || null
  if (end_date !== undefined) updateData.end_date = end_date || null
  
  // Always update timestamp
  updateData.updated_at = new Date().toISOString()

  console.log('Update data (flexible):', {
    ...updateData,
    image_url: updateData.image_url ? `${updateData.image_url.substring(0, 50)}...` : 'empty/null'
  })

  try {
    // Check if banner exists
    const { data: existingBanner, error: checkError } = await supabase
      .from('banners')
      .select('id')
      .eq('id', bannerId)
      .single()

    if (checkError || !existingBanner) {
      return res.status(404).json({ error: 'Banner not found' })
    }

    // Perform update without strict validation
    const { error: updateError } = await supabase
      .from('banners')
      .update(updateData)
      .eq('id', bannerId)

    if (updateError) {
      console.error('Update error:', updateError)
      return res.status(400).json({ 
        error: 'Update failed', 
        details: updateError.message 
      })
    }

    // Fetch the updated record
    const { data: updatedBanner, error: fetchError } = await supabase
      .from('banners')
      .select('*')
      .eq('id', bannerId)
      .single()

    if (fetchError || !updatedBanner) {
      return res.status(404).json({ error: 'Banner not found after update' })
    }

    console.log('Update successful - flexible validation')

    return res.status(200).json({
      success: true,
      banner: updatedBanner,
      message: 'Banner updated successfully (flexible validation)'
    })

  } catch (error) {
    console.error('Unexpected error:', error)
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    })
  }
}

async function deleteBanner(req, res, id) {
  console.log('Deleting banner with ID:', id)

  // First check if the banner exists
  const { data: existingBanner, error: checkError } = await supabase
    .from('banners')
    .select('id')
    .eq('id', id)
    .single()

  if (checkError || !existingBanner) {
    console.log('Banner not found during check:', checkError)
    return res.status(404).json({ error: 'Banner not found' })
  }

  const { data, error } = await supabase
    .from('banners')
    .delete()
    .eq('id', id)
    .select()

  if (error) {
    console.error('Delete error:', error)
    throw error
  }

  if (!data || data.length === 0) {
    console.log('No data returned after delete')
    return res.status(404).json({ error: 'Banner not found' })
  }

  console.log('Delete successful')

  return res.status(200).json({
    success: true,
    message: 'Banner deleted successfully'
  })
}
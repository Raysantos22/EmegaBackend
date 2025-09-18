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
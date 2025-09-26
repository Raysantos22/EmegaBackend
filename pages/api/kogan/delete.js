// pages/api/kogan/delete.js - Simple delete endpoint
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { userId, productIds } = req.body

    if (!userId || !productIds || !Array.isArray(productIds)) {
      return res.status(400).json({ error: 'userId and productIds array required' })
    }

    // Soft delete by setting monitoring_enabled to false
    const { data, error } = await supabase
      .from('kogan_products')
      .update({ 
        monitoring_enabled: false,
        last_updated: new Date().toISOString()
      })
      .eq('user_id', userId)
      .in('id', productIds)
      .select('id')

    if (error) {
      console.error('Delete error:', error)
      return res.status(500).json({ 
        error: 'Delete failed', 
        message: error.message 
      })
    }

    res.status(200).json({ 
      success: true, 
      deletedCount: data ? data.length : 0
    })

  } catch (error) {
    console.error('API Error:', error)
    res.status(500).json({ 
      error: 'Request failed', 
      message: error.message 
    })
  }
}

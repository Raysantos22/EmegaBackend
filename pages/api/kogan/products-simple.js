// pages/api/kogan/products-simple.js - Simplified products endpoint
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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { userId } = req.query

    if (!userId) {
      return res.status(400).json({ error: 'userId parameter required' })
    }

    const { data: products, error } = await supabase
      .from('kogan_products')
      .select('*')
      .eq('user_id', userId)
      .eq('monitoring_enabled', true)
      .order('created_at', { ascending: false })
      .limit(100) // Limit to prevent large responses

    if (error) {
      console.error('Products fetch error:', error)
      return res.status(500).json({ 
        error: 'Failed to fetch products', 
        message: error.message 
      })
    }

    res.status(200).json({ 
      success: true, 
      products: products || [],
      count: products ? products.length : 0
    })

  } catch (error) {
    console.error('API Error:', error)
    res.status(500).json({ 
      error: 'Request failed', 
      message: error.message 
    })
  }
}

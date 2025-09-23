// pages/api/kogan/products.js - Fixed environment handling
import { createClient } from '@supabase/supabase-js'

const initSupabase = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(supabaseUrl, supabaseKey)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let supabase
  try {
    supabase = initSupabase()
  } catch (error) {
    return res.status(500).json({ 
      error: 'Configuration error', 
      message: 'Please check your environment variables' 
    })
  }

  try {
    const { userId } = req.query

    if (!userId) {
      return res.status(400).json({ error: 'User ID required' })
    }

    const { data: products, error } = await supabase
      .from('kogan_products')
      .select('*')
      .eq('user_id', userId)
      .eq('monitoring_enabled', true)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Database error:', error)
      throw new Error(`Database query failed: ${error.message}`)
    }

    res.status(200).json({ success: true, products: products || [] })

  } catch (error) {
    console.error('Error fetching products:', error)
    res.status(500).json({ 
      error: 'Failed to fetch products', 
      message: error.message 
    })
  }
}

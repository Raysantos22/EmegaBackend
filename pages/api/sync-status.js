import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Get product count by status
    const { data: statusCounts, error: statusError } = await supabase
      .from('products')
      .select('status')
    
    if (statusError) throw statusError
    
    // Get last sync info
    const { data: lastProduct, error: lastError } = await supabase
      .from('products')
      .select('modified_at')
      .order('modified_at', { ascending: false })
      .limit(1)
      .single()
    
    const statusSummary = statusCounts.reduce((acc, product) => {
      acc[product.status] = (acc[product.status] || 0) + 1
      return acc
    }, {})
    
    res.status(200).json({
      total_products: statusCounts.length,
      status_breakdown: statusSummary,
      last_sync: lastProduct?.modified_at || null,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
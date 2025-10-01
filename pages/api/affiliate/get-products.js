// pages/api/affiliate/get-products.js
import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { storeName, sku } = req.query

    // Build query - join with products table
    let query = `
      SELECT 
        al.*,
        p.id as product_id,
        p.title,
        p.brand,
        p.category,
        p.image_urls,
        p.description,
        p.features,
        p.supplier_price,
        p.our_price,
        p.currency,
        p.stock_status,
        p.stock_quantity,
        p.rating_average,
        p.rating_count,
        p.variants,
        p.supplier_asin,
        p.last_scraped
      FROM affiliate_links al
      LEFT JOIN products p ON al.internal_sku = p.internal_sku
      WHERE al.is_active = true
    `

    const params = []
    
    if (storeName) {
      params.push(storeName)
      query += ` AND al.store_name = $${params.length}`
    }

    if (sku) {
      params.push(sku)
      query += ` AND al.internal_sku = $${params.length}`
    }

    query += ' ORDER BY al.created_at DESC'

    const { data, error } = await supabase.rpc('execute_sql', {
      query: query,
      params: params
    })

    if (error) {
      // Fallback: use standard query if RPC not available
      let standardQuery = supabase
        .from('affiliate_links')
        .select('*')
        .eq('is_active', true)

      if (storeName) standardQuery = standardQuery.eq('store_name', storeName)
      if (sku) standardQuery = standardQuery.eq('internal_sku', sku)

      const { data: links, error: linkError } = await standardQuery

      if (linkError) throw linkError

      // Get product details for each link
      const enrichedLinks = await Promise.all(
        links.map(async (link) => {
          const { data: product } = await supabase
            .from('products')
            .select('*')
            .eq('internal_sku', link.internal_sku)
            .single()

          return {
            ...link,
            product: product || null
          }
        })
      )

      return res.status(200).json({
        success: true,
        count: enrichedLinks.length,
        data: enrichedLinks
      })
    }

    return res.status(200).json({
      success: true,
      count: data?.length || 0,
      data: data || []
    })

  } catch (error) {
    console.error('[AFFILIATE-GET] Error:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch affiliate products',
      message: error.message
    })
  }
}
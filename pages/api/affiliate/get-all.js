import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { userId } = req.query

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId required'
      })
    }

    // Get affiliate links with full product details
    const { data, error } = await supabase
      .from('affiliate_links')
      .select(`
        id,
        store_name,
        affiliate_link,
        is_active,
        created_at,
        products (
          id,
          internal_sku,
          supplier_asin,
          title,
          brand,
          category,
          image_urls,
          description,
          supplier_price,
          our_price,
          stock_status,
          stock_quantity,
          rating_average,
          rating_count
        )
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) throw error

    return res.status(200).json({
      success: true,
      count: data.length,
      data: data
    })

  } catch (error) {
    console.error('[AFFILIATE-GET-ALL]:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
}
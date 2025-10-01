import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { userId, storeName, affiliateLink, productId } = req.body

    if (!userId || !storeName || !affiliateLink || !productId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      })
    }

    const { data, error } = await supabase
      .from('affiliate_links')
      .insert({
        user_id: userId,
        store_name: storeName,
        affiliate_link: affiliateLink,
        product_id: productId
      })
      .select()
      .single()

    if (error) throw error

    return res.status(200).json({
      success: true,
      data: data
    })

  } catch (error) {
    console.error('[AFFILIATE-CREATE]:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
}
// pages/api/public/affiliate-products.js
import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { apiKey, storeName, sku } = req.query

    // Validate API key
    if (!apiKey) {
      return res.status(401).json({ 
        success: false,
        error: 'API key required' 
      })
    }

    // Verify API key and get user
    const { data: apiKeyData, error: keyError } = await supabase
      .from('api_keys')
      .select('user_id, is_active')
      .eq('key', apiKey)
      .eq('is_active', true)
      .single()

    if (keyError || !apiKeyData) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid API key' 
      })
    }

    const userId = apiKeyData.user_id

    // Build query
    let query = supabase
      .from('affiliate_links')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)

    // Filter by store
    if (storeName) {
      const { data: stores } = await supabase
        .from('stores')
        .select('id')
        .eq('user_id', userId)
        .eq('store_name', storeName)
        .eq('is_active', true)

      if (stores && stores.length > 0) {
        query = query.in('store_id', stores.map(s => s.id))
      } else {
        return res.status(200).json({
          success: true,
          count: 0,
          products: []
        })
      }
    }

    // Filter by SKU
    if (sku) {
      query = query.eq('internal_sku', sku)
    }

    const { data: links, error } = await query

    if (error) throw error

    // Enrich with store and product data
    const enrichedProducts = await Promise.all(
      (links || []).map(async (link) => {
        // Get store
        const { data: store } = await supabase
          .from('stores')
          .select('id, store_name, description, website_url')
          .eq('id', link.store_id)
          .single()

        // Get product
        const { data: product } = await supabase
          .from('products')
          .select('*')
          .eq('internal_sku', link.internal_sku)
          .single()

        if (!product) return null

        return {
          affiliate_link: link.affiliate_url,
          store: {
            name: store?.store_name,
            description: store?.description,
            website: store?.website_url
          },
          product: {
            sku: product.internal_sku,
            asin: product.supplier_asin,
            title: product.title,
            brand: product.brand,
            category: product.category,
            description: product.description,
            images: product.image_urls,
            features: product.features,
            price: {
              supplier: product.supplier_price,
              retail: product.our_price,
              currency: product.currency
            },
            stock: {
              status: product.stock_status,
              quantity: product.stock_quantity
            },
            rating: {
              average: product.rating_average,
              count: product.rating_count
            },
            variants: product.variants,
            last_updated: product.last_scraped
          }
        }
      })
    )

    const validProducts = enrichedProducts.filter(p => p !== null)

    return res.status(200).json({
      success: true,
      count: validProducts.length,
      products: validProducts,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('[PUBLIC-API] Error:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch products',
      message: error.message
    })
  }
}
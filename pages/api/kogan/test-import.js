// pages/api/kogan/test-import.js - Simple test endpoint to verify everything works
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
    const { userId } = req.body

    if (!userId) {
      return res.status(400).json({ error: 'userId required' })
    }

    // Create a few test products
    const testProducts = [
      {
        user_id: userId,
        sku: `TEST${Date.now()}001`,
        name: 'Samsung Galaxy Test Phone',
        brand: 'Samsung',
        category: 'Electronics',
        price_current: 999.99,
        price_original: 1199.99,
        discount_percent: 17,
        source_url: 'https://www.kogan.com/au/buy/test-product-1/',
        image_url: 'https://picsum.photos/400/400?random=1',
        description: 'Test product for import functionality',
        status: 'In Stock',
        shipping_free: true,
        rating_average: 4.5,
        rating_count: 123,
        kogan_first: true,
        monitoring_enabled: true,
        last_updated: new Date().toISOString(),
        created_at: new Date().toISOString()
      },
      {
        user_id: userId,
        sku: `TEST${Date.now()}002`,
        name: 'Apple Test Laptop',
        brand: 'Apple',
        category: 'Computing',
        price_current: 1599.99,
        source_url: 'https://www.kogan.com/au/buy/test-product-2/',
        image_url: 'https://picsum.photos/400/400?random=2',
        description: 'Test laptop for import functionality',
        status: 'In Stock',
        shipping_free: false,
        rating_average: 4.8,
        rating_count: 89,
        kogan_first: false,
        monitoring_enabled: true,
        last_updated: new Date().toISOString(),
        created_at: new Date().toISOString()
      }
    ]

    // Insert test products
    const { data: insertedProducts, error } = await supabase
      .from('kogan_products')
      .insert(testProducts)
      .select()

    if (error) {
      throw error
    }

    res.status(200).json({
      success: true,
      message: 'Test products created successfully',
      products: insertedProducts,
      count: insertedProducts?.length || 0
    })

  } catch (error) {
    console.error('Test import error:', error)
    res.status(500).json({
      error: 'Test import failed',
      message: error.message
    })
  }
}
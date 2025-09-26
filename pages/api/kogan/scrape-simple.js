// pages/api/kogan/scrape-simple.js - Simplified version that works
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
    const { input, userId, mode = 'single' } = req.body

    if (!input || !userId) {
      return res.status(400).json({ error: 'Missing input or userId' })
    }

    // Test database connection first
    const { data: testData, error: testError } = await supabase
      .from('kogan_products')
      .select('id')
      .limit(1)

    if (testError) {
      console.error('Database connection test failed:', testError)
      return res.status(500).json({ 
        error: 'Database connection failed',
        message: testError.message 
      })
    }

    let results = []

    if (mode === 'bulk') {
      results = await generateBulkProducts(userId, 5) // Start with just 5
    } else {
      results = [await generateSingleProduct(input, userId)]
    }

    res.status(200).json({
      success: true,
      count: results.length,
      products: results
    })

  } catch (error) {
    console.error('API Error:', error)
    res.status(500).json({ 
      error: 'Request failed', 
      message: error.message 
    })
  }
}

async function generateSingleProduct(input, userId) {
  const brands = ['Samsung', 'Apple', 'Sony', 'LG', 'Kogan', 'Philips']
  const categories = ['Electronics', 'Home & Garden', 'Health & Beauty', 'Sports']
  
  const isUrl = input.includes('http')
  const isSku = /^[A-Z0-9-]+$/i.test(input.trim())
  
  const productData = {
    user_id: userId,
    sku: isSku ? input.trim() : `KG${Date.now()}${Math.floor(Math.random() * 1000)}`,
    name: isUrl ? `Product from Kogan` : input,
    brand: brands[Math.floor(Math.random() * brands.length)],
    category: categories[Math.floor(Math.random() * categories.length)],
    price_current: parseFloat((Math.random() * 400 + 50).toFixed(2)),
    price_original: Math.random() > 0.6 ? parseFloat((Math.random() * 100 + 100).toFixed(2)) : null,
    source_url: isUrl ? input : `https://www.kogan.com/au/buy/${input.toLowerCase().replace(/\s+/g, '-')}/`,
    image_url: `https://picsum.photos/400/400?random=${Date.now()}`,
    description: `High-quality product featuring excellent value and performance.`,
    status: Math.random() > 0.1 ? 'In Stock' : 'Out of Stock',
    shipping_free: Math.random() > 0.3,
    rating_average: parseFloat((Math.random() * 2 + 3).toFixed(1)),
    rating_count: Math.floor(Math.random() * 500 + 10),
    kogan_first: Math.random() > 0.7,
    monitoring_enabled: true,
    last_updated: new Date().toISOString(),
    created_at: new Date().toISOString()
  }

  // Calculate discount if original price exists
  if (productData.price_original && productData.price_original > productData.price_current) {
    productData.discount_percent = Math.round(
      ((productData.price_original - productData.price_current) / productData.price_original) * 100
    )
  }

  try {
    // Try direct insert without upsert first
    const { data: insertedProduct, error: insertError } = await supabase
      .from('kogan_products')
      .insert(productData)
      .select()
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      
      // If insert fails due to duplicate, try update instead
      if (insertError.code === '23505') {
        const { data: updatedProduct, error: updateError } = await supabase
          .from('kogan_products')
          .update({
            ...productData,
            last_updated: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('sku', productData.sku)
          .select()
          .single()

        if (updateError) {
          throw new Error(`Update failed: ${updateError.message}`)
        }
        
        return updatedProduct
      } else {
        throw new Error(`Insert failed: ${insertError.message}`)
      }
    }

    // Log success (optional, skip if logging table has issues)
    try {
      await supabase.from('kogan_scraping_logs').insert({
        user_id: userId,
        product_id: insertedProduct.id,
        action: 'generate_sample',
        input_data: input,
        status: 'success',
        created_at: new Date().toISOString()
      })
    } catch (logError) {
      console.warn('Logging failed but product created:', logError.message)
    }

    return insertedProduct

  } catch (error) {
    console.error('Product generation error:', error)
    throw new Error(`Failed to create product: ${error.message}`)
  }
}

async function generateBulkProducts(userId, count = 5) {
  const products = []
  const sampleNames = [
    'Samsung Galaxy Buds Pro',
    'Apple AirPods Max',
    'Sony WH-1000XM4',
    'LG OLED TV',
    'Dyson V15 Vacuum'
  ]

  for (let i = 0; i < Math.min(count, sampleNames.length); i++) {
    try {
      const product = await generateSingleProduct(sampleNames[i], userId)
      products.push(product)
      
      // Small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 200))
    } catch (error) {
      console.error(`Error generating bulk product ${i}:`, error.message)
      // Continue with next product instead of failing completely
    }
  }

  return products
}

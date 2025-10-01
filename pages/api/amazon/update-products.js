// pages/api/amazon/update-products.js - Bulk update API with real scraping
import { supabase } from '../../../lib/supabase'
import { scrapeAmazonProduct } from '../../../lib/amazonScraper'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { 
      userId,
      country = 'AU',
      limit = 50,
      targetStatus = 'all' // 'all', 'in_stock', 'out_of_stock', 'limited_stock'
    } = req.body

    if (!userId) {
      return res.status(400).json({ 
        error: 'userId required' 
      })
    }

    console.log(`[BULK-UPDATE] Starting for user ${userId}`)

    // Get products to update
    let query = supabase
      .from('products')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .lt('scrape_errors', 10)
      .order('last_scraped', { ascending: true })
      .limit(limit)

    // Filter by stock status if specified
    if (targetStatus !== 'all') {
      query = query.eq('stock_status', 
        targetStatus === 'in_stock' ? 'In Stock' :
        targetStatus === 'out_of_stock' ? 'Out of Stock' :
        'Limited Stock'
      )
    }

    const { data: products, error } = await query

    if (error) throw error

    if (!products || products.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No products to update',
        stats: {
          total: 0,
          updated: 0,
          failed: 0,
          priceChanges: 0,
          stockChanges: 0
        }
      })
    }

    console.log(`[BULK-UPDATE] Found ${products.length} products to update`)

    const stats = {
      total: products.length,
      updated: 0,
      failed: 0,
      priceChanges: 0,
      stockChanges: 0,
      errors: []
    }

    // Process in batches of 5 to avoid rate limits
    const batchSize = 5
    const batches = []
    for (let i = 0; i < products.length; i += batchSize) {
      batches.push(products.slice(i, i + batchSize))
    }

    for (const batch of batches) {
      const promises = batch.map(async (product) => {
        try {
          console.log(`[UPDATE] Scraping ${product.supplier_asin}`)
          
          // Scrape fresh data
          const scrapedData = await scrapeAmazonProduct(product.supplier_asin, country)
          
          if (!scrapedData || !scrapedData.title) {
            throw new Error('No valid data returned')
          }

          // Detect changes
          const priceChanged = product.supplier_price !== scrapedData.supplier_price
          const stockChanged = product.stock_status !== scrapedData.stock_status

          if (priceChanged) stats.priceChanges++
          if (stockChanged) stats.stockChanges++

          // Update product
          const { error: updateError } = await supabase
            .from('products')
            .update({
              title: scrapedData.title,
              brand: scrapedData.brand,
              category: scrapedData.category,
              supplier_price: scrapedData.supplier_price,
              our_price: scrapedData.our_price,
              currency: scrapedData.currency,
              stock_status: scrapedData.stock_status,
              stock_quantity: scrapedData.stock_quantity,
              rating_average: scrapedData.rating_average,
              rating_count: scrapedData.rating_count,
              image_urls: scrapedData.image_urls,
              description: scrapedData.description,
              features: scrapedData.features,
              shipping_info: scrapedData.shipping_info,
              last_scraped: new Date().toISOString(),
              scrape_errors: 0,
              updated_at: new Date().toISOString()
            })
            .eq('id', product.id)

          if (updateError) throw updateError

          // Add price history if price changed
          if (priceChanged) {
            await supabase
              .from('price_history')
              .insert({
                product_id: product.id,
                supplier_price: scrapedData.supplier_price,
                our_price: scrapedData.our_price,
                stock_status: scrapedData.stock_status,
                recorded_at: new Date().toISOString()
              })
              .catch(err => console.warn('[PRICE-HISTORY] Failed:', err.message))
          }

          stats.updated++
          console.log(`[UPDATE] ✓ ${product.supplier_asin}`)

        } catch (error) {
          console.error(`[UPDATE] ✗ ${product.supplier_asin}:`, error.message)
          
          // Increment error count
          const newErrorCount = (product.scrape_errors || 0) + 1
          const shouldDeactivate = newErrorCount >= 10

          await supabase
            .from('products')
            .update({
              scrape_errors: newErrorCount,
              is_active: !shouldDeactivate,
              last_scraped: new Date().toISOString()
            })
            .eq('id', product.id)
            .catch(err => console.warn('[ERROR-UPDATE] Failed:', err.message))

          stats.failed++
          stats.errors.push({
            asin: product.supplier_asin,
            error: error.message,
            deactivated: shouldDeactivate
          })
        }
      })

      await Promise.all(promises)
      
      // Delay between batches
      if (batches.indexOf(batch) < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    console.log(`[BULK-UPDATE] Completed:`, stats)

    return res.status(200).json({
      success: true,
      message: `Updated ${stats.updated} of ${stats.total} products`,
      stats: stats,
      errors: stats.errors.length > 0 ? stats.errors.slice(0, 10) : undefined
    })

  } catch (error) {
    console.error('[BULK-UPDATE] Error:', error)
    
    return res.status(500).json({
      success: false,
      error: 'Bulk update failed',
      message: error.message
    })
  }
}
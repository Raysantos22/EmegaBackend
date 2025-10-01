// pages/api/amazon/update-hourly.js - Fixed with category handling
import { supabase } from '../../../lib/supabase'
import { scrapeAmazonProduct, scrapeAmazonProductWithVariants, calculateStockSummary } from '../../../lib/amazonScraper'

const cancelFlags = new Map()

export default async function handler(req, res) {
  if (req.method === 'DELETE') {
    const { sessionId } = req.body
    if (sessionId) {
      cancelFlags.set(sessionId, true)
      console.log(`[CANCEL-UPDATE] Session ${sessionId} marked for cancellation`)
      
      await supabase
        .from('update_sessions')
        .update({ 
          status: 'cancelled',
          completed_at: new Date().toISOString()
        })
        .eq('id', sessionId)
      
      return res.status(200).json({ success: true, message: 'Update cancelled' })
    }
    return res.status(400).json({ error: 'Session ID required' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { 
      userId,
      limit = 50,
      country = 'AU',
      fetchVariants = true,
      accurateStock = true,
      maxVariants = 999
    } = req.body

    if (!userId) {
      return res.status(400).json({ error: 'userId required' })
    }

    console.log('[UPDATE-ALL] Starting bulk update...')

    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .lt('scrape_errors', 10)
      .order('last_scraped', { ascending: true })
      .limit(limit)

    if (error) throw error

    if (!products || products.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No products to update',
        stats: { total: 0, updated: 0, failed: 0 }
      })
    }

    const { data: session, error: sessionError } = await supabase
      .from('update_sessions')
      .insert({
        user_id: userId,
        total_products: products.length,
        status: 'running',
        started_at: new Date().toISOString()
      })
      .select()
      .single()

    if (sessionError) {
      console.error('[SESSION-ERROR]:', sessionError)
      throw new Error(`Failed to create update session: ${sessionError.message}`)
    }

    cancelFlags.set(session.id, false)

    processUpdateBatch(userId, products, session.id, country, {
      fetchVariants,
      accurateStock,
      maxVariants
    }).catch(error => console.error('[UPDATE-ALL] Error:', error))

    return res.status(200).json({
      success: true,
      message: `Update started for ${products.length} products`,
      sessionId: session.id,
      totalProducts: products.length
    })

  } catch (error) {
    console.error('[UPDATE-ALL] Error:', error)
    return res.status(500).json({
      success: false,
      error: 'Bulk update failed',
      message: error.message
    })
  }
}

async function logUpdateActivity(sessionId, asin, status, message, productId = null) {
  try {
    await supabase
      .from('update_logs')
      .insert({
        batch_id: sessionId,
        product_id: productId,
        action: status,
        error_message: status === 'error' ? message : null,
        created_at: new Date().toISOString()
      })
  } catch (error) {
    console.warn('[LOG] Failed to log activity:', error.message)
  }
}

async function processUpdateBatch(userId, products, sessionId, country, options) {
  const stats = {
    processed: 0,
    updated: 0,
    failed: 0,
    errors: []
  }

  try {
    const batchSize = 10
    const totalBatches = Math.ceil(products.length / batchSize)

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      if (cancelFlags.get(sessionId)) {
        console.log(`[UPDATE-ALL] Session ${sessionId} cancelled`)
        await supabase
          .from('update_sessions')
          .update({
            status: 'cancelled',
            completed_at: new Date().toISOString(),
            processed_products: stats.processed,
            updated_products: stats.updated,
            failed_products: stats.failed
          })
          .eq('id', sessionId)
        cancelFlags.delete(sessionId)
        return
      }

      const batchStart = batchIndex * batchSize
      const batchEnd = Math.min(batchStart + batchSize, products.length)
      const batch = products.slice(batchStart, batchEnd)
      
      console.log(`[UPDATE-ALL] Batch ${batchIndex + 1}/${totalBatches}`)

      const promises = batch.map(async (product) => {
        try {
          await logUpdateActivity(sessionId, product.supplier_asin, 'processing', 'Scraping fresh data')
          
          let scrapedData
          if (options.fetchVariants) {
            scrapedData = await scrapeAmazonProductWithVariants(product.supplier_asin, country, {
              fetchVariants: true,
              maxVariants: options.maxVariants,
              accurateStock: options.accurateStock
            })
          } else {
            scrapedData = await scrapeAmazonProduct(product.supplier_asin, country)
          }
          
          if (!scrapedData || !scrapedData.title) {
            throw new Error('No valid data returned')
          }

          const metadata = scrapedData.metadata || {}
          delete scrapedData.metadata
          
          if (scrapedData.variants?.has_variations) {
            const stockSummary = calculateStockSummary(scrapedData.variants)
            metadata.stock_summary = stockSummary
          }

          const { error: updateError } = await supabase
            .from('products')
            .update({
              title: truncateString(scrapedData.title, 1000),
              brand: truncateString(scrapedData.brand, 500),
              category: typeof scrapedData.category === 'string' 
                ? truncateString(scrapedData.category, 500)
                : (scrapedData.category?.name ? truncateString(scrapedData.category.name, 500) : null),
              image_urls: Array.isArray(scrapedData.image_urls)
                ? scrapedData.image_urls.map(url => truncateString(url, 1000))
                : scrapedData.image_urls,
              description: truncateString(scrapedData.description, 5000),
              features: Array.isArray(scrapedData.features) 
                ? scrapedData.features.map(f => truncateString(f, 500))
                : scrapedData.features,
              supplier_price: scrapedData.supplier_price,
              our_price: scrapedData.our_price,
              currency: truncateString(scrapedData.currency, 3),
              stock_status: truncateString(scrapedData.stock_status, 50),
              stock_quantity: scrapedData.stock_quantity,
              rating_average: scrapedData.rating_average,
              rating_count: scrapedData.rating_count,
              shipping_info: cleanShippingInfo(scrapedData.shipping_info),
              variants: cleanVariants(scrapedData.variants),
              metadata: metadata,
              last_scraped: new Date().toISOString(),
              scrape_errors: 0,
              updated_at: new Date().toISOString()
            })
            .eq('id', product.id)

          if (updateError) throw updateError

          if (product.supplier_price !== scrapedData.supplier_price) {
            await supabase
              .from('price_history')
              .insert({
                product_id: product.id,
                supplier_price: scrapedData.supplier_price,
                our_price: scrapedData.our_price,
                stock_status: scrapedData.stock_status,
                recorded_at: new Date().toISOString()
              })
              .catch(err => console.warn('[PRICE-HISTORY]:', err.message))
          }

          stats.processed++
          stats.updated++
          await logUpdateActivity(sessionId, product.supplier_asin, 'success', 'Updated', product.id)
          console.log(`[UPDATE] ✓ ${product.supplier_asin}`)

        } catch (error) {
          console.error(`[UPDATE] ✗ ${product.supplier_asin}:`, error.message)
          
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
            .catch(err => console.warn('[ERROR-UPDATE]:', err.message))

          stats.processed++
          stats.failed++
          stats.errors.push({
            asin: product.supplier_asin,
            error: error.message.substring(0, 100)
          })
          await logUpdateActivity(sessionId, product.supplier_asin, 'error', error.message.substring(0, 255))
        }
      })

      await Promise.all(promises)
      
      await supabase
        .from('update_sessions')
        .update({
          processed_products: stats.processed,
          updated_products: stats.updated,
          failed_products: stats.failed
        })
        .eq('id', sessionId)

      if (batchIndex < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    await supabase
      .from('update_sessions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        processed_products: stats.processed,
        updated_products: stats.updated,
        failed_products: stats.failed
      })
      .eq('id', sessionId)

    cancelFlags.delete(sessionId)
    console.log('[UPDATE-ALL] Completed:', stats)

  } catch (error) {
    console.error('[UPDATE-ALL] Error:', error)
    
    await supabase
      .from('update_sessions')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error.message,
        processed_products: stats.processed,
        updated_products: stats.updated,
        failed_products: stats.failed
      })
      .eq('id', sessionId)
    
    cancelFlags.delete(sessionId)
  }
}

function truncateString(str, maxLength) {
  if (!str) return str
  if (typeof str !== 'string') return str
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength - 3) + '...'
}

function cleanShippingInfo(shippingInfo) {
  if (!shippingInfo || typeof shippingInfo !== 'object') return shippingInfo
  
  return Object.keys(shippingInfo).reduce((acc, key) => {
    const value = shippingInfo[key]
    acc[key] = typeof value === 'string' ? truncateString(value, 500) : value
    return acc
  }, {})
}

function cleanVariants(variants) {
  if (!variants || !variants.options || !Array.isArray(variants.options)) {
    return variants
  }
  
  return {
    ...variants,
    options: variants.options.map(variant => ({
      ...variant,
      asin: truncateString(variant.asin, 20),
      title: truncateString(variant.title, 500),
      value: truncateString(variant.value, 500),
      dimension_name: truncateString(variant.dimension_name, 200),
      image_url: truncateString(variant.image_url, 1000)
    }))
  }
}
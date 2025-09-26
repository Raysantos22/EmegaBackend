// pages/api/amazon/update-hourly.js - Optimized for 1M+ products
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { 
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'public' }
  }
)

// Configuration for large-scale processing
const CONFIG = {
  BATCH_SIZE: 100,           // Products per batch
  MAX_CONCURRENT: 20,        // Concurrent updates per batch
  BATCH_DELAY: 500,          // Delay between batches (ms)
  REQUEST_DELAY: 100,        // Delay between individual requests (ms)
  MAX_ERRORS_BEFORE_DEACTIVATE: 10,
  CHUNK_SIZE: 1000,          // Database query chunk size
  PROGRESS_UPDATE_INTERVAL: 50 // Update progress every N products
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed' 
    })
  }

  try {
    console.log('Starting hourly update process...')
    
    // Check if there's already a running update
    const { data: existingBatch } = await supabase
      .from('update_batches')
      .select('*')
      .eq('status', 'running')
      .single()

    if (existingBatch) {
      return res.status(409).json({
        success: false,
        error: 'Update already in progress',
        batchId: existingBatch.id
      })
    }

    // Get total count of active products
    const { count: totalProducts, error: countError } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)

    if (countError) {
      throw countError
    }

    console.log(`Found ${totalProducts} active products to update`)

    // Create update batch
    const { data: batch, error: batchError } = await supabase
      .from('update_batches')
      .insert({
        status: 'running',
        total_products: totalProducts,
        started_at: new Date().toISOString()
      })
      .select()
      .single()

    if (batchError) {
      throw batchError
    }

    console.log(`Created update batch ${batch.id}`)

    // Start background processing (don't await)
    processUpdatesInBackground(batch.id, totalProducts)
      .catch(error => {
        console.error('Background update error:', error)
      })

    return res.status(200).json({
      success: true,
      message: `Hourly update started for ${totalProducts} products`,
      batchId: batch.id,
      totalProducts
    })

  } catch (error) {
    console.error('Update initialization error:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to start update',
      message: error.message
    })
  }
}

async function processUpdatesInBackground(batchId, totalProducts) {
  const results = { 
    processed: 0, 
    updated: 0, 
    failed: 0, 
    deactivated: 0,
    priceChanges: 0,
    stockChanges: 0
  }

  const startTime = Date.now()
  console.log(`Starting background update processing for batch ${batchId}`)

  try {
    // Process products in chunks to handle large datasets efficiently
    const totalChunks = Math.ceil(totalProducts / CONFIG.CHUNK_SIZE)
    let offset = 0

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      console.log(`Processing chunk ${chunkIndex + 1}/${totalChunks}`)

      // Get products chunk (prioritize oldest first)
      const { data: products, error: fetchError } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('last_scraped', { ascending: true, nullsFirst: true })
        .range(offset, offset + CONFIG.CHUNK_SIZE - 1)

      if (fetchError) {
        console.error('Error fetching products chunk:', fetchError)
        break
      }

      if (!products || products.length === 0) {
        console.log('No more products to process')
        break
      }

      console.log(`Got ${products.length} products in chunk ${chunkIndex + 1}`)

      // Process chunk in batches
      const batchResults = await processProductsChunk(products, batchId)
      
      // Accumulate results
      results.processed += batchResults.processed
      results.updated += batchResults.updated
      results.failed += batchResults.failed
      results.deactivated += batchResults.deactivated
      results.priceChanges += batchResults.priceChanges
      results.stockChanges += batchResults.stockChanges

      // Update batch progress
      await updateBatchProgress(batchId, results)

      // Log progress
      const elapsed = (Date.now() - startTime) / 1000
      const rate = results.processed / elapsed
      const remaining = totalProducts - results.processed
      const eta = remaining / Math.max(rate, 0.1)

      console.log(`Progress: ${results.processed}/${totalProducts} (${Math.round(results.processed/totalProducts*100)}%) - Rate: ${rate.toFixed(1)}/s - ETA: ${Math.round(eta/60)}min`)

      offset += CONFIG.CHUNK_SIZE

      // Brief pause between chunks
      await new Promise(resolve => setTimeout(resolve, CONFIG.BATCH_DELAY))
    }

    // Mark batch as completed
    await supabase
      .from('update_batches')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        processed_products: results.processed,
        updated_products: results.updated,
        failed_products: results.failed
      })
      .eq('id', batchId)

    const totalTime = (Date.now() - startTime) / 1000
    console.log(`Update batch ${batchId} completed:`, {
      ...results,
      totalTimeSeconds: Math.round(totalTime),
      averageRate: (results.processed / totalTime).toFixed(2) + '/s'
    })

  } catch (error) {
    console.error(`Update batch ${batchId} failed:`, error)
    
    await supabase
      .from('update_batches')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error.message,
        processed_products: results.processed,
        updated_products: results.updated,
        failed_products: results.failed
      })
      .eq('id', batchId)
  }
}

async function processProductsChunk(products, batchId) {
  const chunkResults = { 
    processed: 0, 
    updated: 0, 
    failed: 0, 
    deactivated: 0,
    priceChanges: 0,
    stockChanges: 0
  }

  // Process products in smaller batches with concurrency control
  const totalBatches = Math.ceil(products.length / CONFIG.BATCH_SIZE)
  
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchStart = batchIndex * CONFIG.BATCH_SIZE
    const batchEnd = Math.min(batchStart + CONFIG.BATCH_SIZE, products.length)
    const batch = products.slice(batchStart, batchEnd)

    // Process batch with controlled concurrency
    const batchPromises = []
    for (let i = 0; i < batch.length; i += CONFIG.MAX_CONCURRENT) {
      const chunk = batch.slice(i, i + CONFIG.MAX_CONCURRENT)
      
      const chunkPromise = Promise.all(
        chunk.map(async (product, index) => {
          // Stagger requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, index * CONFIG.REQUEST_DELAY))
          return updateSingleProduct(product, batchId)
        })
      )
      
      batchPromises.push(chunkPromise)
    }

    // Wait for all chunks in this batch to complete
    const batchResponses = await Promise.all(batchPromises)
    
    // Process results
    for (const chunkResponses of batchResponses) {
      for (const result of chunkResponses) {
        chunkResults.processed++
        
        if (result.success) {
          if (result.updated) {
            chunkResults.updated++
          }
          if (result.priceChanged) {
            chunkResults.priceChanges++
          }
          if (result.stockChanged) {
            chunkResults.stockChanges++
          }
          if (result.deactivated) {
            chunkResults.deactivated++
          }
        } else {
          chunkResults.failed++
        }
      }
    }

    // Brief pause between batches
    await new Promise(resolve => setTimeout(resolve, CONFIG.BATCH_DELAY))
  }

  return chunkResults
}

async function updateSingleProduct(product, batchId) {
  try {
    // Simulate price and stock updates (in production, this would scrape Amazon)
    const updatedData = await simulateProductScraping(product)
    
    // Check if there are any changes
    const hasChanges = 
      updatedData.supplier_price !== product.supplier_price ||
      updatedData.stock_status !== product.stock_status ||
      updatedData.rating_average !== product.rating_average

    const result = {
      success: true,
      updated: hasChanges,
      priceChanged: updatedData.supplier_price !== product.supplier_price,
      stockChanged: updatedData.stock_status !== product.stock_status,
      deactivated: false
    }

    // Update product if changes detected
    if (hasChanges) {
      const { error: updateError } = await supabase
        .from('products')
        .update({
          supplier_price: updatedData.supplier_price,
          our_price: updatedData.our_price,
          stock_status: updatedData.stock_status,
          rating_average: updatedData.rating_average,
          rating_count: updatedData.rating_count,
          last_scraped: new Date().toISOString(),
          scrape_errors: 0 // Reset error count on successful update
        })
        .eq('id', product.id)

      if (updateError) throw updateError

      // Add price history if price changed
      if (result.priceChanged) {
        await supabase
          .from('price_history')
          .insert({
            product_id: product.id,
            supplier_price: updatedData.supplier_price,
            our_price: updatedData.our_price,
            stock_status: updatedData.stock_status,
            recorded_at: new Date().toISOString()
          })
          .catch(err => console.warn('Price history insert failed:', err))
      }

      // Log successful update
      await logUpdate(batchId, product.id, 'updated', {
        old_price: product.supplier_price,
        new_price: updatedData.supplier_price,
        old_stock: product.stock_status,
        new_stock: updatedData.stock_status
      })

    } else {
      // No changes, just update last_scraped timestamp
      await supabase
        .from('products')
        .update({
          last_scraped: new Date().toISOString(),
          scrape_errors: 0
        })
        .eq('id', product.id)

      await logUpdate(batchId, product.id, 'no_change')
    }

    return result

  } catch (error) {
    console.error(`Failed to update product ${product.internal_sku}:`, error.message)

    // Increment error count
    const newErrorCount = (product.scrape_errors || 0) + 1
    const shouldDeactivate = newErrorCount >= CONFIG.MAX_ERRORS_BEFORE_DEACTIVATE

    await supabase
      .from('products')
      .update({
        scrape_errors: newErrorCount,
        is_active: !shouldDeactivate,
        last_scraped: new Date().toISOString()
      })
      .eq('id', product.id)

    // Log error
    await logUpdate(batchId, product.id, shouldDeactivate ? 'deactivated' : 'error', {
      error_message: error.message.substring(0, 255)
    })

    return {
      success: false,
      updated: false,
      priceChanged: false,
      stockChanged: false,
      deactivated: shouldDeactivate
    }
  }
}

async function simulateProductScraping(product) {
  // Simulate realistic price fluctuations (±10%)
  const priceVariation = 0.9 + Math.random() * 0.2 // 0.9 to 1.1
  const newSupplierPrice = parseFloat((product.supplier_price * priceVariation).toFixed(2))
  const newOurPrice = parseFloat((newSupplierPrice * 1.2 + 0.30).toFixed(2))

  // Simulate occasional stock changes
  const stockOptions = ['In Stock', 'Limited Stock', 'Out of Stock']
  const newStockStatus = Math.random() < 0.05 ? // 5% chance of stock change
    stockOptions[Math.floor(Math.random() * stockOptions.length)] :
    product.stock_status

  // Simulate minor rating changes
  const newRatingAverage = product.rating_average + (Math.random() - 0.5) * 0.2
  const clampedRating = Math.max(1.0, Math.min(5.0, parseFloat(newRatingAverage.toFixed(1))))

  // Simulate rating count increases
  const ratingIncrease = Math.floor(Math.random() * 10) // 0-9 new ratings
  const newRatingCount = (product.rating_count || 0) + ratingIncrease

  return {
    supplier_price: newSupplierPrice,
    our_price: newOurPrice,
    stock_status: newStockStatus,
    rating_average: clampedRating,
    rating_count: newRatingCount
  }
}

async function updateBatchProgress(batchId, results) {
  try {
    await supabase
      .from('update_batches')
      .update({
        processed_products: results.processed,
        updated_products: results.updated,
        failed_products: results.failed
      })
      .eq('id', batchId)
  } catch (error) {
    console.warn('Failed to update batch progress:', error.message)
  }
}

async function logUpdate(batchId, productId, action, details = {}) {
  try {
    await supabase
      .from('update_logs')
      .insert({
        batch_id: batchId,
        product_id: productId,
        action,
        old_price: details.old_price || null,
        new_price: details.new_price || null,
        old_stock: details.old_stock || null,
        new_stock: details.new_stock || null,
        error_message: details.error_message || null,
        created_at: new Date().toISOString()
      })
  } catch (error) {
    console.warn('Failed to log update:', error.message)
  }
}
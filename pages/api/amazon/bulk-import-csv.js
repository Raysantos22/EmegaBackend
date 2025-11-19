// pages/api/amazon/bulk-import-csv.js - Based on your working code with session tracking
import { createClient } from '@supabase/supabase-js'
import { scrapeAmazonProduct, scrapeAmazonProductWithVariants, calculateStockSummary } from '../../../lib/amazonScraper'
import axios from 'axios'

// ✅ Service role client for bypassing RLS
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// ========== LOGGING HELPERS ==========

async function logActivity(sessionId, asin, status, message, details = {}) {
  try {
    await supabase
      .from('import_logs')
      .insert({
        session_id: sessionId,
        asin: asin,
        status: status,
        message: message,
        details: details,
        created_at: new Date().toISOString()
      })
    
    console.log(`[LOG] ${status.toUpperCase()} - ${asin}: ${message}`)
  } catch (error) {
    console.error('Failed to log activity:', error.message)
  }
}

async function updateSessionProgress(sessionId, updates) {
  try {
    console.log(`[UPDATE ATTEMPT] Session ${sessionId}:`, updates)
    
    // ✅ Don't include updated_at - column doesn't exist in table
    const { data: updated, error } = await supabase
      .from('csv_import_sessions')
      .update(updates)
      .eq('id', sessionId)
      .select()
      .single()
    
    if (error) {
      console.error('[UPDATE ERROR]', error)
      return false
    }
    
    if (updated) {
      console.log(`[UPDATE SUCCESS] ${updated.processed_skus}/${updated.total_skus} (${Math.round((updated.processed_skus / updated.total_skus) * 100)}%)`)
      return true
    }
    
    console.warn('[UPDATE WARNING] No data returned')
    return false
  } catch (error) {
    console.error('[UPDATE EXCEPTION]', error.message)
    return false
  }
}

// ========== MAIN HANDLER ==========

export default async function handler(req, res) {
  console.log('\n========== BULK IMPORT REQUEST START ==========')
  
  if (req.method === 'DELETE') {
    return handleCancelImport(req, res)
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let sessionId = null

  try {
    const { 
      csvData,
      products,
      userId, 
      country = 'AU', 
      fetchVariants = true,
      accurateStock = true,
      maxVariants = 999
    } = req.body

    if (!userId) {
      return res.status(400).json({ error: 'userId required' })
    }

    // Parse input
    let productsArray = []
    
    if (csvData && typeof csvData === 'string') {
      const lines = csvData
        .split(/[\r\n]+/)
        .map(line => line.trim())
        .filter(line => line.length > 0)
      
      productsArray = lines.map((line, index) => ({
        input: line,
        index: index
      }))
    } else if (products && Array.isArray(products)) {
      productsArray = products
    } else {
      return res.status(400).json({ error: 'csvData or products array required' })
    }

    if (productsArray.length === 0) {
      return res.status(400).json({ error: 'No products to import' })
    }

    // Create import session
    const { data: session, error: sessionError } = await supabase
      .from('csv_import_sessions')
      .insert({
        user_id: userId,
        total_skus: productsArray.length,
        processed_skus: 0,
        imported_products: 0,
        updated_products: 0,
        failed_skus: 0,
        status: 'running',
        started_at: new Date().toISOString()
      })
      .select()
      .single()

    if (sessionError) {
      throw new Error('Failed to create import session')
    }

    sessionId = session.id
    console.log(`[SESSION CREATED] ID: ${sessionId}, Total SKUs: ${productsArray.length}`)

    await logActivity(sessionId, 'SYSTEM', 'processing', `Import session started with ${productsArray.length} products`)

    // Return immediately
    res.status(200).json({
      success: true,
      sessionId: sessionId,
      totalSkus: productsArray.length,
      message: 'Import started in background'
    })

    // Process in background
    processProductsInBackground(sessionId, productsArray, userId, country, fetchVariants, accurateStock, maxVariants)

  } catch (error) {
    console.error('FATAL ERROR:', error.message)
    
    if (sessionId) {
      await updateSessionProgress(sessionId, {
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString()
      })
      await logActivity(sessionId, 'SYSTEM', 'error', `Fatal error: ${error.message}`)
    }

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Bulk import failed',
        message: error.message
      })
    }
  }
}

// ========== BACKGROUND PROCESSOR ==========

async function processProductsInBackground(sessionId, productsArray, userId, country, fetchVariants, accurateStock, maxVariants) {
  let processed = 0
  let imported = 0
  let updated = 0
  let failed = 0

  try {
    const shouldContinue = async () => {
      const { data } = await supabase
        .from('csv_import_sessions')
        .select('status')
        .eq('id', sessionId)
        .single()
      return data?.status === 'running'
    }

    for (let i = 0; i < productsArray.length; i++) {
      // Check cancellation
      if (!(await shouldContinue())) {
        console.log('[CANCELLED] Import session cancelled by user')
        await logActivity(sessionId, 'SYSTEM', 'error', 'Import cancelled by user')
        break
      }

      const productInput = productsArray[i]
      const input = productInput.asin || productInput.url || productInput.input

      await logActivity(sessionId, input || 'UNKNOWN', 'processing', `Processing ${i + 1}/${productsArray.length}`)

      if (!input) {
        failed++
        processed++
        await logActivity(sessionId, 'UNKNOWN', 'skipped', 'No ASIN or URL provided', { index: i })
        
        await updateSessionProgress(sessionId, {
          processed_skus: processed,
          imported_products: imported,
          updated_products: updated,
          failed_skus: failed
        })
        continue
      }

      try {
        // Extract ASIN
        await logActivity(sessionId, input, 'processing', 'Extracting ASIN...')
        const asin = await extractAsin(input)
        
        if (!asin) {
          failed++
          processed++
          await logActivity(sessionId, input, 'error', 'Invalid ASIN/URL format')
          
          await updateSessionProgress(sessionId, {
            processed_skus: processed,
            imported_products: imported,
            updated_products: updated,
            failed_skus: failed
          })
          continue
        }

        await logActivity(sessionId, asin, 'processing', 'ASIN extracted successfully')

        // Check if exists
        await logActivity(sessionId, asin, 'processing', 'Checking if product exists...')
        const { data: existing } = await supabase
          .from('products')
          .select('id')
          .eq('user_id', userId)
          .eq('supplier_asin', asin)
          .single()

        if (existing) {
          updated++
          processed++
          await logActivity(sessionId, asin, 'skipped', 'Product already exists', { productId: existing.id })
          
          await updateSessionProgress(sessionId, {
            processed_skus: processed,
            imported_products: imported,
            updated_products: updated,
            failed_skus: failed
          })
          continue
        }

        // Scrape product
        await logActivity(sessionId, asin, 'processing', 'Scraping product data from Amazon...')
        
        let scrapedData
        if (fetchVariants) {
          scrapedData = await scrapeAmazonProductWithVariants(asin, country, {
            fetchVariants: true,
            maxVariants: maxVariants,
            accurateStock: accurateStock
          })
        } else {
          scrapedData = await scrapeAmazonProduct(asin, country)
        }

        if (!scrapedData || !scrapedData.title) {
          failed++
          processed++
          await logActivity(sessionId, asin, 'error', 'No valid product data found')
          
          await updateSessionProgress(sessionId, {
            processed_skus: processed,
            imported_products: imported,
            updated_products: updated,
            failed_skus: failed
          })
          continue
        }

        await logActivity(sessionId, asin, 'processing', `Found: ${scrapedData.title.substring(0, 60)}...`)

        // Save product
        await logActivity(sessionId, asin, 'processing', 'Saving to database...')
        
        const productData = buildProductData(scrapedData, asin, userId, country)
        
        const { data: inserted, error: insertError } = await supabase
          .from('products')
          .insert(productData)
          .select()
          .single()

        if (insertError) {
          failed++
          processed++
          await logActivity(sessionId, asin, 'error', `Database error: ${insertError.message}`)
          
          await updateSessionProgress(sessionId, {
            processed_skus: processed,
            imported_products: imported,
            updated_products: updated,
            failed_skus: failed
          })
          continue
        }

        // Add price history
        await addPriceHistory(
          inserted.id, 
          scrapedData.supplier_price, 
          scrapedData.our_price, 
          scrapedData.stock_status
        )

        imported++
        processed++
        await logActivity(sessionId, asin, 'success', `Imported successfully (SKU: ${inserted.internal_sku})`, {
          productId: inserted.id,
          price: scrapedData.supplier_price
        })

        // ✅ Update progress with explicit await
        const updateResult = await updateSessionProgress(sessionId, {
          processed_skus: processed,
          imported_products: imported,
          updated_products: updated,
          failed_skus: failed
        })
        
        console.log(`[PROGRESS] ${processed}/${productsArray.length} - Imported: ${imported}, Skipped: ${updated}, Failed: ${failed}`)

        // Rate limiting
        if (i < productsArray.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }

      } catch (error) {
        failed++
        processed++
        await logActivity(sessionId, input, 'error', error.message)
        
        await updateSessionProgress(sessionId, {
          processed_skus: processed,
          imported_products: imported,
          updated_products: updated,
          failed_skus: failed
        })
      }
    }

    // Mark as completed
    console.log(`[COMPLETION] Marking session ${sessionId} as completed`)
    console.log(`[FINAL STATS] Processed: ${processed}, Imported: ${imported}, Skipped: ${updated}, Failed: ${failed}`)
    
    const completionUpdate = await updateSessionProgress(sessionId, {
      processed_skus: processed,
      imported_products: imported,
      updated_products: updated,
      failed_skus: failed,
      status: 'completed',
      completed_at: new Date().toISOString()
    })
    
    if (!completionUpdate) {
      console.error('[COMPLETION ERROR] Failed to mark session as completed')
    }

    await logActivity(sessionId, 'SYSTEM', 'success', `Import completed! Imported: ${imported}, Skipped: ${updated}, Failed: ${failed}`)

  } catch (error) {
    console.error('Background processing error:', error)
    await updateSessionProgress(sessionId, {
      status: 'failed',
      error_message: error.message,
      completed_at: new Date().toISOString()
    })
    await logActivity(sessionId, 'SYSTEM', 'error', `Background error: ${error.message}`)
  }
}

// ========== CANCEL HANDLER ==========

async function handleCancelImport(req, res) {
  try {
    const { sessionId } = req.body

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId required' })
    }

    await supabase
      .from('csv_import_sessions')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString()
      })
      .eq('id', sessionId)

    await logActivity(sessionId, 'SYSTEM', 'error', 'Import cancelled by user')

    return res.status(200).json({
      success: true,
      message: 'Import cancelled successfully'
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to cancel import',
      message: error.message
    })
  }
}

// ========== HELPER FUNCTIONS (from your working code) ==========

function buildProductData(scrapedData, asin, userId, country) {
  const metadata = scrapedData.metadata || {}
  delete scrapedData.metadata
  
  if (scrapedData.variants?.has_variations) {
    metadata.stock_summary = calculateStockSummary(scrapedData.variants)
  }

  const originalTitle = scrapedData.title
  const truncatedTitle = truncateString(scrapedData.title, 500)
  if (originalTitle.length > 500) {
    metadata.original_title = originalTitle
  }

  const cleanShippingInfo = cleanShippingInfoData(scrapedData.shipping_info)
  const cleanVariants = cleanVariantsData(scrapedData.variants)
  const internalSku = generateInternalSku(asin)

  return {
    user_id: userId,
    internal_sku: truncateString(internalSku, 50),
    supplier_sku: truncateString(asin, 255),
    supplier_asin: truncateString(asin, 20),
    supplier_url: truncateString(scrapedData.supplier_url || scrapedData.amazon_url, 1000),
    supplier_name: truncateString(scrapedData.supplier_name || `Amazon ${country}`, 50),
    amazon_url: truncateString(scrapedData.amazon_url, 1000),
    
    title: truncateString(truncatedTitle, 1000),
    brand: truncateString(scrapedData.brand, 500),
    category: truncateString(scrapedData.category, 500),
    image_urls: Array.isArray(scrapedData.image_urls)
      ? scrapedData.image_urls.map(url => truncateString(url, 1000))
      : scrapedData.image_urls,
    description: truncateString(scrapedData.description, 5000),
    features: Array.isArray(scrapedData.features) 
      ? scrapedData.features.map(f => truncateString(f, 500))
      : scrapedData.features,
    
    supplier_price: scrapedData.supplier_price,
    our_price: scrapedData.our_price,
    currency: truncateString(scrapedData.currency, 10),
    
    stock_status: truncateString(scrapedData.stock_status, 50),
    stock_quantity: scrapedData.stock_quantity,
    
    shipping_info: cleanShippingInfo,
    
    rating_average: scrapedData.rating_average,
    rating_count: scrapedData.rating_count,
    
    variants: cleanVariants,
    
    is_active: true,
    last_scraped: new Date().toISOString(),
    scrape_errors: 0,
    
    metadata: metadata,
    
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
}

async function extractAsin(input) {
  const trimmedInput = input.trim()
  
  if (/^[A-Z0-9]{10}$/i.test(trimmedInput)) {
    return trimmedInput.toUpperCase()
  }
  
  let urlToProcess = trimmedInput
  
  if (trimmedInput.match(/^https?:\/\//i)) {
    try {
      const response = await axios.get(trimmedInput, {
        maxRedirects: 10,
        validateStatus: (status) => status >= 200 && status < 400,
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      
      urlToProcess = response.request.res?.responseUrl || 
                     response.request?.path || 
                     response.config.url || 
                     trimmedInput
      
      if (response.data && typeof response.data === 'string') {
        const metaAsinMatch = response.data.match(/data-asin="([A-Z0-9]{10})"/i) ||
                             response.data.match(/asin["\s:]+([A-Z0-9]{10})/i)
        
        if (metaAsinMatch) {
          return metaAsinMatch[1].toUpperCase()
        }
      }
    } catch (error) {
      console.warn('Failed to fetch URL:', error.message)
    }
  }
  
  const asinPatterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/product\/([A-Z0-9]{10})/i,
    /asin=([A-Z0-9]{10})/i,
    /\/([A-Z0-9]{10})(?:\/|\?|$)/i
  ]
  
  for (const pattern of asinPatterns) {
    const match = urlToProcess.match(pattern)
    if (match) {
      return match[1].toUpperCase()
    }
  }
  
  return null
}

function truncateString(str, maxLength) {
  if (!str) return str
  if (typeof str !== 'string') return str
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength - 3) + '...'
}

function cleanShippingInfoData(shippingInfo) {
  if (!shippingInfo || typeof shippingInfo !== 'object') return shippingInfo
  
  return Object.keys(shippingInfo).reduce((acc, key) => {
    const value = shippingInfo[key]
    if (typeof value === 'string') {
      acc[key] = truncateString(value, 500)
    } else {
      acc[key] = value
    }
    return acc
  }, {})
}

function cleanVariantsData(variants) {
  if (!variants) return variants
  
  if (variants.options && Array.isArray(variants.options)) {
    variants.options = variants.options.map(variant => ({
      ...variant,
      asin: truncateString(variant.asin, 20),
      title: truncateString(variant.title, 500),
      value: truncateString(variant.value, 500),
      dimension_name: truncateString(variant.dimension_name, 200),
      image_url: truncateString(variant.image_url, 1000)
    }))
  }
  
  return variants
}

function generateInternalSku(asin) {
  const prefix = 'AMZ'
  const timestamp = Date.now().toString().slice(-6)
  return `${prefix}${asin}${timestamp}`
}

async function addPriceHistory(productId, supplierPrice, ourPrice, stockStatus) {
  try {
    await supabase
      .from('price_history')
      .insert({
        product_id: productId,
        supplier_price: supplierPrice,
        our_price: ourPrice,
        stock_status: stockStatus,
        recorded_at: new Date().toISOString()
      })
  } catch (error) {
    console.warn('Failed to add price history:', error.message)
  }
}
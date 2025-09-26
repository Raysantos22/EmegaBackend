// pages/api/amazon/bulk-import-csv.js - Updated with improved error handling
import { supabase } from '../../../lib/supabase'
import { scrapeAmazonProduct, rateLimiter } from '../../../lib/amazonScraper'
import Papa from 'papaparse'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { csvData, userId } = req.body

    if (!csvData || !userId) {
      return res.status(400).json({ 
        success: false,
        error: 'CSV data and userId required' 
      })
    }

    console.log('Starting CSV bulk import with real scraping for user:', userId)

    // Parse CSV data
    const validItems = parseAndValidateCsv(csvData)
    
    if (validItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid ASINs/SKUs found in CSV',
        message: 'CSV should contain valid 10-character Amazon ASINs or SKUs'
      })
    }

    console.log(`Found ${validItems.length} valid ASINs to import`)

    // Create import session
    const { data: session, error: sessionError } = await supabase
      .from('csv_import_sessions')
      .insert({
        user_id: userId,
        total_skus: validItems.length,
        status: 'running',
        started_at: new Date().toISOString()
      })
      .select()
      .single()

    if (sessionError) {
      console.error('Session creation error:', sessionError)
      throw new Error('Failed to create import session')
    }

    console.log('Created import session:', session.id)

    // Start background processing (don't await)
    processCsvImportWithScraping(userId, validItems, session.id)
      .catch(error => {
        console.error('Background processing error:', error)
      })

    return res.status(200).json({
      success: true,
      message: `CSV import started for ${validItems.length} ASINs with real Amazon AU scraping`,
      sessionId: session.id,
      totalSkus: validItems.length,
      estimatedTime: `${Math.ceil(validItems.length * 8 / 60)} minutes` // ~8 seconds per item with aggressive rate limiting
    })

  } catch (error) {
    console.error('CSV import error:', error)
    return res.status(500).json({
      success: false,
      error: 'CSV import failed',
      message: error.message
    })
  }
}

function parseAndValidateCsv(csvData) {
  const validItems = []
  const seenAsins = new Set()
  
  // Parse CSV with headers
  const parsed = Papa.parse(csvData, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_')
  })

  console.log(`Parsed ${parsed.data.length} rows from CSV`)

  // If no proper headers detected, try as simple list
  if (parsed.data.length > 0 && Object.keys(parsed.data[0]).length === 1) {
    const simpleParseData = Papa.parse(csvData, {
      header: false,
      skipEmptyLines: true
    })
    
    for (const row of simpleParseData.data) {
      if (row && row[0]) {
        const asin = extractValidAsin(row[0])
        if (asin && !seenAsins.has(asin)) {
          seenAsins.add(asin)
          validItems.push({ asin })
        }
      }
    }
  } else {
    // Process with headers
    for (const row of parsed.data) {
      if (row && typeof row === 'object') {
        const asin = extractAsinFromRow(row)
        if (asin && !seenAsins.has(asin)) {
          seenAsins.add(asin)
          validItems.push({ 
            asin,
            originalData: row 
          })
        }
      }
    }
  }
  
  console.log(`Extracted ${validItems.length} unique valid ASINs`)
  return validItems
}

function extractAsinFromRow(row) {
  // Try multiple column name variations for ASIN/SKU
  const possibleAsinFields = [
    'asin', 'sku', 'product_id', 'product_code', 'id', 'item_id',
    'amazon_asin', 'amazon_sku', 'supplier_sku', 'external_id',
    'product_asin', 'item_code', 'url', 'product_url'
  ]
  
  for (const field of possibleAsinFields) {
    if (row[field]) {
      const asin = extractValidAsin(row[field])
      if (asin) return asin
    }
  }
  
  return null
}

function extractValidAsin(value) {
  if (!value) return null
  
  const cleanValue = value.toString().trim()
  
  // Check if it's already a valid 10-character ASIN
  const asinPattern = /^[A-Z0-9]{10}$/
  if (asinPattern.test(cleanValue.toUpperCase())) {
    return cleanValue.toUpperCase()
  }
  
  // Try to extract ASIN from URL
  const asinPatterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /asin[=:]([A-Z0-9]{10})/i,
    /product\/([A-Z0-9]{10})/i
  ]
  
  for (const pattern of asinPatterns) {
    const match = cleanValue.match(pattern)
    if (match && match[1]) {
      return match[1].toUpperCase()
    }
  }
  
  return null
}

async function processCsvImportWithScraping(userId, itemList, sessionId) {
  const results = {
    processed: 0,
    imported: 0,
    updated: 0,
    failed: 0,
    errors: []
  }

  const startTime = Date.now()
  console.log(`Starting background processing of ${itemList.length} items for session ${sessionId}`)

  try {
    // Process items in smaller batches to handle rate limiting
    const batchSize = 3 // Much smaller batches due to strict API rate limits
    const totalBatches = Math.ceil(itemList.length / batchSize)

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStartIndex = batchIndex * batchSize
      const batchEndIndex = Math.min(batchStartIndex + batchSize, itemList.length)
      const batch = itemList.slice(batchStartIndex, batchEndIndex)
      
      console.log(`Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} items)`)

      // Process each item in batch sequentially (due to rate limiting)
      for (const item of batch) {
        try {
          const result = await importSingleItemWithScraping(item, userId)
          results.processed++
          
          if (result.isNew) {
            results.imported++
          } else {
            results.updated++
          }

          console.log(`✓ Processed ${item.asin}: ${result.isNew ? 'Imported' : 'Updated'}`)
          
        } catch (error) {
          console.error(`✗ Failed to import item ${item.asin}:`, error.message)
          results.failed++
          results.processed++
          results.errors.push({
            asin: item.asin,
            error: error.message.substring(0, 255)
          })
          
          // If we're getting rate limited, add extra delay
          if (error.message.includes('429') || error.message.includes('Too many requests')) {
            console.log('Rate limit detected, adding extra 10s delay...')
            await new Promise(resolve => setTimeout(resolve, 10000))
          }
        }

        // Update progress every 3 items
        if (results.processed % 3 === 0) {
          await updateSessionProgress(sessionId, results)
        }
      }

      // Add delay between batches to respect rate limits
      if (batchIndex < totalBatches - 1) {
        console.log('Waiting 5s between batches...')
        await new Promise(resolve => setTimeout(resolve, 5000))
      }

      // Log progress every 2 batches
      if ((batchIndex + 1) % 2 === 0) {
        const elapsed = (Date.now() - startTime) / 1000
        const rate = results.processed / elapsed
        const remaining = itemList.length - results.processed
        const eta = remaining / Math.max(rate, 0.1)
        
        console.log(`Progress: ${results.processed}/${itemList.length} (${Math.round(results.processed/itemList.length*100)}%) - Rate: ${rate.toFixed(2)}/s - ETA: ${Math.round(eta/60)}min`)
      }
    }

    // Final session update
    await supabase
      .from('csv_import_sessions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        processed_skus: results.processed,
        imported_products: results.imported,
        updated_products: results.updated,
        failed_skus: results.failed,
        error_details: results.errors.length > 0 ? results.errors.slice(0, 50) : null
      })
      .eq('id', sessionId)

    const elapsed = (Date.now() - startTime) / 1000
    console.log(`✅ CSV import completed for session ${sessionId}:`, {
      ...results,
      timeElapsed: `${Math.round(elapsed)}s`,
      rate: `${(results.processed / elapsed).toFixed(2)}/s`
    })

  } catch (error) {
    console.error('❌ CSV import background error:', error)
    
    await supabase
      .from('csv_import_sessions')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error.message,
        processed_skus: results.processed,
        imported_products: results.imported,
        updated_products: results.updated,
        failed_skus: results.failed
      })
      .eq('id', sessionId)
  }
}

async function importSingleItemWithScraping(item, userId) {
  const asin = item.asin
  console.log(`🔍 Importing ${asin} with real scraping...`)

  try {
    // Scrape product data from Amazon AU using the API
    const scrapedData = await scrapeAmazonProduct(asin)
    
    if (!scrapedData || !scrapedData.title) {
      throw new Error(`No valid product data found for ${asin}`)
    }

    // Calculate our price: supplier_price * 1.2 + 0.30
    const ourPrice = scrapedData.price ? 
      parseFloat((scrapedData.price * 1.2 + 0.30).toFixed(2)) : null
    
    // Check if product exists
    const { data: existing } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', userId)
      .eq('supplier_asin', asin)
      .single()

    const productPayload = {
      user_id: userId,
      supplier_sku: asin,
      supplier_asin: asin,
      supplier_url: scrapedData.url,
      supplier_name: 'Amazon AU',
      title: scrapedData.title,
      brand: scrapedData.brand,
      category: scrapedData.category,
      supplier_price: scrapedData.price,
      our_price: ourPrice,
      currency: scrapedData.currency,
      stock_status: scrapedData.stockStatus,
      rating_average: scrapedData.rating.average,
      rating_count: scrapedData.rating.count,
      image_urls: scrapedData.images,
      description: scrapedData.description,
      features: scrapedData.features,
      is_active: true,
      last_scraped: new Date().toISOString(),
      scrape_errors: 0,
      updated_at: new Date().toISOString()
    }

    let savedProduct
    let isNew = false

    if (existing) {
      // Update existing product
      const { data: updated, error } = await supabase
        .from('products')
        .update({
          ...productPayload,
          internal_sku: existing.internal_sku, // Keep existing SKU
          created_at: existing.created_at // Preserve creation date
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) {
        console.error('Supabase update error:', error)
        throw error
      }
      savedProduct = updated
      isNew = false

      // Add price history if price changed
      if (existing.supplier_price !== scrapedData.price) {
        await addPriceHistory(existing.id, scrapedData.price, ourPrice, scrapedData.stockStatus)
      }

    } else {
      // Insert new product
      const internalSku = generateInternalSku(asin)
      productPayload.internal_sku = internalSku
      productPayload.created_at = new Date().toISOString()
      
      const { data: inserted, error } = await supabase
        .from('products')
        .insert(productPayload)
        .select()
        .single()

      if (error) {
        console.error('Supabase insert error:', error)
        throw error
      }
      savedProduct = inserted
      isNew = true

      // Add initial price history
      await addPriceHistory(inserted.id, scrapedData.price, ourPrice, scrapedData.stockStatus)
    }

    return {
      ...savedProduct,
      isNew
    }

  } catch (error) {
    console.error(`❌ Error importing item ${asin}:`, error)
    throw new Error(`Import failed for ${asin}: ${error.message}`)
  }
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
    console.warn('⚠️ Failed to add price history:', error.message)
  }
}

async function updateSessionProgress(sessionId, results) {
  try {
    await supabase
      .from('csv_import_sessions')
      .update({
        processed_skus: results.processed,
        imported_products: results.imported,
        updated_products: results.updated,
        failed_skus: results.failed
      })
      .eq('id', sessionId)
  } catch (error) {
    console.warn('⚠️ Failed to update session progress:', error.message)
  }
}
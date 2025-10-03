// pages/api/amazon/bulk-import-csv.js - With extensive debugging logs
import { supabase } from '../../../lib/supabase'
import { scrapeAmazonProduct, scrapeAmazonProductWithVariants, calculateStockSummary } from '../../../lib/amazonScraper'
import axios from 'axios'

export default async function handler(req, res) {
  console.log('\n========== BULK IMPORT REQUEST START ==========')
  console.log('Method:', req.method)
  console.log('Headers:', JSON.stringify(req.headers, null, 2))
  console.log('Body type:', typeof req.body)
  console.log('Body keys:', req.body ? Object.keys(req.body) : 'null')
  console.log('Full body:', JSON.stringify(req.body, null, 2))
  
  if (req.method !== 'POST') {
    console.log('❌ Method not allowed:', req.method)
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { 
      csvData,   // String of URLs (one per line)
      products,  // Array of { asin/url, ... } (alternative format)
      userId, 
      country = 'AU', 
      fetchVariants = true,
      accurateStock = true,
      maxVariants = 999
    } = req.body

    console.log('\n--- Extracted Parameters ---')
    console.log('userId:', userId)
    console.log('country:', country)
    console.log('fetchVariants:', fetchVariants)
    console.log('accurateStock:', accurateStock)
    console.log('maxVariants:', maxVariants)
    console.log('csvData type:', typeof csvData)
    console.log('csvData length:', csvData?.length)
    console.log('products type:', typeof products)
    console.log('products is array:', Array.isArray(products))

    if (!userId) {
      console.log('❌ VALIDATION FAILED: userId missing')
      return res.status(400).json({ 
        error: 'userId required',
        details: 'userId parameter is missing from request body'
      })
    }

    // Parse csvData string into products array
    let productsArray = []
    
    if (csvData && typeof csvData === 'string') {
      console.log('→ Parsing csvData string...')
      // Split by newlines and filter out empty lines
      const lines = csvData
        .split(/[\r\n]+/)
        .map(line => line.trim())
        .filter(line => line.length > 0)
      
      console.log(`→ Found ${lines.length} lines in CSV`)
      
      productsArray = lines.map((line, index) => ({
        input: line,
        index: index
      }))
    } else if (products && Array.isArray(products)) {
      console.log('→ Using products array format')
      productsArray = products
    } else {
      console.log('❌ VALIDATION FAILED: No valid data format')
      return res.status(400).json({ 
        error: 'csvData or products array required',
        details: 'Provide either csvData (string) or products (array)'
      })
    }

    if (productsArray.length === 0) {
      console.log('❌ VALIDATION FAILED: No products to import')
      return res.status(400).json({ 
        error: 'No products to import',
        details: 'csvData is empty or contains no valid lines'
      })
    }

    console.log('\n✅ All validations passed')
    console.log(`[BULK-IMPORT] Starting bulk import of ${productsArray.length} products...`)
    console.log('First 3 products:', productsArray.slice(0, 3))

    const results = {
      success: [],
      failed: [],
      skipped: []
    }

    for (let i = 0; i < productsArray.length; i++) {
      const productInput = productsArray[i]
      console.log(`\n--- Processing Product ${i + 1}/${productsArray.length} ---`)
      console.log('Product input:', JSON.stringify(productInput, null, 2))
      
      const input = productInput.asin || productInput.url || productInput.input

      console.log('Extracted input:', input)

      if (!input) {
        console.log('⊘ Skipped: No ASIN or URL provided')
        results.skipped.push({
          index: i,
          reason: 'No ASIN or URL provided',
          data: productInput
        })
        continue
      }

      try {
        console.log(`[${i + 1}/${productsArray.length}] Processing: ${input}`)

        // Extract ASIN (handles short URLs too)
        console.log('→ Calling extractAsin...')
        const asin = await extractAsin(input)
        console.log('→ extractAsin result:', asin)
        
        if (!asin) {
          console.log('✗ Invalid ASIN/URL format')
          results.failed.push({
            index: i,
            input: input,
            error: 'Invalid ASIN or URL format'
          })
          continue
        }

        console.log(`✓ ASIN extracted: ${asin}`)

        // Check if already exists
        console.log('→ Checking if product exists...')
        const { data: existing, error: existingError } = await supabase
          .from('products')
          .select('*')
          .eq('user_id', userId)
          .eq('supplier_asin', asin)
          .single()

        if (existingError && existingError.code !== 'PGRST116') {
          console.log('⚠ Database check error:', existingError)
        }

        if (existing) {
          console.log(`⊘ Product already exists (ID: ${existing.id})`)
          results.skipped.push({
            index: i,
            asin: asin,
            reason: 'Product already exists',
            existingId: existing.id
          })
          continue
        }

        console.log('→ Product does not exist, proceeding with scrape...')

        // Scrape product data
        let scrapedData
        try {
          console.log(`→ Scraping with fetchVariants=${fetchVariants}, accurateStock=${accurateStock}`)
          
          if (fetchVariants) {
            scrapedData = await scrapeAmazonProductWithVariants(asin, country, {
              fetchVariants: true,
              maxVariants: maxVariants,
              accurateStock: accurateStock
            })
          } else {
            scrapedData = await scrapeAmazonProduct(asin, country)
          }
          
          console.log('→ Scraping successful')
          console.log('→ Title:', scrapedData.title?.substring(0, 50))
          console.log('→ Price:', scrapedData.supplier_price)
          
        } catch (scrapeError) {
          console.log('✗ Scraping failed:', scrapeError.message)
          console.log('Stack:', scrapeError.stack)
          results.failed.push({
            index: i,
            asin: asin,
            error: scrapeError.message
          })
          continue
        }

        if (!scrapedData || !scrapedData.title) {
          console.log('✗ No valid product data found')
          results.failed.push({
            index: i,
            asin: asin,
            error: 'No valid product data found'
          })
          continue
        }

        console.log('→ Preparing metadata...')
        
        // Prepare metadata
        const metadata = scrapedData.metadata || {}
        delete scrapedData.metadata
        
        if (scrapedData.variants?.has_variations) {
          const stockSummary = calculateStockSummary(scrapedData.variants)
          metadata.stock_summary = stockSummary
          console.log('→ Stock summary:', stockSummary)
        }

        // Store original title if truncated
        const originalTitle = scrapedData.title
        const truncatedTitle = truncateString(scrapedData.title, 500)
        if (originalTitle.length > 500) {
          metadata.original_title = originalTitle
          console.log(`→ Title truncated: ${originalTitle.length} → ${truncatedTitle.length}`)
        }

        console.log('→ Cleaning data...')
        
        // Clean data
        const cleanShippingInfo = cleanShippingInfoData(scrapedData.shipping_info)
        const cleanVariants = cleanVariantsData(scrapedData.variants)
        const internalSku = generateInternalSku(asin)

        console.log('→ Building product data...')
        
        // Build product data
        const productData = {
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

        console.log('→ Inserting into database...')
        console.log('→ Product data keys:', Object.keys(productData))
        
        // Insert product
        const { data: inserted, error } = await supabase
          .from('products')
          .insert(productData)
          .select()
          .single()

        if (error) {
          console.log('✗ Database insert failed:', error.message)
          console.log('Error details:', JSON.stringify(error, null, 2))
          results.failed.push({
            index: i,
            asin: asin,
            error: error.message
          })
          continue
        }

        console.log('✓ Database insert successful, ID:', inserted.id)
        console.log('→ Adding price history...')

        // Add price history
        await addPriceHistory(
          inserted.id, 
          scrapedData.supplier_price, 
          scrapedData.our_price, 
          scrapedData.stock_status
        )

        console.log('✓ Price history added')

        results.success.push({
          index: i,
          asin: asin,
          productId: inserted.id,
          title: scrapedData.title.substring(0, 50) + '...'
        })

        console.log(`✓ Successfully imported: ${inserted.internal_sku}`)

        // Rate limiting delay
        if (i < productsArray.length - 1) {
          console.log('→ Waiting 1s before next product...')
          await new Promise(resolve => setTimeout(resolve, 1000))
        }

      } catch (error) {
        console.log('✗ Unexpected error processing product:', error.message)
        console.log('Stack:', error.stack)
        results.failed.push({
          index: i,
          input: input,
          error: error.message
        })
      }
    }

    console.log('\n========== BULK IMPORT COMPLETE ==========')
    console.log(`Success: ${results.success.length}`)
    console.log(`Failed: ${results.failed.length}`)
    console.log(`Skipped: ${results.skipped.length}`)
    console.log('==========================================\n')

    res.status(200).json({
      success: true,
      message: `Bulk import completed: ${results.success.length} imported, ${results.failed.length} failed, ${results.skipped.length} skipped`,
      results: results,
      summary: {
        total: products.length,
        imported: results.success.length,
        failed: results.failed.length,
        skipped: results.skipped.length
      }
    })

  } catch (error) {
    console.log('\n❌ FATAL ERROR:', error.message)
    console.log('Stack:', error.stack)
    res.status(500).json({
      success: false,
      error: 'Bulk import failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}

// ========== HELPER FUNCTIONS ==========

async function extractAsin(input) {
  console.log('  [extractAsin] Input:', input)
  const trimmedInput = input.trim()
  
  // Direct ASIN input
  if (/^[A-Z0-9]{10}$/i.test(trimmedInput)) {
    console.log('  [extractAsin] Detected direct ASIN format')
    return trimmedInput.toUpperCase()
  }
  
  let urlToProcess = trimmedInput
  
  // Handle any URL (including shortened ones like amzn.to)
  if (trimmedInput.match(/^https?:\/\//i)) {
    console.log('  [extractAsin] Detected URL format, fetching...')
    try {
      const response = await axios.get(trimmedInput, {
        maxRedirects: 10,
        validateStatus: (status) => status >= 200 && status < 400,
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      })
      
      // Get the final URL after all redirects
      urlToProcess = response.request.res?.responseUrl || 
                     response.request?.path || 
                     response.config.url || 
                     trimmedInput
      
      console.log('  [extractAsin] Resolved to:', urlToProcess)
      
      // Also check the HTML content for ASIN
      if (response.data && typeof response.data === 'string') {
        const metaAsinMatch = response.data.match(/data-asin="([A-Z0-9]{10})"/i) ||
                             response.data.match(/asin["\s:]+([A-Z0-9]{10})/i)
        
        if (metaAsinMatch) {
          console.log('  [extractAsin] Found ASIN in page content:', metaAsinMatch[1])
          return metaAsinMatch[1].toUpperCase()
        }
      }
    } catch (error) {
      console.warn('  [extractAsin] Failed to fetch URL:', error.message)
    }
  }
  
  // Extract ASIN from URL patterns
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
      console.log('  [extractAsin] Extracted ASIN from pattern:', match[1])
      return match[1].toUpperCase()
    }
  }
  
  console.log('  [extractAsin] No ASIN found')
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
    console.warn('[addPriceHistory] Failed:', error.message)
  }
}
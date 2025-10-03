// pages/api/amazon/bulk-import-csv.js - Enhanced with affiliate link support
import { supabase } from '../../../lib/supabase'
import { scrapeAmazonProduct, scrapeAmazonProductWithVariants, calculateStockSummary } from '../../../lib/amazonScraper'
import axios from 'axios'

export default async function handler(req, res) {
  console.log('\n========== BULK IMPORT REQUEST START ==========')
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { 
      csvData,
      products,
      userId, 
      country = 'AU', 
      fetchVariants = true,
      accurateStock = true,
      maxVariants = 999,
      defaultStore = null
    } = req.body

    if (!userId) {
      return res.status(400).json({ 
        error: 'userId required',
        details: 'userId parameter is missing from request body'
      })
    }

    let productsArray = []
    
    if (csvData && typeof csvData === 'string') {
      console.log('→ Parsing CSV data...')
      productsArray = parseCSVData(csvData)
    } else if (products && Array.isArray(products)) {
      console.log('→ Using products array format')
      productsArray = products
    } else {
      return res.status(400).json({ 
        error: 'csvData or products array required',
        details: 'Provide either csvData (CSV format) or products (array)'
      })
    }

    if (productsArray.length === 0) {
      return res.status(400).json({ 
        error: 'No products to import',
        details: 'No valid products found in input'
      })
    }

    console.log(`✅ Starting bulk import of ${productsArray.length} products`)

    const results = {
      success: [],
      failed: [],
      skipped: []
    }

    for (let i = 0; i < productsArray.length; i++) {
      const productInput = productsArray[i]
      console.log(`\n--- Processing Product ${i + 1}/${productsArray.length} ---`)
      
      const {
        link,
        url,
        affiliateLink,
        sku: customSku,
        storeName: productStoreName
      } = productInput

      const inputLink = link || url || affiliateLink || productInput.input
      const storeName = productStoreName || defaultStore

      console.log('Input link:', inputLink)
      console.log('Store name:', storeName)

      if (!inputLink) {
        results.skipped.push({
          index: i,
          reason: 'No link provided',
          data: productInput
        })
        continue
      }

      try {
        console.log(`[${i + 1}] Processing: ${inputLink}`)

        const asin = await extractAsin(inputLink)
        
        if (!asin) {
          results.failed.push({
            index: i,
            input: inputLink,
            error: 'Could not extract ASIN from link'
          })
          continue
        }

        console.log(`✓ ASIN extracted: ${asin}`)

        const { data: existing } = await supabase
          .from('products')
          .select('*')
          .eq('user_id', userId)
          .eq('supplier_asin', asin)
          .single()

        let productId = null
        let isNewProduct = false

        if (existing) {
          console.log(`→ Product exists (ID: ${existing.id}), will link to store`)
          productId = existing.id
        } else {
          console.log('→ New product, scraping data...')
          
          let scrapedData
          try {
            if (fetchVariants) {
              scrapedData = await scrapeAmazonProductWithVariants(asin, country, {
                fetchVariants: true,
                maxVariants: maxVariants,
                accurateStock: accurateStock
              })
            } else {
              scrapedData = await scrapeAmazonProduct(asin, country)
            }
          } catch (scrapeError) {
            results.failed.push({
              index: i,
              asin: asin,
              error: `Scraping failed: ${scrapeError.message}`
            })
            continue
          }

          if (!scrapedData || !scrapedData.title) {
            results.failed.push({
              index: i,
              asin: asin,
              error: 'No valid product data found'
            })
            continue
          }

          const metadata = scrapedData.metadata || {}
          delete scrapedData.metadata
          
          if (scrapedData.variants?.has_variations) {
            const stockSummary = calculateStockSummary(scrapedData.variants)
            metadata.stock_summary = stockSummary
          }

          const originalTitle = scrapedData.title
          const truncatedTitle = truncateString(scrapedData.title, 500)
          if (originalTitle.length > 500) {
            metadata.original_title = originalTitle
          }

          const internalSku = customSku || generateInternalSku(asin)

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
            
            shipping_info: cleanShippingInfoData(scrapedData.shipping_info),
            
            rating_average: scrapedData.rating_average,
            rating_count: scrapedData.rating_count,
            
            variants: cleanVariantsData(scrapedData.variants),
            
            is_active: true,
            last_scraped: new Date().toISOString(),
            scrape_errors: 0,
            
            metadata: metadata,
            
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }

          const { data: inserted, error } = await supabase
            .from('products')
            .insert(productData)
            .select()
            .single()

          if (error) {
            results.failed.push({
              index: i,
              asin: asin,
              error: `Database insert failed: ${error.message}`
            })
            continue
          }

          productId = inserted.id
          isNewProduct = true

          await addPriceHistory(
            inserted.id, 
            scrapedData.supplier_price, 
            scrapedData.our_price, 
            scrapedData.stock_status
          )

          console.log('✓ Product imported successfully')
        }

        // Create affiliate link if store name provided
        console.log('→ Checking affiliate link creation:')
        console.log('  storeName:', storeName)
        console.log('  productId:', productId)
        
        if (storeName && productId) {
          console.log('→ Creating affiliate link...')
          await createOrUpdateAffiliateLink(
            userId,
            productId,
            storeName,
            inputLink,
            customSku || existing?.internal_sku
          )
          console.log(`✓ Affiliate link created for store: ${storeName}`)
        } else {
          console.log('⊘ Skipping affiliate link - missing storeName or productId')
        }

        results.success.push({
          index: i,
          asin: asin,
          productId: productId,
          isNew: isNewProduct,
          hasAffiliateLink: !!storeName,
          storeName: storeName
        })

        if (i < productsArray.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }

      } catch (error) {
        console.log('✗ Error processing product:', error.message)
        results.failed.push({
          index: i,
          input: inputLink,
          error: error.message
        })
      }
    }

    console.log('\n========== BULK IMPORT COMPLETE ==========')
    console.log(`Success: ${results.success.length}`)
    console.log(`Failed: ${results.failed.length}`)
    console.log(`Skipped: ${results.skipped.length}`)

    res.status(200).json({
      success: true,
      message: `Bulk import completed: ${results.success.length} imported, ${results.failed.length} failed, ${results.skipped.length} skipped`,
      results: results,
      summary: {
        total: productsArray.length,
        imported: results.success.length,
        failed: results.failed.length,
        skipped: results.skipped.length
      }
    })

  } catch (error) {
    console.log('\n❌ FATAL ERROR:', error.message)
    res.status(500).json({
      success: false,
      error: 'Bulk import failed',
      message: error.message
    })
  }
}

// ========== HELPER FUNCTIONS ==========

function parseCSVData(csvData) {
  const lines = csvData
    .split(/[\r\n]+/)
    .map(line => line.trim())
    .filter(line => line.length > 0)

  if (lines.length === 0) return []

  console.log(`→ Total lines: ${lines.length}`)
  console.log(`→ First line: ${lines[0]}`)

  const firstLine = lines[0].toLowerCase()
  const hasHeader = firstLine.includes('link') || 
                    firstLine.includes('url') || 
                    firstLine.includes('sku') ||
                    firstLine.includes('store') ||
                    firstLine.includes('asin')

  console.log(`→ Has header: ${hasHeader}`)

  let columnMap = {
    link: 0,
    sku: 1,
    store: 2
  }

  if (hasHeader) {
    const headers = lines[0].split(/[\t,]/).map(h => h.trim().toLowerCase())
    console.log(`→ Headers detected: ${JSON.stringify(headers)}`)
    
    headers.forEach((header, index) => {
      if (header.includes('link') || header.includes('url') || header.includes('asin')) {
        columnMap.link = index
        if (header.includes('sku')) {
          columnMap.sku = index
        }
      } else if (header.includes('sku') && columnMap.link !== index) {
        columnMap.sku = index
      }
      
      if (header.includes('store')) {
        columnMap.store = index
      }
    })
    
    console.log(`→ Column mapping: ${JSON.stringify(columnMap)}`)
  }

  const dataLines = hasHeader ? lines.slice(1) : lines

  return dataLines.map((line, index) => {
    const parts = line.split(/[\t,]/).map(p => p.trim())
    
    const result = {
      link: parts[columnMap.link] || parts[0] || null,
      sku: parts[columnMap.sku] || null,
      storeName: parts[columnMap.store] || null,
      index: index
    }
    
    if (index < 3) {
      console.log(`→ Parsed line ${index + 1}:`, JSON.stringify(result))
    }
    
    return result
  })
}

async function extractAsin(input) {
  console.log('  [extractAsin] Input:', input)
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
      
      console.log('  [extractAsin] Resolved to:', urlToProcess)
      
      if (response.data && typeof response.data === 'string') {
        const metaAsinMatch = response.data.match(/data-asin="([A-Z0-9]{10})"/i) ||
                             response.data.match(/asin["\s:]+([A-Z0-9]{10})/i)
        
        if (metaAsinMatch) {
          return metaAsinMatch[1].toUpperCase()
        }
      }
    } catch (error) {
      console.warn('  [extractAsin] Failed to fetch URL:', error.message)
    }
  }
  
  const asinPatterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/product\/([A-Z0-9]{10})/i,
    /asin=([A-Z0-9]{10})/i,
    /\/([A-Z0-9]{10})(?:\/|\?|$)/i,
    /tag=[^&]*&.*?([A-Z0-9]{10})/i
  ]
  
  for (const pattern of asinPatterns) {
    const match = urlToProcess.match(pattern)
    if (match) {
      return match[1].toUpperCase()
    }
  }
  
  return null
}

async function createOrUpdateAffiliateLink(userId, productId, storeName, affiliateUrl, internalSku) {
  try {
    let { data: store } = await supabase
      .from('stores')
      .select('*')
      .eq('user_id', userId)
      .eq('store_name', storeName)
      .eq('is_active', true)
      .single()

    if (!store) {
      const { data: newStore, error: storeError } = await supabase
        .from('stores')
        .insert({
          user_id: userId,
          store_name: storeName,
          is_active: true
        })
        .select()
        .single()

      if (storeError) throw storeError
      store = newStore
    }

    if (!internalSku) {
      const { data: product } = await supabase
        .from('products')
        .select('internal_sku')
        .eq('id', productId)
        .single()
      
      internalSku = product?.internal_sku
    }

    const { data: existing } = await supabase
      .from('affiliate_links')
      .select('*')
      .eq('user_id', userId)
      .eq('store_id', store.id)
      .eq('product_id', productId)
      .single()

    if (existing) {
      await supabase
        .from('affiliate_links')
        .update({
          affiliate_url: affiliateUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('affiliate_links')
        .insert({
          user_id: userId,
          store_id: store.id,
          product_id: productId,
          internal_sku: internalSku,
          affiliate_url: affiliateUrl,
          is_active: true
        })
    }

    console.log('  [createOrUpdateAffiliateLink] Success')
  } catch (error) {
    console.error('  [createOrUpdateAffiliateLink] Error:', error.message)
    throw error
  }
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
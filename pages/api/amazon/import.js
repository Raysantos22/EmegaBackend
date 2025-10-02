// pages/api/amazon/import.js - Fixed with title truncation
import { supabase } from '../../../lib/supabase'
import { scrapeAmazonProduct, scrapeAmazonProductWithVariants, calculateStockSummary } from '../../../lib/amazonScraper'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { 
      input, 
      userId, 
      country = 'AU', 
      fetchVariants = true,
      accurateStock = true,
      maxVariants = 999  
    } = req.body

    if (!input || !userId) {
      return res.status(400).json({ error: 'Input and userId required' })
    }

    console.log(`Importing Amazon ${country} product: ${input}`)

    const asin = extractAsin(input)
    if (!asin) {
      return res.status(400).json({ 
        error: 'Invalid input. Please provide a valid Amazon ASIN (10 characters) or URL.' 
      })
    }

    console.log(`Extracted ASIN: ${asin}`)

    const { data: existing } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', userId)
      .eq('supplier_asin', asin)
      .single()

    let scrapedData
    try {
      if (fetchVariants) {
        scrapedData = await scrapeAmazonProductWithVariants(asin, country, {
          fetchVariants: true,
          maxVariants: maxVariants,
          accurateStock: accurateStock
        })
        console.log(`Successfully scraped with variant data: ${scrapedData.title}`)
      } else {
        scrapedData = await scrapeAmazonProduct(asin, country)
        console.log(`Successfully scraped: ${scrapedData.title}`)
      }
    } catch (scrapeError) {
      console.error('Scraping failed:', scrapeError.message)
      return res.status(400).json({
        success: false,
        error: 'Failed to scrape product data',
        message: scrapeError.message,
        suggestions: [
          'Verify the ASIN is correct and exists on Amazon',
          'Check if the product is available in the selected country',
          'Try again in a few minutes if rate limited'
        ]
      })
    }

    if (!scrapedData || !scrapedData.title) {
      return res.status(400).json({
        success: false,
        error: 'No valid product data found',
        message: 'The product may not exist or be available in the selected country'
      })
    }

    const metadata = scrapedData.metadata || {}
    delete scrapedData.metadata
    if (scrapedData.variants?.has_variations) {
      const stockSummary = calculateStockSummary(scrapedData.variants)
      metadata.stock_summary = stockSummary
    }
    
    // Store original title in metadata if it was truncated
    const originalTitle = scrapedData.title
    const truncatedTitle = truncateString(scrapedData.title, 500)
    if (originalTitle.length > 500) {
      metadata.original_title = originalTitle
      console.log(`Title truncated from ${originalTitle.length} to ${truncatedTitle.length} characters`)
    }
    
    // Clean shipping_info to prevent varchar overflow
    let cleanShippingInfo = scrapedData.shipping_info
    if (cleanShippingInfo && typeof cleanShippingInfo === 'object') {
      console.log('Cleaning shipping_info...')
      cleanShippingInfo = Object.keys(cleanShippingInfo).reduce((acc, key) => {
        const value = cleanShippingInfo[key]
        if (typeof value === 'string') {
          console.log(`  - ${key}: ${value.length} chars`)
          acc[key] = truncateString(value, 500)
        } else {
          acc[key] = value
        }
        return acc
      }, {})
    }
    
    // Clean variants to prevent varchar overflow in variant data
    let cleanVariants = scrapedData.variants
    if (cleanVariants) {
      console.log('Variants structure:', JSON.stringify(cleanVariants, null, 2).substring(0, 1000))
      
      if (cleanVariants.options && Array.isArray(cleanVariants.options)) {
        console.log(`Cleaning ${cleanVariants.options.length} variants...`)
        cleanVariants.options = cleanVariants.options.map((variant, idx) => {
          const cleaned = {
            ...variant,
            asin: truncateString(variant.asin, 20),
            title: truncateString(variant.title, 500),
            value: truncateString(variant.value, 500),
            dimension_name: truncateString(variant.dimension_name, 200),
            image_url: truncateString(variant.image_url, 1000)
          }
          
          // Log if any field was too long
          if (variant.title?.length > 500) {
            console.log(`  - Variant ${idx} title: ${variant.title.length} chars (truncated)`)
          }
          if (variant.value?.length > 500) {
            console.log(`  - Variant ${idx} value: ${variant.value.length} chars (truncated)`)
          }
          if (variant.dimension_name?.length > 200) {
            console.log(`  - Variant ${idx} dimension_name: ${variant.dimension_name.length} chars (truncated)`)
          }
          
          return cleaned
        })
      }
    }
    
    const internalSku = generateInternalSku(asin)
    
    // Log all string field lengths for debugging
    console.log('Field lengths check:')
    console.log('- title:', truncatedTitle?.length)
    console.log('- brand:', scrapedData.brand?.length)
    console.log('- category:', scrapedData.category?.length)
    console.log('- supplier_url:', (scrapedData.supplier_url || scrapedData.amazon_url)?.length)
    console.log('- amazon_url:', scrapedData.amazon_url?.length)
    console.log('- supplier_name:', (scrapedData.supplier_name || `Amazon ${country}`)?.length)
    console.log('- stock_status:', scrapedData.stock_status?.length)
    console.log('- currency:', scrapedData.currency?.length)
    console.log('- internal_sku:', internalSku?.length)
    console.log('- existing internal_sku:', existing?.internal_sku?.length)
    
    // Check description and features
    if (typeof scrapedData.description === 'string') {
      console.log('- description (string):', scrapedData.description.length)
    } else {
      console.log('- description (object):', JSON.stringify(scrapedData.description)?.length)
    }
    
    if (Array.isArray(scrapedData.features)) {
      console.log('- features (array):', scrapedData.features.length, 'items')
      scrapedData.features.forEach((f, i) => {
        console.log(`  - feature[${i}]:`, typeof f === 'string' ? f.length : 'not string')
      })
    }
    
    if (Array.isArray(scrapedData.image_urls)) {
      console.log('- image_urls:', scrapedData.image_urls.length, 'items')
      scrapedData.image_urls.forEach((url, i) => {
        console.log(`  - image_url[${i}]:`, url?.length)
      })
    }
    
    const productData = {
      user_id: userId,
      internal_sku: truncateString(existing ? existing.internal_sku : internalSku, 50),
      supplier_sku: truncateString(asin, 255),
      supplier_asin: truncateString(asin, 20),
      supplier_url: truncateString(scrapedData.supplier_url || scrapedData.amazon_url, 1000),
      supplier_name: truncateString(scrapedData.supplier_name || `Amazon ${country}`, 50),
      amazon_url: truncateString(scrapedData.amazon_url, 1000),
      
      title: truncateString(truncatedTitle, 1000), // Extra safety
      brand: truncateString(scrapedData.brand, 500),
      category: truncateString(scrapedData.category, 500),
      image_urls: Array.isArray(scrapedData.image_urls)
        ? scrapedData.image_urls.map(url => truncateString(url, 1000))
        : scrapedData.image_urls,
      description: truncateString(scrapedData.description, 5000), // Truncate description too
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
      
      updated_at: new Date().toISOString()
    }

    let savedProduct
    let isUpdate = false

    // Final safety check - log all string fields before insert
    console.log('\n=== FINAL DATA CHECK BEFORE INSERT ===')
    Object.keys(productData).forEach(key => {
      const value = productData[key]
      if (typeof value === 'string') {
        console.log(`${key}: ${value.length} chars`)
        if (value.length > 500) {
          console.log(`  ⚠️  WARNING: ${key} exceeds 500 chars!`)
        }
      } else if (Array.isArray(value)) {
        console.log(`${key}: array with ${value.length} items`)
        value.forEach((item, idx) => {
          if (typeof item === 'string') {
            if (item.length > 500) {
              console.log(`  ⚠️  WARNING: ${key}[${idx}] = ${item.length} chars (exceeds 500)`)
            }
          }
        })
      } else if (value && typeof value === 'object') {
        console.log(`${key}: object with ${Object.keys(value).length} keys`)
        // Check for long strings in objects
        Object.keys(value).forEach(subKey => {
          const subValue = value[subKey]
          if (typeof subValue === 'string' && subValue.length > 500) {
            console.log(`  ⚠️  WARNING: ${key}.${subKey} = ${subValue.length} chars (exceeds 500)`)
          }
        })
      }
    })
    console.log('======================================\n')

    if (existing) {
      productData.created_at = existing.created_at
      
      const { data: updated, error } = await supabase
        .from('products')
        .update(productData)
        .eq('id', existing.id)
        .select()
        .single()

      if (error) throw error
      savedProduct = updated
      isUpdate = true

      if (existing.supplier_price !== scrapedData.supplier_price) {
        await addPriceHistory(
          existing.id, 
          scrapedData.supplier_price, 
          scrapedData.our_price, 
          scrapedData.stock_status
        )
      }

      console.log(`Updated existing product: ${savedProduct.internal_sku}`)
    } else {
      productData.created_at = new Date().toISOString()
      
      const { data: inserted, error } = await supabase
        .from('products')
        .insert(productData)
        .select()
        .single()

      if (error) throw error
      savedProduct = inserted

      await addPriceHistory(
        inserted.id, 
        scrapedData.supplier_price, 
        scrapedData.our_price, 
        scrapedData.stock_status
      )

      console.log(`Created new product: ${savedProduct.internal_sku}`)
    }

    const profit = scrapedData.our_price && scrapedData.supplier_price ? 
      (scrapedData.our_price - scrapedData.supplier_price).toFixed(2) : 0

    res.status(200).json({
      success: true,
      product: savedProduct,
      isUpdate: isUpdate,
      message: isUpdate ? 
        `Product updated successfully. Our price: $${scrapedData.our_price}` :
        `Product imported successfully. Our price: $${scrapedData.our_price}`,
      scrapingData: {
        supplierPrice: scrapedData.supplier_price,
        ourPrice: scrapedData.our_price,
        profit: profit,
        stockStatus: scrapedData.stock_status,
        stockQuantity: scrapedData.stock_quantity,
        rating: {
          average: scrapedData.rating_average,
          count: scrapedData.rating_count
        },
        hasVariants: scrapedData.variants?.has_variations || false,
        variantCount: scrapedData.variants?.count || 0,
        stockSummary: metadata?.stock_summary || null,
        accurateStockUsed: accurateStock,
        apiCallsUsed: accurateStock && scrapedData.variants?.has_variations ? 
          scrapedData.variants.count + 1 : 
          (fetchVariants && scrapedData.variants?.has_variations ? maxVariants + 1 : 1),
        apiUsed: 'RapidAPI Amazon Data Scraper',
        scrapedAt: scrapedData.last_scraped,
        titleTruncated: originalTitle.length > 500
      }
    })

  } catch (error) {
    console.error('Import error:', error)
    
    res.status(500).json({
      success: false,
      error: 'Import failed',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}

function truncateString(str, maxLength) {
  if (!str) return str
  if (typeof str !== 'string') return str
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength - 3) + '...'
}

function extractAsin(input) {
  const trimmedInput = input.trim()
  
  if (/^[A-Z0-9]{10}$/i.test(trimmedInput)) {
    return trimmedInput.toUpperCase()
  }
  
  const asinPatterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/product\/([A-Z0-9]{10})/i,
    /asin=([A-Z0-9]{10})/i,
    /\/([A-Z0-9]{10})(?:\/|\?|$)/i
  ]
  
  for (const pattern of asinPatterns) {
    const match = trimmedInput.match(pattern)
    if (match) {
      return match[1].toUpperCase()
    }
  }
  
  return null
}

function generateInternalSku(asin) {
  const prefix = 'AMZ'
  const timestamp = Date.now().toString().slice(-6)
  // AMZ (3) + ASIN (10) + timestamp (6) = 19 chars (well under 50 limit)
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
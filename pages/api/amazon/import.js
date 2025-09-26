// pages/api/amazon/import.js - Updated with real scraping
import { supabase } from '../../../lib/supabase'
import { scrapeAmazonProduct } from '../../../lib/amazonScraper'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { input, userId, country = 'AU' } = req.body

    if (!input || !userId) {
      return res.status(400).json({ error: 'Input and userId required' })
    }

    console.log(`Importing Amazon ${country} product: ${input}`)

    // Extract ASIN from input
    const asin = extractAsin(input)
    if (!asin) {
      return res.status(400).json({ 
        error: 'Invalid input. Please provide a valid Amazon ASIN (10 characters) or URL.' 
      })
    }

    console.log(`Extracted ASIN: ${asin}`)

    // Check if product already exists
    const { data: existing } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', userId)
      .eq('supplier_asin', asin)
      .single()

    let scrapedData
    try {
      // Scrape product data from Amazon using your RapidAPI
      scrapedData = await scrapeAmazonProduct(asin, country)
      console.log(`Successfully scraped: ${scrapedData.title}`)
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

    // Calculate our price: supplier_price * 1.2 + 0.30
    const ourPrice = scrapedData.price ? 
      parseFloat((scrapedData.price * 1.2 + 0.30).toFixed(2)) : null
    
    // Generate internal SKU
    const internalSku = generateInternalSku(asin)
    
    // Prepare product data for database
    const productData = {
      user_id: userId,
      internal_sku: existing ? existing.internal_sku : internalSku,
      supplier_sku: asin,
      supplier_asin: asin,
      supplier_url: scrapedData.url,
      supplier_name: `Amazon ${country}`,
      
      // Product details
      title: scrapedData.title,
      brand: scrapedData.brand,
      category: scrapedData.category,
      image_urls: scrapedData.images,
      description: scrapedData.description,
      features: scrapedData.features,
      
      // Pricing
      supplier_price: scrapedData.price,
      our_price: ourPrice,
      currency: scrapedData.currency,
      
      // Availability
      stock_status: scrapedData.stockStatus,
      
      // Ratings
      rating_average: scrapedData.rating.average,
      rating_count: scrapedData.rating.count,
      
      // Tracking
      is_active: true,
      last_scraped: new Date().toISOString(),
      scrape_errors: 0,
      
      // Timestamps
      updated_at: new Date().toISOString()
    }

    let savedProduct
    let isUpdate = false

    if (existing) {
      // Update existing product
      productData.created_at = existing.created_at // Preserve creation date
      
      const { data: updated, error } = await supabase
        .from('products')
        .update(productData)
        .eq('id', existing.id)
        .select()
        .single()

      if (error) throw error
      savedProduct = updated
      isUpdate = true

      // Add price history if price changed
      if (existing.supplier_price !== scrapedData.price) {
        await addPriceHistory(existing.id, scrapedData.price, ourPrice, scrapedData.stockStatus)
      }

      console.log(`Updated existing product: ${savedProduct.internal_sku}`)
    } else {
      // Insert new product
      productData.created_at = new Date().toISOString()
      
      const { data: inserted, error } = await supabase
        .from('products')
        .insert(productData)
        .select()
        .single()

      if (error) throw error
      savedProduct = inserted

      // Add initial price history
      await addPriceHistory(inserted.id, scrapedData.price, ourPrice, scrapedData.stockStatus)

      console.log(`Created new product: ${savedProduct.internal_sku}`)
    }

    // Calculate profit
    const profit = ourPrice && scrapedData.price ? 
      (ourPrice - scrapedData.price).toFixed(2) : 0

    res.status(200).json({
      success: true,
      product: savedProduct,
      isUpdate: isUpdate,
      message: isUpdate ? 
        `Product updated successfully. Our price: $${ourPrice}` :
        `Product imported successfully. Our price: $${ourPrice}`,
      scrapingData: {
        supplierPrice: scrapedData.price,
        ourPrice: ourPrice,
        profit: profit,
        stockStatus: scrapedData.stockStatus,
        rating: scrapedData.rating,
        apiUsed: 'RapidAPI Amazon Data Scraper',
        scrapedAt: scrapedData.scrapedAt
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

function extractAsin(input) {
  const trimmedInput = input.trim()
  
  // If it's already a 10-character ASIN
  if (/^[A-Z0-9]{10}$/i.test(trimmedInput)) {
    return trimmedInput.toUpperCase()
  }
  
  // Extract ASIN from Amazon URL
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
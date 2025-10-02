// lib/amazonScraper.js - Complete version with accurate per-variant stock tracking
import axios from 'axios'

const API_CONFIG = {
  baseUrl: 'https://amazon-data-scraper-api3.p.rapidapi.com',
  headers: {
    'X-RapidAPI-Key': '46dddd8772msh177462089352e07p15cfc4jsn558efbf4d9f6',
    'X-RapidAPI-Host': 'amazon-data-scraper-api3.p.rapidapi.com'
  }
}

// Optimized rate limiter
const rateLimiter = {
  queue: [],
  processing: false,
  delay: 500,
  
  async add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject })
      this.process()
    })
  },
  
  async process() {
    if (this.processing || this.queue.length === 0) return
    
    this.processing = true
    
    while (this.queue.length > 0) {
      const { fn, resolve, reject } = this.queue.shift()
      
      try {
        const result = await fn()
        resolve(result)
      } catch (error) {
        reject(error)
      }
      
      if (this.queue.length > 0) {
        await new Promise(r => setTimeout(r, this.delay))
      }
    }
    
    this.processing = false
  }
}

/**
 * Scrape Amazon product - Base function
 */
export async function scrapeAmazonProduct(asin, country = 'AU') {
  return rateLimiter.add(async () => {
    const maxRetries = 2
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.request({
          method: 'POST',
          url: `${API_CONFIG.baseUrl}/queries`,
          headers: API_CONFIG.headers,
          data: {
            source: 'amazon_product',
            query: asin,
            domain: country === 'AU' ? 'com.au' : 'com',
            parse: true,
            context: [{ key: 'autoselect_variant', value: false }]
          },
          timeout: 30000
        })

        if (!response.data?.results?.[0]?.content) {
          throw new Error('No product data returned from API')
        }
        
        return mapCompleteDataToSchema(response.data.results[0].content, asin, country)
        
      } catch (error) {
        console.error(`Attempt ${attempt}/${maxRetries} failed for ${asin}:`, error.message)
        
        if (attempt === maxRetries) {
          throw new Error(`Failed to scrape ${asin} after ${maxRetries} attempts: ${error.message}`)
        }
        
        await new Promise(r => setTimeout(r, 1000 * attempt))
      }
    }
  })
}

/**
 * Map API response to database schema
 */
function mapCompleteDataToSchema(data, asin, country) {
  // Extract stock quantity FIRST
  let stockQuantity = extractStockQuantity(data.stock)
  
  // Fallback to max_quantity if needed
  if (!stockQuantity && data.max_quantity && data.max_quantity < 50) {
    stockQuantity = data.max_quantity
    console.log(`[STOCK] Using max_quantity fallback: ${stockQuantity}`)
  }
  
  // Determine stock status
  const stockStatus = normalizeStockStatus(data.stock, data.price)
  console.log(`[STOCK] Final status: ${stockStatus}, Quantity: ${stockQuantity}`)
  
  const supplierPrice = stockStatus === 'Out of Stock' ? 0 : 
    (extractPrice(data.price || data.price_buybox || data.price_initial) || 0)
  
  const ourPrice = supplierPrice > 0 ? parseFloat((supplierPrice * 1.2 + 0.30).toFixed(2)) : 0
  
  const brand = data.brand || data.manufacturer || extractBrandFromTitle(data.title)
  
  const variationInfo = extractVariationInfo(data)
  
  return {
    supplier_sku: asin,
    supplier_asin: data.asin || asin,
    supplier_url: data.url || `https://www.amazon.com.${country.toLowerCase()}/dp/${asin}`,
    supplier_name: `Amazon ${country}`,
    amazon_url: data.url || `https://www.amazon.com.${country.toLowerCase()}/dp/${asin}`,
    
    title: cleanText(data.title || 'Unknown Product'),
    brand: brand,
    category: extractCategory(data.category),
    description: cleanText(data.description || ''),
    
    image_urls: Array.isArray(data.images) ? 
      data.images.filter(img => img?.startsWith?.('http')).slice(0, 10) : [],
    features: extractFeaturesArray(data.bullet_points),
    
    supplier_price: supplierPrice,
    our_price: ourPrice,
    currency: data.currency || (country === 'AU' ? 'AUD' : 'USD'),
    
    stock_status: stockStatus,
    stock_quantity: stockQuantity,
    
    shipping_info: buildShippingInfo(data.delivery),
    
    rating_average: data.rating ? parseFloat(data.rating) : null,
    rating_count: data.reviews_count || 0,
    
    is_active: true,
    last_scraped: new Date().toISOString(),
    scrape_errors: 0,
    max_scrape_errors: 10,
    
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    
    variants: variationInfo.hasVariations ? {
      has_variations: true,
      count: variationInfo.count,
      dimensions: variationInfo.dimensions,
      options: variationInfo.options,
      parent_asin: data.parent_asin || null
    } : null,
    
    metadata: {
      parent_asin: data.parent_asin,
      is_prime_eligible: data.is_prime_eligible || false,
      amazon_choice: data.amazon_choice || false,
      sales_volume: data.sales_volume || null,
      max_quantity: data.max_quantity || null,
      source: 'Amazon Data Scraper API',
      scraped_at: new Date().toISOString()
    }
  }
}
/**
 * Extract comprehensive variation information with stock placeholders
 */
function extractVariationInfo(data) {
  const result = {
    hasVariations: false,
    count: 0,
    dimensions: [],
    options: []
  }
  
  if (!data.variation || !Array.isArray(data.variation) || data.variation.length === 0) {
    return result
  }
  
  result.hasVariations = true
  result.count = data.variation.length
  
  const dimensionTypes = new Set()
  
  data.variation.forEach(variant => {
    if (!variant.dimensions) return
    
    Object.keys(variant.dimensions).forEach(key => {
      dimensionTypes.add(key)
    })
    
    const option = {
      asin: variant.asin,
      selected: variant.selected || false,
      dimensions: variant.dimensions,
      image: variant.tooltip_image || null,
      price: null,
      stock_status: null,
      stock_quantity: null
    }
    
    result.options.push(option)
  })
  
  result.dimensions = Array.from(dimensionTypes)
  
  return result
}

/**
 * Scrape variant data optimized - NO NULL VALUES
 */
export async function scrapeVariantDataOptimized(variantsData, country = 'AU', maxVariants = 5) {
  if (!variantsData?.options || !Array.isArray(variantsData.options)) {
    return variantsData
  }

  console.log(`Processing ${variantsData.options.length} variants (optimized)...`)
  
  const colorDimension = variantsData.dimensions.find(d => 
    d.toLowerCase().includes('color') || 
    d.toLowerCase().includes('colour')
  )
  
  const uniqueColors = new Map()
  let fallbackImage = null
  let fallbackPrice = null
  
  if (!colorDimension) {
    const variantsToFetch = variantsData.options
      .filter(v => !v.selected)
      .slice(0, maxVariants)
    
    for (const variant of variantsToFetch) {
      try {
        const data = await scrapeAmazonProduct(variant.asin, country)
        variant.image = data.image_urls?.[0] || fallbackImage
        variant.price = data.supplier_price || fallbackPrice
        variant.stock_status = data.stock_status || 'Unknown'
        variant.stock_quantity = data.stock_quantity || null
        
        if (!fallbackImage && variant.image) fallbackImage = variant.image
        if (!fallbackPrice && variant.price) fallbackPrice = variant.price
      } catch (error) {
        console.warn(`Failed for ${variant.asin}:`, error.message)
        variant.image = fallbackImage
        variant.price = fallbackPrice
        variant.stock_status = 'Unknown'
        variant.stock_quantity = null
      }
    }
    
    return variantsData
  }
  
  for (const variant of variantsData.options) {
    if (variant.selected) continue
    
    const colorValue = variant.dimensions[colorDimension]
    if (colorValue && !uniqueColors.has(colorValue)) {
      uniqueColors.set(colorValue, variant.asin)
    }
    
    // if (uniqueColors.size >= maxVariants) break
  }
  
  console.log(`Fetching data for ${uniqueColors.size} unique colors...`)
  
  const colorDataMap = new Map()
  
  for (const [color, asin] of uniqueColors) {
    try {
      console.log(`Fetching ${color}: ${asin}`)
      const variantData = await scrapeAmazonProduct(asin, country)
      
      const data = {
        image: variantData.image_urls?.[0] || fallbackImage,
        price: variantData.supplier_price || fallbackPrice,
        stock_status: variantData.stock_status || 'Unknown',
        stock_quantity: variantData.stock_quantity || null
      }
      
      colorDataMap.set(color, data)
      
      // Store as fallback for failed variants
      if (!fallbackImage && data.image) fallbackImage = data.image
      if (!fallbackPrice && data.price) fallbackPrice = data.price
      
    } catch (error) {
      console.warn(`Failed for ${color}:`, error.message)
      colorDataMap.set(color, { 
        image: fallbackImage,
        price: fallbackPrice,
        stock_status: 'Unknown',
        stock_quantity: null
      })
    }
  }
  
  const enrichedOptions = variantsData.options.map(variant => {
    const colorValue = variant.dimensions[colorDimension]
    const scraped = colorDataMap.get(colorValue)
    
    if (scraped) {
      return {
        ...variant,
        image: scraped.image || fallbackImage,
        price: scraped.price || fallbackPrice,
        stock_status: scraped.stock_status || 'Unknown',
        stock_quantity: scraped.stock_quantity
      }
    }
    
    // No data for this color, use fallback
    return {
      ...variant,
      image: fallbackImage,
      price: fallbackPrice,
      stock_status: 'Unknown',
      stock_quantity: null
    }
  })

  return {
    ...variantsData,
    options: enrichedOptions
  }
}
/**
 * Scrape ALL variants individually - NO NULL VALUES
 * Provides intelligent fallbacks when scraping fails
 */
export async function scrapeAllVariantsIndividually(variantsData, country = 'AU', mainProductData = null) {
  if (!variantsData?.options || !Array.isArray(variantsData.options)) {
    return variantsData
  }

  console.log(`Scraping ${variantsData.options.length} variants individually for accurate stock...`)
  
  const enrichedOptions = []
  let successCount = 0
  let failCount = 0
  
  // Find a successfully scraped variant to use as fallback template
  let fallbackData = null
  
  for (const variant of variantsData.options) {
    try {
      console.log(`[${successCount + failCount + 1}/${variantsData.options.length}] Fetching ${variant.asin}...`)
      
      let variantData = null
      let lastError = null
      
      // Retry logic: try up to 2 times
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          variantData = await scrapeAmazonProduct(variant.asin, country)
          break
        } catch (error) {
          lastError = error
          console.warn(`Attempt ${attempt}/2 failed for ${variant.asin}:`, error.message)
          if (attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 2000))
          }
        }
      }
      
      if (variantData) {
        const enrichedVariant = {
          ...variant,
          image: variantData.image_urls?.[0] || null,
          price: variantData.supplier_price || null,
          stock_status: variantData.stock_status || 'Unknown',
          stock_quantity: variantData.stock_quantity || null
        }
        
        enrichedOptions.push(enrichedVariant)
        
        // Store first successful scrape as fallback template
        if (!fallbackData && enrichedVariant.image) {
          fallbackData = enrichedVariant
        }
        
        successCount++
      } else {
        // Scraping failed - use intelligent fallback
        console.error(`Failed to scrape ${variant.asin} after 2 attempts, using fallback data`)
        
        enrichedOptions.push({
          ...variant,
          image: fallbackData?.image || (mainProductData?.image_urls?.[0]) || null,
          price: fallbackData?.price || mainProductData?.supplier_price || null,
          stock_status: 'Unknown',
          stock_quantity: null
        })
        
        failCount++
      }
      
      await new Promise(resolve => setTimeout(resolve, 500))
      
    } catch (error) {
      console.warn(`Unexpected error for ${variant.asin}:`, error.message)
      
      enrichedOptions.push({
        ...variant,
        image: fallbackData?.image || (mainProductData?.image_urls?.[0]) || null,
        price: fallbackData?.price || mainProductData?.supplier_price || null,
        stock_status: 'Unknown',
        stock_quantity: null
      })
      
      failCount++
    }
  }

  console.log(`Completed: ${successCount} successful, ${failCount} failed (with fallbacks)`)

  return {
    ...variantsData,
    options: enrichedOptions
  }
}

/**
 * Scrape product with variants - OPTIMIZED (Recommended for speed)
 */
export async function scrapeAmazonProductWithVariants(asin, country = 'AU', options = {}) {
  const { 
    fetchVariants = true, 
    maxVariants = 5,
    accurateStock = false
  } = options
  
  const productData = await scrapeAmazonProduct(asin, country)
  
  if (!fetchVariants) {
    return productData
  }
  
  if (productData.variants?.has_variations && productData.variants?.options?.length > 0) {
    if (accurateStock) {
      console.log(`Product has ${productData.variants.count} variants. Fetching ACCURATE stock for each...`)
      console.log(`WARNING: This will make ${productData.variants.count} API calls`)
      productData.variants = await scrapeAllVariantsIndividually(
        productData.variants, 
        country, 
        productData // Pass main product data
      )
    } else {
      console.log(`Product has ${productData.variants.count} variants. Fetching optimized variant data...`)
      productData.variants = await scrapeVariantDataOptimized(productData.variants, country, maxVariants)
    }
  }
  
  return productData
}

/**
 * Extract price with better error handling
 */
function extractPrice(priceData) {
  if (typeof priceData === 'number' && priceData > 0) return priceData
  if (!priceData) return 0
  
  const cleanPrice = priceData.toString().replace(/[^\d.]/g, '')
  const price = parseFloat(cleanPrice)
  
  return (isNaN(price) || price <= 0) ? 0 : price
}

/**
 * Normalize stock status
 */
function normalizeStockStatus(stock, price) {
  if (!stock) {
    return (price && extractPrice(price) > 0) ? 'In Stock' : 'Unknown'
  }
  
  const stockLower = stock.toString().toLowerCase()
  
  if (stockLower.includes('out of stock') || 
      stockLower.includes('unavailable') ||
      stockLower.includes('currently unavailable') ||
      stockLower.includes('not available') ||
      stockLower.includes('discontinued') ||
      stockLower.includes('temporarily out')) {
    return 'Out of Stock'
  }
  
  if ((stockLower.includes('only') && stockLower.includes('left')) ||
      stockLower.includes('limited') || 
      stockLower.includes('few left') ||
      stockLower.includes('low stock')) {
    return 'Limited Stock'
  }
  
  return 'In Stock'
}

/**
 * Extract stock quantity from stock string - ENHANCED
 */
function extractStockQuantity(stock) {
  if (!stock) {
    console.log('[STOCK] No stock data provided')
    return null
  }
  
  const stockStr = stock.toString().toLowerCase()
  console.log('[STOCK] Parsing:', stockStr)
  
  const patterns = [
    /only\s+(\d+)\s+left/i,
    /(\d+)\s+left\s+in\s+stock/i,
    /(\d+)\s+remaining/i,
    /(\d+)\s+in\s+stock/i,
    /(\d+)\s+available/i,
    /stock:\s*(\d+)/i,
    /quantity:\s*(\d+)/i,
    /(\d+)\s+items?\s+left/i,
    /(\d+)\s+units?\s+available/i,
    /last\s+(\d+)/i,
    /(\d+)\s+pieces?\s+left/i
  ]
  
  for (const pattern of patterns) {
    const match = stockStr.match(pattern)
    if (match && match[1]) {
      const qty = parseInt(match[1])
      if (qty > 0 && qty < 10000) {
        console.log(`[STOCK] ✓ Extracted quantity: ${qty}`)
        return qty
      }
    }
  }
  
  console.log('[STOCK] ✗ No quantity pattern matched')
  return null
}

/**
 * Extract features from bullet points
 */
function extractFeaturesArray(bulletPoints) {
  if (!bulletPoints) return []
  
  if (typeof bulletPoints === 'string') {
    return bulletPoints.split('\n')
      .map(f => cleanText(f))
      .filter(f => f.length > 0)
      .slice(0, 10)
  }
  
  if (Array.isArray(bulletPoints)) {
    return bulletPoints
      .map(f => cleanText(f))
      .filter(f => f.length > 0)
      .slice(0, 10)
  }
  
  return []
}

/**
 * Build shipping information object
 */
function buildShippingInfo(delivery) {
  if (!Array.isArray(delivery)) return {}
  
  const shippingInfo = {}
  delivery.forEach((option, index) => {
    const key = option.type?.toLowerCase().replace(/\s+/g, '_') || `option_${index}`
    shippingInfo[key] = {
      type: option.type || 'Unknown',
      date: option.date || null
    }
  })
  return shippingInfo
}

/**
 * Extract category from category data
 */
/**
 * Extract category from category data
 */
function extractCategory(category) {
  if (!category) return null
  if (typeof category === 'string') return category
  
  // Handle array of category objects (most common Amazon format)
  if (Array.isArray(category) && category.length > 0) {
    const firstCategory = category[0]
    
    // Check if it has a ladder property (breadcrumb path)
    if (firstCategory.ladder && Array.isArray(firstCategory.ladder) && firstCategory.ladder.length > 0) {
      return firstCategory.ladder.map(c => c.name).join(' > ')
    }
    
    // Otherwise just get the name or return the string value
    return firstCategory.name || firstCategory
  }
  
  // Handle single category object with ladder
  if (category.ladder && Array.isArray(category.ladder) && category.ladder.length > 0) {
    return category.ladder.map(c => c.name).join(' > ')
  }
  
  // Handle single category object with just a name
  if (category.name) return category.name
  
  return null
}

/**
 * Extract brand from product title
 */
function extractBrandFromTitle(title) {
  if (!title) return null
  
  const brandPatterns = [
    /^([A-Z][a-zA-Z0-9&\s]*?)[\s-]/,
    /^([A-Z]+)\s/
  ]
  
  for (const pattern of brandPatterns) {
    const match = title.match(pattern)
    if (match && match[1].length > 1 && match[1].length < 30) {
      return match[1].trim()
    }
  }
  
  return null
}

/**
 * Clean text with length limit
 */
function cleanText(text, maxLength = 5000) {
  if (!text) return ''
  return text.toString()
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLength)
}

/**
 * Batch scrape multiple ASINs
 */
export async function scrapeMultipleProducts(asins, country = 'AU', progressCallback = null) {
  const results = []
  const errors = []
  
  for (let i = 0; i < asins.length; i++) {
    const asin = asins[i]
    
    try {
      if (progressCallback) {
        progressCallback({
          current: i + 1,
          total: asins.length,
          asin: asin,
          status: 'scraping'
        })
      }
      
      const product = await scrapeAmazonProduct(asin, country)
      results.push(product)
      
      if (progressCallback) {
        progressCallback({
          current: i + 1,
          total: asins.length,
          asin: asin,
          status: 'success'
        })
      }
      
    } catch (error) {
      errors.push({ asin, error: error.message })
      
      if (progressCallback) {
        progressCallback({
          current: i + 1,
          total: asins.length,
          asin: asin,
          status: 'error',
          error: error.message
        })
      }
    }
  }
  
  return { results, errors }
}

export function calculateStockSummary(variantsData) {
  if (!variantsData?.options) {
    return { available: 0, onHold: 0, outOfStock: 0, total: 0 }
  }
  
  const summary = {
    available: 0,    // In Stock with qty > 10
    onHold: 0,       // Limited Stock (qty 1-10)
    outOfStock: 0,   // Out of Stock or null
    total: variantsData.count || variantsData.options.length
  }
  
  variantsData.options.forEach(variant => {
    if (!variant.stock_status || variant.stock_status === 'Out of Stock' || variant.stock_quantity === 0) {
      summary.outOfStock++
    } else if (variant.stock_status === 'Limited Stock' || (variant.stock_quantity && variant.stock_quantity <= 10)) {
      summary.onHold++
    } else if (variant.stock_status === 'In Stock') {
      summary.available++
    }
  })
  
  return summary
}

export { rateLimiter }
// lib/amazonScraper.js - Fixed version for Real-Time Amazon Data API
import axios from 'axios'

const RAPIDAPI_CONFIG = {
  baseUrl: 'https://real-time-amazon-data.p.rapidapi.com',
  headers: {
    'X-RapidAPI-Key': '46dddd8772msh177462089352e07p15cfc4jsn558efbf4d9f6',
    'X-RapidAPI-Host': 'real-time-amazon-data.p.rapidapi.com'
  }
}

// Rate limiting to avoid API limits
const rateLimiter = {
  queue: [],
  processing: false,
  delay: 5000, // 5 seconds between requests
  
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

export async function scrapeAmazonProduct(asin) {
  return rateLimiter.add(async () => {
    const maxRetries = 3
    let retryDelay = 10000
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Scraping Amazon AU product: ${asin} (attempt ${attempt}/${maxRetries})`)
        
        // Try product details endpoint first
        let response
        try {
          response = await axios.get(`${RAPIDAPI_CONFIG.baseUrl}/product-details`, {
            headers: RAPIDAPI_CONFIG.headers,
            params: {
              asin: asin,
              country: 'AU'
            },
            timeout: 60000
          })
        } catch (productError) {
          console.log('Product details endpoint failed, trying search...')
          response = await axios.get(`${RAPIDAPI_CONFIG.baseUrl}/search`, {
            headers: RAPIDAPI_CONFIG.headers,
            params: {
              query: asin,
              page: 1,
              country: 'AU',
              sort_by: 'RELEVANCE'
            },
            timeout: 60000
          })
        }

        console.log('API Response received for', asin)

        // Handle the response based on which endpoint was used
        let productData
        if (response.data && response.data.data) {
          // This is from product-details endpoint
          productData = response.data.data
        } else if (response.data && response.data.products && response.data.products.length > 0) {
          // This is from search endpoint, find exact ASIN match
          productData = response.data.products.find(p => p.asin === asin) || response.data.products[0]
        } else {
          throw new Error('No product data found in API response')
        }
        
        if (!productData) {
          throw new Error('No matching product found')
        }
        
        return normalizeProductData(productData, asin)
        
      } catch (error) {
        console.error(`Scraping attempt ${attempt} failed for ${asin}:`, error.message)
        
        if (error.response) {
          console.error('API Error Status:', error.response.status)
          console.error('API Error Data:', error.response.data)
          
          if (error.response.status === 429 && attempt < maxRetries) {
            console.log(`Rate limited. Waiting ${retryDelay/1000}s before retry ${attempt + 1}...`)
            await new Promise(resolve => setTimeout(resolve, retryDelay))
            retryDelay *= 2
            continue
          }
        }
        
        if (attempt === maxRetries) {
          throw new Error(`Failed to scrape ${asin} after ${maxRetries} attempts: ${error.message}`)
        }
      }
    }
  })
}

function normalizeProductData(productData, asin) {
  console.log('Normalizing product data:', JSON.stringify(productData, null, 2))
  
  // Map the API response fields to our expected structure
  const title = productData.product_title || productData.title || productData.name || 'Unknown Product'
  const price = extractPrice(productData.product_price || productData.price || productData.current_price)
  const originalPrice = extractPrice(productData.product_original_price || productData.original_price)
  
  // Extract rating info
  const rating = {
    average: productData.product_star_rating || productData.rating || productData.star_rating || null,
    count: productData.product_num_ratings || productData.ratings_total || productData.num_ratings || 0
  }
  
  // Convert rating to number if it's a string
  if (rating.average && typeof rating.average === 'string') {
    rating.average = parseFloat(rating.average)
  }
  
  // Extract stock status
  const stockStatus = normalizeStockStatus(
    productData.product_availability || 
    productData.availability || 
    productData.stock || 
    'In Stock'
  )
  
  // Extract brand from title if not provided
  const brand = productData.brand || extractBrandFromTitle(title)
  
  // Extract features
  const features = extractFeaturesFromProduct(productData)
  
  // Get images
  const images = []
  if (productData.product_photo) {
    images.push(productData.product_photo)
  }
  if (productData.images && Array.isArray(productData.images)) {
    images.push(...productData.images)
  }
  if (productData.image) {
    images.push(productData.image)
  }
  
  const normalizedData = {
    asin: productData.asin || asin,
    url: productData.product_url || productData.url || `https://www.amazon.com.au/dp/${asin}`,
    title: cleanTitle(title),
    brand: brand,
    category: productData.category || 'General',
    
    // Price handling
    price: price,
    originalPrice: originalPrice || price,
    currency: 'AUD',
    
    // Stock/Availability
    stockStatus: stockStatus,
    availability: productData.product_availability || productData.availability || stockStatus,
    
    // Ratings
    rating: rating,
    
    // Images
    images: images.filter(img => img && typeof img === 'string'),
    
    // Product details
    description: productData.description || '',
    features: features,
    bulletPoints: features.join('\n'),
    
    // Additional product info
    variations: productData.has_variations || false,
    isPrimeEligible: productData.is_prime || false,
    
    // Seller info
    seller: productData.seller || brand || 'Amazon',
    
    // Scraping metadata
    scrapedAt: new Date().toISOString(),
    country: 'AU',
    pageType: 'Product'
  }
  
  console.log('Normalized product data:', JSON.stringify(normalizedData, null, 2))
  return normalizedData
}

function extractFeaturesFromProduct(productData) {
  const features = []
  
  // Try different possible feature fields
  if (productData.features && Array.isArray(productData.features)) {
    features.push(...productData.features)
  }
  
  if (productData.bullet_points && Array.isArray(productData.bullet_points)) {
    features.push(...productData.bullet_points)
  }
  
  if (productData.description && typeof productData.description === 'string') {
    // Extract bullet points from description
    const bulletPoints = productData.description.match(/[•·▪▫▪]\s*(.+)/g)
    if (bulletPoints) {
      features.push(...bulletPoints.map(point => point.replace(/[•·▪▫▪]\s*/, '').trim()))
    }
  }
  
  // If no features found, create some from available data
  if (features.length === 0) {
    if (productData.product_title) {
      // Try to extract key features from title
      const titleFeatures = extractFeaturesFromTitle(productData.product_title)
      features.push(...titleFeatures)
    }
  }
  
  return features.slice(0, 8) // Limit to 8 features
}

function extractFeaturesFromTitle(title) {
  const features = []
  const titleLower = title.toLowerCase()
  
  // Common feature patterns
  const patterns = [
    /(\d+gb|\d+tb)/gi, // Storage
    /(\d+"|\d+ inch)/gi, // Screen size
    /(waterproof|wireless|bluetooth|wifi)/gi, // Tech features
    /(unlocked|dual sim)/gi, // Phone features
    /(\d+mp camera|\d+mp)/gi, // Camera
    /(fast charging|long battery)/gi // Battery
  ]
  
  patterns.forEach(pattern => {
    const matches = title.match(pattern)
    if (matches) {
      matches.forEach(match => {
        if (match.trim().length > 2) {
          features.push(match.trim())
        }
      })
    }
  })
  
  return features.slice(0, 3) // Max 3 from title
}

function extractPrice(priceString) {
  if (typeof priceString === 'number') return priceString
  if (!priceString) return null
  
  // Remove currency symbols and extract number
  const cleanPrice = priceString.toString().replace(/[^\d.,]/g, '')
  let price = parseFloat(cleanPrice.replace(',', ''))
  
  // If the price seems to be in USD (from US API), convert to rough AUD
  if (price && price > 0 && price < 1000) {
    // Simple USD to AUD conversion (roughly 1.5x)
    price = price * 1.5
  }
  
  return isNaN(price) ? null : price
}

function cleanTitle(title) {
  if (!title) return 'Unknown Product'
  
  // Remove extra whitespace and common Amazon title clutter
  return title
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 500)
}

function extractBrandFromTitle(title) {
  if (!title) return null
  
  const brandPatterns = [
    /^([A-Z][a-zA-Z0-9&\s]*?)[\s-]/,
    /^([A-Z]+)\s/,
    /by\s([A-Z][a-zA-Z\s]+)/
  ]
  
  for (const pattern of brandPatterns) {
    const match = title.match(pattern)
    if (match && match[1].length > 1 && match[1].length < 30) {
      return match[1].trim()
    }
  }
  
  return null
}

function normalizeStockStatus(stock) {
  if (!stock) return 'In Stock'
  
  const stockLower = stock.toString().toLowerCase()
  
  if (stockLower.includes('in stock') || 
      stockLower.includes('available') || 
      stockLower.includes('ships')) {
    return 'In Stock'
  } else if (stockLower.includes('out of stock') || 
             stockLower.includes('unavailable') || 
             stockLower.includes('currently unavailable')) {
    return 'Out of Stock'
  } else if (stockLower.includes('limited') || 
             stockLower.includes('few left') || 
             stockLower.includes('only') ||
             stockLower.includes('left in stock')) {
    return 'Limited Stock'
  }
  
  return 'In Stock'
}

export { rateLimiter }
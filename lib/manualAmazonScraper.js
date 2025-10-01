// lib/manualAmazonScraper.js - Playwright-based scraper
import { chromium } from 'playwright'

/**
 * Scrape Amazon product using Playwright (browser automation)
 * More reliable than API but slower and can be blocked
 */
export async function scrapeAmazonProductManual(asin, country = 'AU') {
  const domain = country === 'AU' ? 'com.au' : 'com'
  const url = `https://www.amazon.${domain}/dp/${asin}`
  
  let browser
  try {
    // Launch browser with stealth settings
    browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    })

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-AU'
    })

    const page = await context.newPage()
    
    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-AU,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br'
    })

    console.log(`[MANUAL-SCRAPER] Navigating to: ${url}`)
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })

    // Wait for main content
    await page.waitForSelector('#productTitle', { timeout: 10000 })

    // Extract product data
    const productData = await page.evaluate(() => {
      // Title
      const title = document.querySelector('#productTitle')?.innerText?.trim()
      
      // Price
      let price = null
      const priceWhole = document.querySelector('.a-price-whole')?.innerText?.replace(/[^\d]/g, '')
      const priceFraction = document.querySelector('.a-price-fraction')?.innerText
      if (priceWhole) {
        price = parseFloat(`${priceWhole}.${priceFraction || '00'}`)
      }
      
      // Stock status and quantity
      let stockStatus = 'In Stock'
      let stockQuantity = null
      const availabilityElement = document.querySelector('#availability span')
      if (availabilityElement) {
        const stockText = availabilityElement.innerText.trim()
        
        if (stockText.toLowerCase().includes('out of stock') || 
            stockText.toLowerCase().includes('unavailable')) {
          stockStatus = 'Out of Stock'
          stockQuantity = 0
        } else if (stockText.toLowerCase().includes('only') && stockText.toLowerCase().includes('left')) {
          stockStatus = 'Limited Stock'
          const match = stockText.match(/only (\d+) left/i)
          stockQuantity = match ? parseInt(match[1]) : 3
        } else {
          stockStatus = 'In Stock'
          // Try to extract quantity from stock text
          const qtyMatch = stockText.match(/(\d+)\s*in stock/i)
          stockQuantity = qtyMatch ? parseInt(qtyMatch[1]) : null
        }
      }
      
      // Brand
      const brand = document.querySelector('#bylineInfo')?.innerText?.replace(/^(Visit the|Brand:)\s*/i, '').trim()
      
      // Images
      const images = []
      const imageElements = document.querySelectorAll('#altImages img, #imageBlock img')
      imageElements.forEach(img => {
        const src = img.src?.replace(/_[A-Z]{2}\d+_/, '_AC_SL1500_') // Get high-res version
        if (src && src.includes('images-amazon.com') && !images.includes(src)) {
          images.push(src)
        }
      })
      
      // Features
      const features = []
      const featureElements = document.querySelectorAll('#feature-bullets li span.a-list-item')
      featureElements.forEach(el => {
        const text = el.innerText?.trim()
        if (text && text.length > 0) features.push(text)
      })
      
      // Description
      const descElement = document.querySelector('#productDescription p, #productDescription')
      const description = descElement?.innerText?.trim() || ''
      
      // Rating
      const ratingText = document.querySelector('.a-icon-star span')?.innerText
      const ratingAverage = ratingText ? parseFloat(ratingText.split(' ')[0]) : null
      const ratingCountText = document.querySelector('#acrCustomerReviewText')?.innerText
      const ratingCount = ratingCountText ? parseInt(ratingCountText.replace(/[^\d]/g, '')) : 0
      
      // Category
      const categoryElement = document.querySelector('#wayfinding-breadcrumbs_feature_div li:last-child span')
      const category = categoryElement?.innerText?.trim() || null
      
      // Variants - check if product has variations
      const variations = []
      const variantButtons = document.querySelectorAll('#variation_style_name li, #variation_color_name li, #variation_size_name li')
      variantButtons.forEach(button => {
        const variantName = button.querySelector('.selection')?.innerText?.trim() || 
                           button.getAttribute('title') || 
                           button.innerText?.trim()
        const variantASIN = button.getAttribute('data-defaultasin')
        
        if (variantName && variantASIN) {
          variations.push({
            title: variantName,
            value: variantName,
            asin: variantASIN,
            price: null,
            image: null
          })
        }
      })
      
      return {
        title,
        price,
        stockStatus,
        stockQuantity,
        brand,
        images: images.slice(0, 10),
        features,
        description,
        ratingAverage,
        ratingCount,
        category,
        variations: variations.length > 0 ? variations : null,
        url: window.location.href
      }
    })

    await browser.close()

    if (!productData.title) {
      throw new Error('Failed to extract product data')
    }

    // Calculate our price
    const supplierPrice = productData.stockStatus === 'Out of Stock' ? 0 : productData.price
    const ourPrice = supplierPrice > 0 ? parseFloat((supplierPrice * 1.2 + 0.30).toFixed(2)) : 0

    // Format for database
    return {
      supplier_sku: asin,
      supplier_asin: asin,
      supplier_url: productData.url,
      supplier_name: `Amazon ${country}`,
      amazon_url: productData.url,
      
      title: productData.title,
      brand: productData.brand,
      category: productData.category,
      description: productData.description,
      
      image_urls: productData.images,
      features: productData.features,
      
      supplier_price: supplierPrice,
      our_price: ourPrice,
      currency: country === 'AU' ? 'AUD' : 'USD',
      
      stock_status: productData.stockStatus,
      stock_quantity: productData.stockQuantity,
      
      shipping_info: {},
      
      rating_average: productData.ratingAverage,
      rating_count: productData.ratingCount,
      
      is_active: true,
      last_scraped: new Date().toISOString(),
      scrape_errors: 0,
      max_scrape_errors: 10,
      
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      
      _metadata: {
        parent_asin: null,
        has_variations: productData.variations && productData.variations.length > 0,
        variation_count: productData.variations ? productData.variations.length : 0,
        variations: productData.variations,
        is_prime_eligible: false,
        source: 'Manual Playwright Scraper',
        scraped_at: new Date().toISOString()
      }
    }

  } catch (error) {
    if (browser) await browser.close()
    console.error(`[MANUAL-SCRAPER] Error scraping ${asin}:`, error.message)
    throw error
  }
}

/**
 * Scrape multiple products with rate limiting
 */
export async function scrapeMultipleProducts(asins, country = 'AU', delayMs = 3000) {
  const results = []
  
  for (const asin of asins) {
    try {
      console.log(`[MANUAL-SCRAPER] Scraping ${asin}...`)
      const data = await scrapeAmazonProductManual(asin, country)
      results.push({ asin, success: true, data })
      
      // Delay between requests to avoid detection
      if (asins.indexOf(asin) < asins.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    } catch (error) {
      console.error(`[MANUAL-SCRAPER] Failed to scrape ${asin}:`, error.message)
      results.push({ asin, success: false, error: error.message })
    }
  }
  
  return results
}
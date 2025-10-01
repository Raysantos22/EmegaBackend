// pages/api/amazon/update-single-product.js - Fixed with category handling
import { supabase } from '../../../lib/supabase'
import { scrapeAmazonProduct, scrapeAmazonProductWithVariants, calculateStockSummary } from '../../../lib/amazonScraper'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { 
      productId, 
      asin, 
      userId,
      country = 'AU',
      fetchVariants = true,
      accurateStock = true,
      maxVariants = 999
    } = req.body

    if (!productId && !asin) {
      return res.status(400).json({ error: 'Product ID or ASIN required' })
    }

    console.log(`[SINGLE-UPDATE] Starting for: ${productId || asin}`)

    let product
    if (productId) {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single()
      
      if (error || !data) {
        return res.status(404).json({ error: 'Product not found' })
      }
      product = data
    }

    const productAsin = product.supplier_asin
    console.log(`[SINGLE-UPDATE] Updating: ${product.title} (${productAsin})`)

    let scrapedData
    try {
      if (fetchVariants) {
        scrapedData = await scrapeAmazonProductWithVariants(productAsin, country, {
          fetchVariants: true,
          maxVariants: maxVariants,
          accurateStock: accurateStock
        })
        console.log(`Successfully scraped with variant data: ${scrapedData.title}`)
      } else {
        scrapedData = await scrapeAmazonProduct(productAsin, country)
        console.log(`Successfully scraped: ${scrapedData.title}`)
      }
    } catch (scrapeError) {
      console.error('[SINGLE-UPDATE] Scraping failed:', scrapeError.message)
      
      const newErrorCount = (product.scrape_errors || 0) + 1
      const shouldDeactivate = newErrorCount >= 10
      
      await supabase
        .from('products')
        .update({
          scrape_errors: newErrorCount,
          is_active: !shouldDeactivate,
          last_scraped: new Date().toISOString()
        })
        .eq('id', product.id)
      
      return res.status(400).json({
        success: false,
        error: 'Failed to scrape updated data',
        message: scrapeError.message
      })
    }

    if (!scrapedData || !scrapedData.title) {
      return res.status(400).json({
        success: false,
        error: 'No valid product data returned'
      })
    }

    const metadata = scrapedData.metadata || {}
    delete scrapedData.metadata
    
    if (scrapedData.variants?.has_variations) {
      const stockSummary = calculateStockSummary(scrapedData.variants)
      metadata.stock_summary = stockSummary
    }

    const updatedProductData = {
      title: truncateString(scrapedData.title, 1000),
      brand: truncateString(scrapedData.brand, 500),
      category: typeof scrapedData.category === 'string' 
        ? truncateString(scrapedData.category, 500)
        : (scrapedData.category?.name ? truncateString(scrapedData.category.name, 500) : null),
      image_urls: Array.isArray(scrapedData.image_urls)
        ? scrapedData.image_urls.map(url => truncateString(url, 1000))
        : scrapedData.image_urls,
      description: truncateString(scrapedData.description, 5000),
      features: Array.isArray(scrapedData.features) 
        ? scrapedData.features.map(f => truncateString(f, 500))
        : scrapedData.features,
      
      supplier_price: scrapedData.supplier_price,
      our_price: scrapedData.our_price,
      currency: truncateString(scrapedData.currency, 3),
      
      stock_status: truncateString(scrapedData.stock_status, 50),
      stock_quantity: scrapedData.stock_quantity,
      
      shipping_info: cleanShippingInfo(scrapedData.shipping_info),
      
      rating_average: scrapedData.rating_average,
      rating_count: scrapedData.rating_count,
      
      variants: cleanVariants(scrapedData.variants),
      
      metadata: metadata,
      
      is_active: true,
      last_scraped: new Date().toISOString(),
      scrape_errors: 0,
      updated_at: new Date().toISOString()
    }

    const { data: updatedProduct, error: updateError } = await supabase
      .from('products')
      .update(updatedProductData)
      .eq('id', product.id)
      .select()
      .single()

    if (updateError) throw updateError

    if (product.supplier_price !== scrapedData.supplier_price) {
      const { error: priceError } = await supabase
        .from('price_history')
        .insert({
          product_id: product.id,
          supplier_price: scrapedData.supplier_price,
          our_price: scrapedData.our_price,
          stock_status: scrapedData.stock_status,
          recorded_at: new Date().toISOString()
        })
      
      if (priceError) {
        console.warn('[PRICE-HISTORY]:', priceError.message)
      }
    }

    console.log(`[SINGLE-UPDATE] ✓ Successfully updated ${productAsin}`)

    return res.status(200).json({
      success: true,
      product: updatedProduct,
      message: 'Product updated successfully'
    })

  } catch (error) {
    console.error('[SINGLE-UPDATE] Error:', error)
    return res.status(500).json({
      success: false,
      error: 'Update failed',
      message: error.message
    })
  }
}

function truncateString(str, maxLength) {
  if (!str) return str
  if (typeof str !== 'string') return str
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength - 3) + '...'
}

function cleanShippingInfo(shippingInfo) {
  if (!shippingInfo || typeof shippingInfo !== 'object') return shippingInfo
  
  return Object.keys(shippingInfo).reduce((acc, key) => {
    const value = shippingInfo[key]
    acc[key] = typeof value === 'string' ? truncateString(value, 500) : value
    return acc
  }, {})
}

function cleanVariants(variants) {
  if (!variants || !variants.options || !Array.isArray(variants.options)) {
    return variants
  }
  
  return {
    ...variants,
    options: variants.options.map(variant => ({
      ...variant,
      asin: truncateString(variant.asin, 20),
      title: truncateString(variant.title, 500),
      value: truncateString(variant.value, 500),
      dimension_name: truncateString(variant.dimension_name, 200),
      image_url: truncateString(variant.image_url, 1000)
    }))
  }
}
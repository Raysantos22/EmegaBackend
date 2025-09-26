// pages/api/amazon/update-single-product.js - Real scraping for single product updates
import { supabase } from '../../../lib/supabase'
import { scrapeAmazonProduct } from '../../../lib/amazonScraper'


export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { productId, asin, country = 'AU' } = req.body

    if (!productId && !asin) {
      return res.status(400).json({ 
        error: 'Product ID or ASIN required' 
      })
    }

    console.log(`Updating single product: ${productId || asin}`)

    // Get product from database
    let product
    if (productId) {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single()
      
      if (error || !data) {
        return res.status(404).json({ 
          error: 'Product not found' 
        })
      }
      product = data
    } else {
      // Find by ASIN if productId not provided
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('supplier_asin', asin)
        .single()
      
      if (error || !data) {
        return res.status(404).json({ 
          error: 'Product not found' 
        })
      }
      product = data
    }

    const productAsin = product.supplier_asin
    console.log(`Found product: ${product.title} (${productAsin})`)

    // Scrape fresh data from Amazon
    let scrapedData
    try {
      scrapedData = await scrapeAmazonProduct(productAsin, country)
    } catch (scrapeError) {
      console.error('Scraping failed:', scrapeError.message)
      
      // Increment error count but don't fail completely
      const newErrorCount = (product.scrape_errors || 0) + 1
      const shouldDeactivate = newErrorCount >= 10 // Max errors before deactivation
      
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
        error: 'Failed to scrape updated product data',
        message: scrapeError.message,
        errorCount: newErrorCount,
        deactivated: shouldDeactivate
      })
    }

    if (!scrapedData || !scrapedData.title) {
      return res.status(400).json({
        success: false,
        error: 'No valid product data returned'
      })
    }

    // Calculate new our price
    const newOurPrice = scrapedData.price ? 
      parseFloat((scrapedData.price * 1.2 + 0.30).toFixed(2)) : product.our_price

    // Check what changed
    const changes = detectChanges(product, scrapedData, newOurPrice)
    
    // Update product in database
    const updatedProductData = {
      title: scrapedData.title,
      brand: scrapedData.brand,
      category: scrapedData.category,
      supplier_price: scrapedData.price,
      our_price: newOurPrice,
      currency: scrapedData.currency,
      stock_status: scrapedData.stockStatus,
      rating_average: scrapedData.rating.average,
      rating_count: scrapedData.rating.count,
      image_urls: scrapedData.images,
      description: scrapedData.description,
      features: scrapedData.features,
      is_active: true,
      last_scraped: new Date().toISOString(),
      scrape_errors: 0, // Reset error count on successful update
      updated_at: new Date().toISOString()
    }

    const { data: updatedProduct, error: updateError } = await supabase
      .from('products')
      .update(updatedProductData)
      .eq('id', product.id)
      .select()
      .single()

    if (updateError) {
      throw updateError
    }

    // Add price history if price changed
    if (changes.priceChanged) {
      await supabase
        .from('price_history')
        .insert({
          product_id: product.id,
          supplier_price: scrapedData.price,
          our_price: newOurPrice,
          stock_status: scrapedData.stockStatus,
          recorded_at: new Date().toISOString()
        })
        .catch(err => console.warn('Price history insert failed:', err))
    }

    console.log(`Successfully updated product ${productAsin}`)

    res.status(200).json({
      success: true,
      product: updatedProduct,
      changes: changes,
      message: changes.hasChanges ? 
        'Product updated with new data from Amazon' : 
        'Product refreshed - no changes detected',
      scrapingData: {
        supplierPrice: scrapedData.price,
        ourPrice: newOurPrice,
        stockStatus: scrapedData.stockStatus,
        rating: scrapedData.rating,
        scrapedAt: scrapedData.scrapedAt
      }
    })

  } catch (error) {
    console.error('Single product update error:', error)
    res.status(500).json({
      success: false,
      error: 'Update failed',
      message: error.message
    })
  }
}

function detectChanges(oldProduct, scrapedData, newOurPrice) {
  const changes = {
    hasChanges: false,
    priceChanged: false,
    stockChanged: false,
    ratingChanged: false,
    titleChanged: false,
    imageChanged: false,
    details: []
  }

  // Price change
  if (oldProduct.supplier_price !== scrapedData.price) {
    changes.priceChanged = true
    changes.hasChanges = true
    changes.details.push({
      field: 'supplier_price',
      old: oldProduct.supplier_price,
      new: scrapedData.price,
      ourPriceOld: oldProduct.our_price,
      ourPriceNew: newOurPrice
    })
  }

  // Stock status change
  if (oldProduct.stock_status !== scrapedData.stockStatus) {
    changes.stockChanged = true
    changes.hasChanges = true
    changes.details.push({
      field: 'stock_status',
      old: oldProduct.stock_status,
      new: scrapedData.stockStatus
    })
  }

  // Rating change
  if (oldProduct.rating_average !== scrapedData.rating.average) {
    changes.ratingChanged = true
    changes.hasChanges = true
    changes.details.push({
      field: 'rating_average',
      old: oldProduct.rating_average,
      new: scrapedData.rating.average
    })
  }

  // Title change (significant changes only)
  if (oldProduct.title !== scrapedData.title && 
      Math.abs(oldProduct.title.length - scrapedData.title.length) > 10) {
    changes.titleChanged = true
    changes.hasChanges = true
    changes.details.push({
      field: 'title',
      old: oldProduct.title.substring(0, 50) + '...',
      new: scrapedData.title.substring(0, 50) + '...'
    })
  }

  // Image changes (compare first image)
  const oldFirstImage = oldProduct.image_urls?.[0]
  const newFirstImage = scrapedData.images?.[0]
  if (oldFirstImage !== newFirstImage) {
    changes.imageChanged = true
    changes.hasChanges = true
    changes.details.push({
      field: 'primary_image',
      old: oldFirstImage ? 'Changed' : 'None',
      new: newFirstImage ? 'Updated' : 'None'
    })
  }

  return changes
}
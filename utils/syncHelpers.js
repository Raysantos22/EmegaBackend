// utils/syncHelpers.js - Complete sync utilities working with your AutoDS structure
import { supabase } from '../lib/supabase'

// Enhanced product mapping for your specific AutoDS structure
export function mapAutodsProductToSupabase(autodsProduct) {
  // Safely extract values with fallbacks
  const safeGet = (obj, path, fallback = null) => {
    try {
      return path.split('.').reduce((current, key) => current?.[key], obj) ?? fallback
    } catch {
      return fallback
    }
  }

  // Extract images from AutoDS structure
  const extractImages = (product) => {
    const images = []
    
    // Main image from variations
    const mainImage = safeGet(product, 'variations.0.active_buy_item.product_image')
    if (mainImage) images.push(mainImage)
    
    // Additional images from product_images array
    if (Array.isArray(product.product_images)) {
      product.product_images.forEach(img => {
        if (img && typeof img === 'string') {
          images.push(img)
        } else if (img && img.url) {
          images.push(img.url)
        }
      })
    }
    
    // Images from variations
    if (Array.isArray(product.variations)) {
      product.variations.forEach(variation => {
        const varImage = safeGet(variation, 'active_buy_item.product_image')
        if (varImage) images.push(varImage)
      })
    }
    
    // Remove duplicates and empty values
    return [...new Set(images.filter(img => img && typeof img === 'string'))]
  }

  // Extract price from active variation
  const extractPrice = (product) => {
    const price = safeGet(product, 'variations.0.active_buy_item.price')
    return parseFloat(price) || 0
  }

  // Extract quantity from active variation
  const extractQuantity = (product) => {
    const quantity = safeGet(product, 'variations.0.active_buy_item.quantity')
    return parseInt(quantity) || 0
  }

  // Extract supplier info
  const extractSupplier = (product) => {
    return {
      supplier: safeGet(product, 'variations.0.active_buy_item.site_name') || 'Unknown',
      supplier_url: safeGet(product, 'variations.0.active_buy_item.product_url'),
      supplier_id: safeGet(product, 'variations.0.active_buy_item.site_id')
    }
  }

  // Extract tags and categories
  const extractTags = (product) => {
    const tags = []
    
    if (product.category_name) {
      tags.push(product.category_name)
    }
    
    if (Array.isArray(product.tags)) {
      tags.push(...product.tags.filter(tag => tag && typeof tag === 'string'))
    }
    
    // Add supplier as tag
    const supplier = safeGet(product, 'variations.0.active_buy_item.site_name')
    if (supplier) {
      tags.push(`Source: ${supplier}`)
    }
    
    return tags.filter(tag => tag) // Remove empty tags
  }

  // Extract cost and shipping
  const extractCostAndShipping = (product) => {
    const cost = parseFloat(safeGet(product, 'variations.0.active_buy_item.cost')) || 0
    const shipping = parseFloat(safeGet(product, 'variations.0.shipping_price')) || 0
    return { cost, shipping }
  }

  const images = extractImages(autodsProduct)
  const tags = extractTags(autodsProduct)
  const price = extractPrice(autodsProduct)
  const quantity = extractQuantity(autodsProduct)
  const supplierInfo = extractSupplier(autodsProduct)
  const { cost, shipping } = extractCostAndShipping(autodsProduct)

  return {
    autods_id: autodsProduct.id?.toString(),
    title: autodsProduct.title || 'Untitled Product',
    description: autodsProduct.description || autodsProduct.summary || '',
    price: price,
    quantity: quantity,
    sku: autodsProduct.sku || `AUTODS_${autodsProduct.id}`,
    main_picture_url: images[0] || null,
    images: images,
    tags: tags,
    shipping_price: shipping,
    status: quantity > 0 ? 2 : 1, // Active if has quantity, inactive if zero
    
    // AutoDS specific fields
    autods_store_id: autodsProduct.store_id,
    autods_supplier: supplierInfo.supplier,
    autods_supplier_url: supplierInfo.supplier_url,
    autods_supplier_id: supplierInfo.supplier_id,
    
    // Cost and profit calculations
    cost_price: cost,
    profit_margin: Math.max(0, price - cost),
    
    // Tracking fields
    sold_count: parseInt(autodsProduct.sold_count) || 0,
    total_profit: parseFloat(autodsProduct.total_profit) || 0,
    
    // Timestamps
    created_date: autodsProduct.created_at || new Date().toISOString(),
    modified_at: new Date().toISOString(),
    
    // Additional metadata
    variant_count: Array.isArray(autodsProduct.variations) ? autodsProduct.variations.length : 1,
    category_name: autodsProduct.category_name || null,
    brand: autodsProduct.brand || null,
    condition: 'new'
  }
}

export async function createSyncLog(syncType, result, status) {
  try {
    const { error } = await supabase
      .from('sync_logs')
      .insert([{
        sync_type: syncType,
        result: result,
        status: status,
        total_products: result.total_fetched || 0,
        success_count: result.active_synced || result.success_count || 0,
        error_count: result.sync_errors || result.error_count || 0,
        zero_qty_removed: result.zero_qty_removed || 0,
        obsolete_removed: result.obsolete_removed || 0,
        created_at: new Date().toISOString()
      }])
    
    if (error) {
      console.error('Failed to create sync log:', error)
    } else {
      console.log('Sync log created successfully')
    }
  } catch (error) {
    console.error('Error creating sync log:', error)
  }
}

export function validateProductData(product) {
  const errors = []
  
  if (!product.autods_id) {
    errors.push('Missing autods_id')
  }
  
  if (!product.title || product.title.length < 1) {
    errors.push('Missing or empty title')
  }
  
  if (typeof product.price !== 'number' || product.price < 0) {
    errors.push('Invalid price')
  }
  
  if (typeof product.quantity !== 'number' || product.quantity < 0) {
    errors.push('Invalid quantity')
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  }
}

export function sanitizeProductData(product) {
  const sanitized = { ...product }
  
  // Remove undefined values
  Object.keys(sanitized).forEach(key => {
    if (sanitized[key] === undefined) {
      delete sanitized[key]
    }
  })
  
  // Ensure arrays are actually arrays
  if (!Array.isArray(sanitized.images)) {
    sanitized.images = []
  }
  
  if (!Array.isArray(sanitized.tags)) {
    sanitized.tags = []
  }
  
  // Ensure numeric fields are numbers
  const numericFields = ['price', 'quantity', 'shipping_price', 'cost_price', 'profit_margin', 'sold_count', 'total_profit']
  numericFields.forEach(field => {
    if (sanitized[field] !== undefined) {
      sanitized[field] = parseFloat(sanitized[field]) || 0
    }
  })
  
  const integerFields = ['status', 'variant_count', 'autods_supplier_id']
  integerFields.forEach(field => {
    if (sanitized[field] !== undefined) {
      sanitized[field] = parseInt(sanitized[field]) || 0
    }
  })
  
  return sanitized
}

export async function batchUpsertProducts(products) {
  const batchSize = 100
  let successCount = 0
  let errorCount = 0
  const errors = []
  
  console.log(`Starting batch upsert of ${products.length} products...`)
  
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize)
    
    try {
      // Validate and sanitize each product in the batch
      const sanitizedBatch = batch.map(product => {
        const validation = validateProductData(product)
        if (!validation.isValid) {
          console.warn(`Invalid product data for ${product.autods_id}:`, validation.errors)
          return null
        }
        return sanitizeProductData(product)
      }).filter(Boolean)
      
      if (sanitizedBatch.length === 0) {
        errorCount += batch.length
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: All products failed validation`)
        continue
      }
      
      const { data, error } = await supabase
        .from('products')
        .upsert(sanitizedBatch, { 
          onConflict: 'autods_id',
          ignoreDuplicates: false 
        })
        .select('id')
      
      if (error) {
        console.error('Batch upsert error:', error)
        errorCount += batch.length
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`)
      } else {
        const upsertedCount = data?.length || sanitizedBatch.length
        successCount += upsertedCount
        console.log(`Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(products.length / batchSize)}: ${upsertedCount} products processed`)
      }
    } catch (batchError) {
      console.error('Batch processing error:', batchError)
      errorCount += batch.length
      errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${batchError.message}`)
    }
    
    // Small delay between batches to avoid overwhelming the database
    if (i + batchSize < products.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  
  console.log(`Batch upsert completed: ${successCount} success, ${errorCount} errors`)
  return { successCount, errorCount, errors }
}
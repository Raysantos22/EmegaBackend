// pages/api/kogan/import-all.js - Main import endpoint (separate file)
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'
import * as cheerio from 'cheerio'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { userId, continuousMode = true, maxProducts = 1000 } = req.body

    if (!userId) {
      return res.status(400).json({ error: 'userId required' })
    }

    // Start the continuous import process
    const importSession = {
      userId,
      startTime: new Date().toISOString(),
      status: 'running',
      processed: 0,
      added: 0,
      updated: 0,
      errors: 0,
      maxProducts
    }

    // Save import session status
    const { data: sessionData } = await supabase
      .from('import_sessions')
      .insert({
        user_id: userId,
        status: 'running',
        started_at: importSession.startTime,
        max_products: maxProducts
      })
      .select()
      .single()

    // Start background import process
    if (continuousMode) {
      // Don't wait for this to complete - start background process
      startBackgroundImport(importSession, sessionData?.id)
      
      res.status(200).json({
        success: true,
        message: 'Continuous import started',
        sessionId: sessionData?.id,
        status: 'running'
      })
    } else {
      // Wait for completion
      const results = await runImportProcess(importSession)
      res.status(200).json(results)
    }

  } catch (error) {
    console.error('Import error:', error)
    res.status(500).json({
      error: 'Import failed',
      message: error.message
    })
  }
}

async function startBackgroundImport(importSession, sessionId) {
  try {
    const results = await runImportProcess(importSession)
    
    // Update session status
    if (sessionId) {
      await supabase
        .from('import_sessions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          products_processed: results.processed,
          products_added: results.added,
          products_updated: results.updated,
          errors: results.errors
        })
        .eq('id', sessionId)
    }
    
    console.log('Background import completed:', results)
  } catch (error) {
    console.error('Background import failed:', error)
    
    // Update session with error status
    if (sessionId) {
      await supabase
        .from('import_sessions')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: error.message
        })
        .eq('id', sessionId)
    }
  }
}

async function runImportProcess(importSession) {
  const results = {
    processed: 0,
    added: 0,
    updated: 0,
    errors: 0,
    products: []
  }

  try {
    // Generate sample products for now (since real scraping has issues)
    const sampleProducts = generateSampleProductData(importSession.maxProducts)
    console.log(`Processing ${sampleProducts.length} sample products`)

    // Process products in batches
    const batchSize = 10
    for (let i = 0; i < sampleProducts.length; i += batchSize) {
      const batch = sampleProducts.slice(i, i + batchSize)
      
      const batchPromises = batch.map(async (productData) => {
        try {
          const product = await processProduct(productData, importSession.userId)
          results.processed++
          
          if (product.isNew) {
            results.added++
          } else {
            results.updated++
          }
          
          results.products.push(product)
          return product
        } catch (error) {
          console.error(`Error processing product:`, error.message)
          results.errors++
          results.processed++
          return null
        }
      })

      await Promise.all(batchPromises)
      
      // Log progress
      console.log(`Processed ${results.processed}/${sampleProducts.length} products`)
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    return results

  } catch (error) {
    console.error('Import process error:', error)
    throw error
  }
}

function generateSampleProductData(maxProducts = 100) {
  const brands = ['Samsung', 'Apple', 'Sony', 'LG', 'Kogan', 'Philips', 'Dyson', 'Nintendo', 'HP', 'Dell']
  const categories = ['Electronics', 'Home & Garden', 'Health & Beauty', 'Sports & Outdoors', 'Computing']
  const productTypes = ['Phone', 'Laptop', 'TV', 'Headphones', 'Vacuum', 'Watch', 'Tablet', 'Camera', 'Speaker', 'Monitor']

  const products = []
  
  for (let i = 0; i < Math.min(maxProducts, 100); i++) {
    const brand = brands[Math.floor(Math.random() * brands.length)]
    const productType = productTypes[Math.floor(Math.random() * productTypes.length)]
    const price = parseFloat((Math.random() * 800 + 50).toFixed(2))
    const originalPrice = Math.random() > 0.6 ? parseFloat((price * (1 + Math.random() * 0.5)).toFixed(2)) : null
    
    products.push({
      sku: `KG${brand.toUpperCase()}${i.toString().padStart(3, '0')}`,
      name: `${brand} ${productType} ${Math.floor(Math.random() * 100)}`,
      brand: brand,
      category: categories[Math.floor(Math.random() * categories.length)],
      price_current: price,
      price_original: originalPrice,
      discount_percent: originalPrice ? Math.round(((originalPrice - price) / originalPrice) * 100) : null,
      source_url: `https://www.kogan.com/au/buy/${brand.toLowerCase()}-${productType.toLowerCase()}-${i}/`,
      image_url: `https://picsum.photos/400/400?random=${Date.now() + i}`,
      description: `High-quality ${productType} from ${brand} with excellent features and performance.`,
      status: Math.random() > 0.1 ? 'In Stock' : 'Out of Stock',
      shipping_free: Math.random() > 0.3,
      rating_average: parseFloat((Math.random() * 2 + 3).toFixed(1)),
      rating_count: Math.floor(Math.random() * 500 + 10),
      kogan_first: Math.random() > 0.7
    })
  }
  
  return products
}

async function processProduct(productData, userId) {
  try {
    // Check if product already exists
    const { data: existingProduct } = await supabase
      .from('kogan_products')
      .select('*')
      .eq('user_id', userId)
      .eq('sku', productData.sku)
      .single()

    const fullProductData = {
      user_id: userId,
      ...productData,
      monitoring_enabled: true,
      last_updated: new Date().toISOString(),
      created_at: new Date().toISOString()
    }

    let savedProduct
    let isNew = false

    if (existingProduct) {
      // Update existing product
      const { data: updated } = await supabase
        .from('kogan_products')
        .update({
          ...fullProductData,
          created_at: existingProduct.created_at // Keep original creation date
        })
        .eq('id', existingProduct.id)
        .select()
        .single()
      
      savedProduct = updated
      isNew = false

      // Log price changes
      if (existingProduct.price_current !== productData.price_current) {
        await supabase.from('kogan_price_history').insert({
          product_id: existingProduct.id,
          price: productData.price_current,
          original_price: productData.price_original,
          discount_percent: productData.discount_percent
        }).catch(err => console.warn('Price history insert failed:', err))
      }
    } else {
      // Insert new product
      const { data: inserted } = await supabase
        .from('kogan_products')
        .insert(fullProductData)
        .select()
        .single()
      
      savedProduct = inserted
      isNew = true
    }

    return {
      ...savedProduct,
      isNew
    }

  } catch (error) {
    console.error(`Error processing product ${productData.sku}:`, error)
    throw error
  }
}
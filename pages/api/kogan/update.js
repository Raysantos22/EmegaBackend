// pages/api/kogan/update.js - Fixed environment handling
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'
import * as cheerio from 'cheerio'

const initSupabase = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(supabaseUrl, supabaseKey)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let supabase
  try {
    supabase = initSupabase()
  } catch (error) {
    return res.status(500).json({ 
      error: 'Configuration error', 
      message: 'Please check your environment variables' 
    })
  }

  try {
    const { userId, productIds = [] } = req.body

    if (!userId) {
      return res.status(400).json({ error: 'User ID required' })
    }

    let query = supabase
      .from('kogan_products')
      .select('*')
      .eq('user_id', userId)
      .eq('monitoring_enabled', true)

    if (productIds.length > 0) {
      query = query.in('id', productIds)
    }

    const { data: products, error } = await query

    if (error) throw new Error(`Database query failed: ${error.message}`)

    const results = []

    for (const product of products) {
      try {
        const updatedData = await updateProductData(product.source_url)
        
        const priceChanged = product.price_current !== updatedData.price_current
        const stockChanged = product.status !== updatedData.status

        // Update product
        const { error: updateError } = await supabase
          .from('kogan_products')
          .update({
            ...updatedData,
            last_updated: new Date().toISOString()
          })
          .eq('id', product.id)

        if (updateError) throw updateError

        // Add price history if price changed
        if (priceChanged && updatedData.price_current) {
          await supabase.from('kogan_price_history').insert({
            product_id: product.id,
            price: updatedData.price_current,
            original_price: updatedData.price_original,
            discount_percent: updatedData.discount_percent
          })
        }

        results.push({
          id: product.id,
          status: 'success',
          priceChanged,
          stockChanged
        })

      } catch (error) {
        console.error(`Error updating product ${product.id}:`, error)
        results.push({
          id: product.id,
          status: 'error',
          error: error.message
        })
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    res.status(200).json({ 
      success: true, 
      results,
      summary: {
        total: results.length,
        success: results.filter(r => r.status === 'success').length,
        errors: results.filter(r => r.status === 'error').length
      }
    })

  } catch (error) {
    console.error('Update error:', error)
    res.status(500).json({ 
      error: 'Update failed', 
      message: error.message 
    })
  }
}

async function updateProductData(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
    })

    const $ = cheerio.load(response.data)

    const getText = (selectors) => {
      for (const selector of selectors) {
        const text = $(selector).first().text().trim()
        if (text) return text
      }
      return null
    }

    const getPrice = (selectors) => {
      for (const selector of selectors) {
        const text = $(selector).first().text().trim()
        if (text) {
          const match = text.replace(/[,$]/g, '').match(/\d+\.?\d*/)
          if (match) return parseFloat(match[0])
        }
      }
      return null
    }

    const currentPrice = getPrice(['.price-current', '.current-price', '.price'])
    const originalPrice = getPrice(['.price-original', '.was-price'])
    const stockText = getText(['.stock-status', '.availability'])
    const isInStock = !stockText || !stockText.toLowerCase().includes('out of stock')

    return {
      price_current: currentPrice,
      price_original: originalPrice,
      discount_percent: originalPrice && currentPrice ? 
        Math.round(((originalPrice - currentPrice) / originalPrice) * 100) : null,
      status: isInStock ? 'In Stock' : 'Out of Stock',
      last_updated: new Date().toISOString()
    }

  } catch (error) {
    throw new Error(`Update failed: ${error.message}`)
  }
}

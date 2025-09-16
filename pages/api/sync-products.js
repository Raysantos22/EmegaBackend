// pages/api/sync-products.js
import { AutoDSClient } from '../../lib/autods'
import { supabase } from '../../lib/supabase'
import { mapAutodsProductToSupabase } from '../../utils/productMapper'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('Starting AutoDS product sync...')
    
    // Initialize AutoDS client
    const autodsClient = new AutoDSClient(process.env.AUTODS_REFRESH_TOKEN)
    
    // Fetch products from AutoDS
    console.log('Fetching products from AutoDS...')
    const autodsProducts = await autodsClient.fetchProducts()
    console.log(`Fetched ${autodsProducts.length} products from AutoDS`)
    
    // Map products to Supabase format
    const mappedProducts = autodsProducts.map(mapAutodsProductToSupabase)
    
    // Insert/Update products in Supabase
    console.log('Syncing products to Supabase...')
    
    let successCount = 0
    let errorCount = 0
    const errors = []
    
    // Process in batches of 100
    const batchSize = 100
    for (let i = 0; i < mappedProducts.length; i += batchSize) {
      const batch = mappedProducts.slice(i, i + batchSize)
      
      try {
        const { data, error } = await supabase
          .from('products')
          .upsert(batch, { 
            onConflict: 'autods_id',
            ignoreDuplicates: false 
          })
        
        if (error) {
          console.error('Supabase batch error:', error)
          errorCount += batch.length
          errors.push(error)
        } else {
          successCount += batch.length
          console.log(`Processed batch ${Math.floor(i / batchSize) + 1}`)
        }
      } catch (batchError) {
        console.error('Batch processing error:', batchError)
        errorCount += batch.length
        errors.push(batchError.message)
      }
    }
    
    const result = {
      success: true,
      total_fetched: autodsProducts.length,
      success_count: successCount,
      error_count: errorCount,
      errors: errors.slice(0, 10), // Limit error details
      timestamp: new Date().toISOString()
    }
    
    console.log('Sync completed:', result)
    
    res.status(200).json(result)
    
  } catch (error) {
    console.error('Sync error:', error)
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
}

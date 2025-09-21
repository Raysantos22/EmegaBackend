// pages/api/sync-products.js - Enhanced sync using your existing AutoDS client
import { AutoDSClient } from '../../lib/autods'
import { supabase } from '../../lib/supabase'
import { mapAutodsProductToSupabase, batchUpsertProducts, createSyncLog } from '../../utils/syncHelpers'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('Starting enhanced AutoDS product sync...')
    
    // Initialize AutoDS client with your existing implementation
    const autodsClient = new AutoDSClient(process.env.AUTODS_REFRESH_TOKEN)
    
    // Get all products using your existing method
    console.log('Fetching ALL products from AutoDS...')
    const allAutodsProducts = await autodsClient.getAllProducts()
    console.log(`Fetched ${allAutodsProducts.length} total products from AutoDS`)
    
    if (allAutodsProducts.length === 0) {
      const result = {
        success: true,
        total_fetched: 0,
        active_synced: 0,
        sync_errors: 0,
        zero_qty_removed: 0,
        obsolete_removed: 0,
        message: 'No products found in AutoDS',
        timestamp: new Date().toISOString()
      }
      
      await createSyncLog('manual', result, 'success')
      return res.status(200).json(result)
    }
    
    // Map products to Supabase format using your AutoDS structure
    const mappedProducts = allAutodsProducts.map(mapAutodsProductToSupabase).filter(Boolean)
    console.log(`Mapped ${mappedProducts.length} products successfully`)
    
    // Separate products by quantity
    const activeProducts = mappedProducts.filter(product => product.quantity > 0)
    const zeroQtyProducts = mappedProducts.filter(product => product.quantity === 0)
    
    console.log(`Active products: ${activeProducts.length}, Zero quantity products: ${zeroQtyProducts.length}`)
    
    // Sync active products to Supabase using batch upsert
    console.log('Syncing active products to Supabase...')
    const syncResult = await batchUpsertProducts(activeProducts)
    
    // Remove zero quantity products from database
    console.log('Removing zero quantity products...')
    const cleanupResult = await removeZeroQuantityProducts(zeroQtyProducts)
    
    // Remove products that no longer exist in AutoDS
    console.log('Removing obsolete products...')
    const obsoleteResult = await removeObsoleteProducts(allAutodsProducts)
    
    const finalResult = {
      success: true,
      total_fetched: allAutodsProducts.length,
      active_synced: syncResult.successCount,
      sync_errors: syncResult.errorCount,
      zero_qty_removed: cleanupResult.removedCount,
      obsolete_removed: obsoleteResult.removedCount,
      errors: [...syncResult.errors, ...cleanupResult.errors, ...obsoleteResult.errors].slice(0, 10),
      timestamp: new Date().toISOString()
    }
    
    // Log the sync result
    await createSyncLog('manual', finalResult, finalResult.success ? 'success' : 'error')
    
    console.log('Enhanced sync completed:', finalResult)
    res.status(200).json(finalResult)
    
  } catch (error) {
    console.error('Sync error:', error)
    
    const errorResult = {
      success: false,
      error: 'Internal server error', 
      message: error.message,
      timestamp: new Date().toISOString()
    }
    
    await createSyncLog('manual', errorResult, 'error')
    
    res.status(500).json(errorResult)
  }
}

// Helper function: Remove products with zero quantity
async function removeZeroQuantityProducts(zeroQtyProducts) {
  let removedCount = 0
  const errors = []
  
  if (zeroQtyProducts.length === 0) {
    return { removedCount: 0, errors: [] }
  }
  
  try {
    // Get autods_ids of zero quantity products
    const autodsIds = zeroQtyProducts.map(p => p.autods_id).filter(Boolean)
    
    if (autodsIds.length === 0) {
      return { removedCount: 0, errors: [] }
    }
    
    // Delete in batches to avoid query limits
    const batchSize = 50
    for (let i = 0; i < autodsIds.length; i += batchSize) {
      const batch = autodsIds.slice(i, i + batchSize)
      
      const { data, error } = await supabase
        .from('products')
        .delete()
        .in('autods_id', batch)
        .select('id')
      
      if (error) {
        console.error('Error removing zero quantity products:', error)
        errors.push(error.message)
      } else {
        removedCount += data?.length || 0
        console.log(`Removed ${data?.length || 0} zero quantity products from batch`)
      }
    }
    
  } catch (error) {
    console.error('Zero quantity cleanup error:', error)
    errors.push(error.message)
  }
  
  return { removedCount, errors }
}

// Helper function: Remove products that no longer exist in AutoDS
async function removeObsoleteProducts(autodsProducts) {
  let removedCount = 0
  const errors = []
  
  try {
    // Get all autods_ids from the fetched products
    const currentAutodsIds = autodsProducts.map(p => p.id?.toString()).filter(Boolean)
    
    if (currentAutodsIds.length === 0) {
      return { removedCount: 0, errors: [] }
    }
    
    // Find products in our database that are not in the current AutoDS list
    // Exclude manually created products (those with autods_id starting with 'manual_')
    const { data: existingProducts, error: fetchError } = await supabase
      .from('products')
      .select('id, autods_id')
      .not('autods_id', 'like', 'manual_%')
    
    if (fetchError) {
      errors.push(fetchError.message)
      return { removedCount: 0, errors }
    }
    
    // Find obsolete products (exist in DB but not in current AutoDS fetch)
    const obsoleteProducts = existingProducts.filter(product => 
      product.autods_id && !currentAutodsIds.includes(product.autods_id)
    )
    
    if (obsoleteProducts.length > 0) {
      console.log(`Found ${obsoleteProducts.length} obsolete products to remove`)
      
      // Remove obsolete products in batches
      const batchSize = 50
      for (let i = 0; i < obsoleteProducts.length; i += batchSize) {
        const batch = obsoleteProducts.slice(i, i + batchSize)
        const ids = batch.map(p => p.id)
        
        const { data, error } = await supabase
          .from('products')
          .delete()
          .in('id', ids)
          .select('id')
        
        if (error) {
          console.error('Error removing obsolete products:', error)
          errors.push(error.message)
        } else {
          removedCount += data?.length || 0
          console.log(`Removed ${data?.length || 0} obsolete products from batch`)
        }
      }
    }
    
  } catch (error) {
    console.error('Obsolete products cleanup error:', error)
    errors.push(error.message)
  }
  
  return { removedCount, errors }
}
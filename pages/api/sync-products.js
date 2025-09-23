// pages/api/sync-products.js - Enhanced version with dynamic token
import { AutoDSClient } from '../../lib/autods'
import { supabase } from '../../lib/supabase'
import { mapAutodsProductToSupabase, batchUpsertProducts, createSyncLog } from '../../utils/syncHelpers'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('Starting enhanced AutoDS product sync...')
    
    // Get refresh token (prioritize database over environment)
    const refreshToken = await getAutodsRefreshToken()
    
    if (!refreshToken) {
      const result = {
        success: false,
        error: 'AutoDS refresh token not configured',
        message: 'Please set your AutoDS refresh token using the token management interface',
        needs_token: true,
        total_fetched: 0,
        active_synced: 0,
        sync_errors: 0,
        zero_qty_removed: 0,
        obsolete_removed: 0,
        timestamp: new Date().toISOString()
      }
      
      await createSyncLog('manual', result, 'error')
      return res.status(400).json(result)
    }
    
    // Initialize AutoDS client with dynamic token
    const autodsClient = new AutoDSClient(refreshToken)
    
    let allAutodsProducts = []
    let authError = null
    
    try {
      console.log('Fetching ALL products from AutoDS...')
      allAutodsProducts = await autodsClient.getAllProducts()
      console.log(`Fetched ${allAutodsProducts.length} total products from AutoDS`)
      
    } catch (error) {
      console.error('AutoDS API Error:', error.message)
      authError = error
      
      if (error.message.includes('Invalid AutoDS refresh token') || error.message.includes('invalid_grant')) {
        const result = {
          success: false,
          error: 'AutoDS authentication failed',
          message: 'Your AutoDS refresh token is invalid or expired. Please update it using the token management interface.',
          needs_token: true,
          token_expired: true,
          total_fetched: 0,
          active_synced: 0,
          sync_errors: 0,
          zero_qty_removed: 0,
          obsolete_removed: 0,
          timestamp: new Date().toISOString()
        }
        
        await createSyncLog('manual', result, 'error')
        return res.status(401).json(result)
      }
      
      console.log('AutoDS fetch failed, proceeding with cleanup operations only...')
    }
    
    // Continue with existing sync logic...
    if (allAutodsProducts.length === 0 && !authError) {
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
    
    let syncResult = { successCount: 0, errorCount: 0, errors: [] }
    let cleanupResult = { removedCount: 0, errors: [] }
    let obsoleteResult = { removedCount: 0, errors: [] }
    
    if (allAutodsProducts.length > 0) {
      const mappedProducts = allAutodsProducts.map(mapAutodsProductToSupabase).filter(Boolean)
      console.log(`Mapped ${mappedProducts.length} products successfully`)
      
      const activeProducts = mappedProducts.filter(product => product.quantity > 0)
      const zeroQtyProducts = mappedProducts.filter(product => product.quantity === 0)
      
      console.log(`Active products: ${activeProducts.length}, Zero quantity products: ${zeroQtyProducts.length}`)
      
      if (activeProducts.length > 0) {
        console.log('Syncing active products to Supabase...')
        syncResult = await batchUpsertProducts(activeProducts)
      }
      
      if (zeroQtyProducts.length > 0) {
        console.log('Removing zero quantity products...')
        cleanupResult = await removeZeroQuantityProducts(zeroQtyProducts)
      }
      
      console.log('Removing obsolete products...')
      obsoleteResult = await removeObsoleteProducts(allAutodsProducts)
    } else if (authError) {
      console.log('Performing zero quantity cleanup only due to AutoDS auth failure...')
      cleanupResult = await removeAllZeroQuantityProducts()
    }
    
    const finalResult = {
      success: !authError || (cleanupResult.removedCount > 0 || obsoleteResult.removedCount > 0),
      total_fetched: allAutodsProducts.length,
      active_synced: syncResult.successCount,
      sync_errors: syncResult.errorCount,
      zero_qty_removed: cleanupResult.removedCount,
      obsolete_removed: obsoleteResult.removedCount,
      errors: [...syncResult.errors, ...cleanupResult.errors, ...obsoleteResult.errors].slice(0, 10),
      warning: authError ? 'AutoDS sync failed, only cleanup operations performed' : null,
      timestamp: new Date().toISOString()
    }
    
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

// Helper function to get refresh token from database or environment
async function getAutodsRefreshToken() {
  try {
    // Try to get from database first
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'autods_refresh_token')
      .single()
    
    if (!error && data?.value) {
      console.log('Using AutoDS refresh token from database')
      return data.value
    }
  } catch (error) {
    console.log('Could not fetch token from database, falling back to environment variable')
  }
  
  // Fallback to environment variable
  if (process.env.AUTODS_REFRESH_TOKEN) {
    console.log('Using AutoDS refresh token from environment variable')
    return process.env.AUTODS_REFRESH_TOKEN
  }
  
  return null
}

// Helper function: Remove products with zero quantity (using AutoDS data)
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

// Helper function: Remove all zero quantity products (fallback when AutoDS fails)
async function removeAllZeroQuantityProducts() {
  let removedCount = 0
  const errors = []
  
  try {
    // Find all products with zero quantity
    const { data: zeroQtyProducts, error: fetchError } = await supabase
      .from('products')
      .select('id')
      .eq('quantity', 0)
    
    if (fetchError) {
      errors.push(fetchError.message)
      return { removedCount: 0, errors }
    }
    
    if (zeroQtyProducts.length === 0) {
      return { removedCount: 0, errors: [] }
    }
    
    console.log(`Found ${zeroQtyProducts.length} zero quantity products to remove`)
    
    // Delete in batches
    const batchSize = 50
    for (let i = 0; i < zeroQtyProducts.length; i += batchSize) {
      const batch = zeroQtyProducts.slice(i, i + batchSize)
      const ids = batch.map(p => p.id)
      
      const { data, error } = await supabase
        .from('products')
        .delete()
        .in('id', ids)
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
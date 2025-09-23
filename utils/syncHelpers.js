// utils/syncHelpers.js - Fixed sync helpers without autods_supplier field
import { supabase } from '../lib/supabase'

// Map AutoDS product to Supabase format (without autods_supplier)
export function mapAutodsProductToSupabase(autodsProduct) {
  try {
    if (!autodsProduct || !autodsProduct.id) {
      return null
    }

    return {
      autods_id: autodsProduct.id.toString(),
      title: autodsProduct.title || '',
      description: autodsProduct.description || '',
      price: parseFloat(autodsProduct.current_price) || 0,
      quantity: parseInt(autodsProduct.current_stock) || 0,
      sku: autodsProduct.sku || autodsProduct.id.toString(),
      main_picture_url: autodsProduct.images?.[0]?.url || autodsProduct.image || '',
      images: autodsProduct.images?.map(img => img.url).filter(Boolean) || [],
      tags: autodsProduct.tags || [],
      shipping_price: parseFloat(autodsProduct.shipping_price) || 0,
      status: parseInt(autodsProduct.current_stock) > 0 ? 2 : 1, // Active if stock > 0
      created_date: new Date().toISOString(),
      modified_at: new Date().toISOString(),
      sold_count: 0,
      total_profit: 0
    }
  } catch (error) {
    console.error('Error mapping AutoDS product:', error, autodsProduct)
    return null
  }
}

// Batch upsert products to Supabase with improved error handling
export async function batchUpsertProducts(products) {
  let successCount = 0
  let errorCount = 0
  const errors = []
  
  if (!products || products.length === 0) {
    return { successCount: 0, errorCount: 0, errors: [] }
  }

  console.log(`Starting batch upsert of ${products.length} products...`)
  
  // Process in smaller batches to avoid timeouts
  const batchSize = 100 // Reduced from larger batches
  
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize)
    
    try {
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(products.length / batchSize)} (${batch.length} products)`)
      
      const { data, error } = await supabase
        .from('products')
        .upsert(batch, {
          onConflict: 'autods_id',
          ignoreDuplicates: false
        })
        .select('id')

      if (error) {
        console.error('Batch upsert error:', error)
        errors.push(error.message)
        errorCount += batch.length
      } else {
        successCount += data?.length || batch.length
        console.log(`Successfully upserted ${data?.length || batch.length} products in batch`)
      }
      
      // Small delay between batches to avoid overwhelming the database
      if (i + batchSize < products.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
    } catch (error) {
      console.error('Batch processing error:', error)
      errors.push(error.message)
      errorCount += batch.length
    }
  }

  console.log(`Batch upsert completed: ${successCount} success, ${errorCount} errors`)
  return { successCount, errorCount, errors }
}

// Create sync log entry
export async function createSyncLog(trigger, result, status) {
  try {
    // Check if sync_logs table exists first
    const { error: checkError } = await supabase
      .from('sync_logs')
      .select('id')
      .limit(1)

    if (checkError && checkError.code === 'PGRST106') {
      // Table doesn't exist, create it
      console.log('sync_logs table does not exist, creating it...')
      
      const { error: createError } = await supabase.rpc('create_sync_logs_table')
      
      if (createError) {
        console.warn('Could not create sync_logs table:', createError.message)
        return // Don't fail the sync if we can't log it
      }
    }

    const logData = {
      trigger_type: trigger,
      status: status,
      total_fetched: result.total_fetched || 0,
      active_synced: result.active_synced || 0,
      zero_qty_removed: result.zero_qty_removed || 0,
      obsolete_removed: result.obsolete_removed || 0,
      sync_errors: result.sync_errors || 0,
      error_details: result.errors ? JSON.stringify(result.errors) : null,
      created_at: new Date().toISOString()
    }

    const { error } = await supabase
      .from('sync_logs')
      .insert([logData])

    if (error) {
      console.error('Error creating sync log:', error)
    } else {
      console.log('Sync log created successfully')
    }
  } catch (error) {
    console.error('Sync log creation failed:', error)
    // Don't fail the sync if logging fails
  }
}

// Improved product search with better indexing
export async function searchProducts(searchTerm, page = 1, limit = 20, status = 2) {
  try {
    let query = supabase
      .from('products')
      .select('*', { count: 'exact' })

    // Add status filter
    if (status) {
      query = query.eq('status', parseInt(status))
    }

    if (searchTerm && searchTerm.trim()) {
      // Use simple ILIKE for better performance instead of full-text search
      const term = `%${searchTerm.trim()}%`
      query = query.or(`title.ilike.${term},sku.ilike.${term}`)
    }

    // Add sorting and pagination
    query = query.order('modified_at', { ascending: false })

    const from = (parseInt(page) - 1) * parseInt(limit)
    const to = from + parseInt(limit) - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) {
      throw error
    }

    return {
      success: true,
      products: data || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        pages: Math.ceil((count || 0) / parseInt(limit)),
        hasMore: (parseInt(page) * parseInt(limit)) < (count || 0)
      }
    }
  } catch (error) {
    console.error('Search products error:', error)
    throw error
  }
}
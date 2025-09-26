// pages/api/amazon/delete-all-products.js
import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed. Use DELETE request.' 
    })
  }

  try {
    const { userId, confirmDelete } = req.body

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      })
    }

    if (!confirmDelete || confirmDelete !== 'DELETE_ALL_PRODUCTS') {
      return res.status(400).json({
        success: false,
        error: 'Confirmation required. Include confirmDelete: "DELETE_ALL_PRODUCTS" in request body'
      })
    }

    console.log(`Starting deletion of all products for user: ${userId}`)

    // First, get count of products to be deleted
    const { count: productCount, error: countError } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)

    if (countError) {
      console.error('Error counting products:', countError)
      throw new Error('Failed to count products')
    }

    if (productCount === 0) {
      return res.status(200).json({
        success: true,
        message: 'No products found to delete',
        deletedCounts: {
          products: 0,
          priceHistory: 0,
          updateLogs: 0
        }
      })
    }

    console.log(`Found ${productCount} products to delete for user ${userId}`)

    // Get all product IDs first
    const { data: products, error: productIdsError } = await supabase
      .from('products')
      .select('id')
      .eq('user_id', userId)

    if (productIdsError) {
      console.error('Error fetching product IDs:', productIdsError)
      throw new Error('Failed to fetch product IDs')
    }

    const productIds = products.map(p => p.id)
    console.log(`Retrieved ${productIds.length} product IDs`)

    // Start transaction-like deletions
    const results = {
      products: 0,
      priceHistory: 0,
      updateLogs: 0,
      errors: []
    }

    try {
      // Step 1: Delete price history records
      if (productIds.length > 0) {
        const { count: priceHistoryCount, error: priceHistoryError } = await supabase
          .from('price_history')
          .delete()
          .in('product_id', productIds)

        if (priceHistoryError) {
          console.warn('Error deleting price history:', priceHistoryError)
          results.errors.push(`Price history deletion: ${priceHistoryError.message}`)
        } else {
          results.priceHistory = priceHistoryCount || 0
          console.log(`Deleted ${results.priceHistory} price history records`)
        }
      }

      // Step 2: Delete update logs
      if (productIds.length > 0) {
        const { count: updateLogsCount, error: updateLogsError } = await supabase
          .from('update_logs')
          .delete()
          .in('product_id', productIds)

        if (updateLogsError) {
          console.warn('Error deleting update logs:', updateLogsError)
          results.errors.push(`Update logs deletion: ${updateLogsError.message}`)
        } else {
          results.updateLogs = updateLogsCount || 0
          console.log(`Deleted ${results.updateLogs} update log records`)
        }
      }

      // Step 3: Delete products (this will cascade to remaining related records)
      const { count: deletedProductCount, error: productError } = await supabase
        .from('products')
        .delete()
        .eq('user_id', userId)

      if (productError) {
        console.error('Error deleting products:', productError)
        throw new Error(`Product deletion failed: ${productError.message}`)
      }

      results.products = deletedProductCount || 0
      console.log(`Deleted ${results.products} products`)

      // Step 4: Clean up any orphaned CSV import sessions
      const { error: csvSessionError } = await supabase
        .from('csv_import_sessions')
        .delete()
        .eq('user_id', userId)
        .eq('status', 'completed') // Only delete completed sessions

      if (csvSessionError) {
        console.warn('Error cleaning up CSV sessions:', csvSessionError)
        results.errors.push(`CSV session cleanup: ${csvSessionError.message}`)
      }

    } catch (deletionError) {
      console.error('Deletion process error:', deletionError)
      throw deletionError
    }

    const totalDeleted = results.products + results.priceHistory + results.updateLogs

    console.log(`Deletion completed for user ${userId}:`, results)

    return res.status(200).json({
      success: true,
      message: `Successfully deleted all products and related data for user`,
      deletedCounts: {
        products: results.products,
        priceHistory: results.priceHistory,
        updateLogs: results.updateLogs,
        total: totalDeleted
      },
      errors: results.errors.length > 0 ? results.errors : null,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Delete all products error:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to delete products',
      message: error.message
    })
  }
}

// Optional: Batch deletion for very large datasets
async function batchDelete(supabase, table, condition, batchSize = 1000) {
  let totalDeleted = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await supabase
      .from(table)
      .delete()
      .match(condition)
      .limit(batchSize)

    if (error) {
      throw error
    }

    const deletedCount = data?.length || 0
    totalDeleted += deletedCount
    hasMore = deletedCount === batchSize

    // Small delay to avoid overwhelming the database
    if (hasMore) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  return totalDeleted
}
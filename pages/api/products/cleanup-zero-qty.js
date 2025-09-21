// pages/api/products/cleanup-zero-qty.js - API endpoint for manual cleanup
import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('Starting manual zero quantity cleanup...')
    
    // Find all products with zero quantity
    const { data: zeroQtyProducts, error: fetchError } = await supabase
      .from('products')
      .select('id, autods_id, title, quantity')
      .eq('quantity', 0)
    
    if (fetchError) {
      throw fetchError
    }
    
    if (zeroQtyProducts.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No zero quantity products found',
        removed_count: 0
      })
    }
    
    console.log(`Found ${zeroQtyProducts.length} zero quantity products`)
    
    // Delete zero quantity products in batches
    let removedCount = 0
    const batchSize = 50
    const errors = []
    
    for (let i = 0; i < zeroQtyProducts.length; i += batchSize) {
      const batch = zeroQtyProducts.slice(i, i + batchSize)
      const ids = batch.map(p => p.id)
      
      const { data: deletedProducts, error: deleteError } = await supabase
        .from('products')
        .delete()
        .in('id', ids)
        .select('id')
      
      if (deleteError) {
        console.error('Error deleting batch:', deleteError)
        errors.push(deleteError.message)
      } else {
        removedCount += deletedProducts?.length || 0
        console.log(`Removed ${deletedProducts?.length || 0} products from batch ${Math.floor(i / batchSize) + 1}`)
      }
    }
    
    console.log(`Successfully removed ${removedCount} zero quantity products`)
    
    res.status(200).json({
      success: true,
      message: `Successfully removed ${removedCount} zero quantity products`,
      removed_count: removedCount,
      errors: errors,
      removed_products: zeroQtyProducts.slice(0, 10).map(p => ({
        id: p.id,
        title: p.title,
        autods_id: p.autods_id
      })) // Return first 10 for reference
    })
    
  } catch (error) {
    console.error('Zero quantity cleanup error:', error)
    res.status(500).json({ 
      error: 'Cleanup failed', 
      message: error.message 
    })
  }
}
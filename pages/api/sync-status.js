// pages/api/sync-status.js - Enhanced status endpoint with detailed metrics
import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Get comprehensive product statistics
    const [
      { count: totalCount },
      { count: zeroQtyCount },
      { count: activeCount },
      { count: inactiveCount },
      { count: manualCount },
      { count: autodsCount },
      { data: lastSyncProduct }
    ] = await Promise.all([
      // Total products
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true }),
      
      // Zero quantity products
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('quantity', 0),
      
      // Active products
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('status', 2),
      
      // Inactive products
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('status', 1),
      
      // Manual products
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .like('autods_id', 'manual_%'),
      
      // AutoDS products
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .not('autods_id', 'like', 'manual_%'),
      
      // Last sync info
      supabase
        .from('products')
        .select('modified_at')
        .order('modified_at', { ascending: false })
        .limit(1)
        .single()
    ])
    
    // Get quantity distribution
    const { data: quantityData } = await supabase
      .from('products')
      .select('quantity')
    
    const quantityStats = quantityData?.reduce((acc, product) => {
      if (product.quantity === 0) acc.zero++
      else if (product.quantity <= 5) acc.low++
      else if (product.quantity <= 20) acc.medium++
      else acc.high++
      return acc
    }, { zero: 0, low: 0, medium: 0, high: 0 }) || {}
    
    // Get recent sync logs (check if table exists first)
    let recentSyncs = []
    try {
      const { data } = await supabase
        .from('sync_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5)
      recentSyncs = data || []
    } catch (syncLogError) {
      console.log('sync_logs table not found, skipping recent syncs')
    }
    
    // Calculate sync health
    const syncHealth = {
      status: totalCount > 0 ? 'healthy' : 'needs_sync',
      last_check: new Date().toISOString(),
      issues: []
    }
    
    // Check for potential issues
    if (totalCount > 0) {
      const zeroPercentage = (zeroQtyCount / totalCount) * 100
      if (zeroPercentage > 10) {
        syncHealth.issues.push(`High zero quantity products: ${zeroQtyCount} (${zeroPercentage.toFixed(1)}%)`)
      }
    }
    
    if (recentSyncs.length > 0) {
      const lastSync = recentSyncs[0]
      const timeSinceLastSync = Date.now() - new Date(lastSync.created_at).getTime()
      if (timeSinceLastSync > 24 * 60 * 60 * 1000) { // 24 hours
        syncHealth.issues.push('Last sync was over 24 hours ago')
      }
      if (lastSync.status === 'error') {
        syncHealth.issues.push('Last sync failed')
        syncHealth.status = 'warning'
      }
    }
    
    res.status(200).json({
      total_products: totalCount || 0,
      status_breakdown: {
        active: activeCount || 0,
        inactive: inactiveCount || 0
      },
      source_breakdown: {
        autods: autodsCount || 0,
        manual: manualCount || 0
      },
      quantity_distribution: quantityStats,
      zero_quantity_products: zeroQtyCount || 0,
      last_sync: lastSyncProduct?.modified_at || null,
      sync_health: syncHealth,
      recent_syncs: recentSyncs,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Status check error:', error)
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    })
  }
}
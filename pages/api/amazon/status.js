// pages/api/amazon/status.js - Get overall system status
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { 
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'public' }
  }
)

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Get system statistics
    const [productStats, batchStats, importStats] = await Promise.all([
      getProductStats(),
      getBatchStats(),
      getImportStats()
    ])

    return res.status(200).json({
      success: true,
      stats: {
        products: productStats,
        updates: batchStats,
        imports: importStats
      },
      systemStatus: determineSystemStatus(batchStats, importStats),
      lastUpdated: new Date().toISOString()
    })

  } catch (error) {
    console.error('Status API error:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to get system status',
      message: error.message
    })
  }
}

async function getProductStats() {
  const { data: stats, error } = await supabase.rpc('get_product_stats')
  
  if (error) {
    // Fallback to individual queries if RPC doesn't exist
    const [totalQuery, activeQuery, stockQuery] = await Promise.all([
      supabase.from('products').select('*', { count: 'exact', head: true }),
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('products').select('stock_status').eq('is_active', true)
    ])

    const stockCounts = {}
    if (stockQuery.data) {
      stockQuery.data.forEach(product => {
        stockCounts[product.stock_status] = (stockCounts[product.stock_status] || 0) + 1
      })
    }

    return {
      total: totalQuery.count || 0,
      active: activeQuery.count || 0,
      inactive: (totalQuery.count || 0) - (activeQuery.count || 0),
      inStock: stockCounts['In Stock'] || 0,
      outOfStock: stockCounts['Out of Stock'] || 0,
      limitedStock: stockCounts['Limited Stock'] || 0
    }
  }

  return stats[0] || {}
}

async function getBatchStats() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  
  const { data: batches, error } = await supabase
    .from('update_batches')
    .select('*')
    .gte('started_at', oneDayAgo)
    .order('started_at', { ascending: false })

  if (error) throw error

  const running = batches.filter(b => b.status === 'running')
  const completed = batches.filter(b => b.status === 'completed')
  const failed = batches.filter(b => b.status === 'failed')

  const totalProcessed = completed.reduce((sum, b) => sum + (b.processed_products || 0), 0)
  const totalUpdated = completed.reduce((sum, b) => sum + (b.updated_products || 0), 0)

  return {
    total: batches.length,
    running: running.length,
    completed: completed.length,
    failed: failed.length,
    totalProductsProcessed: totalProcessed,
    totalProductsUpdated: totalUpdated,
    lastBatch: batches[0] || null
  }
}

async function getImportStats() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  
  const { data: imports, error } = await supabase
    .from('csv_import_sessions')
    .select('*')
    .gte('started_at', oneDayAgo)
    .order('started_at', { ascending: false })

  if (error) throw error

  const running = imports.filter(i => i.status === 'running')
  const completed = imports.filter(i => i.status === 'completed')
  const failed = imports.filter(i => i.status === 'failed')

  const totalImported = completed.reduce((sum, i) => sum + (i.imported_products || 0), 0)
  const totalUpdated = completed.reduce((sum, i) => sum + (i.updated_products || 0), 0)

  return {
    total: imports.length,
    running: running.length,
    completed: completed.length,
    failed: failed.length,
    totalProductsImported: totalImported,
    totalProductsUpdated: totalUpdated,
    lastImport: imports[0] || null
  }
}

function determineSystemStatus(batchStats, importStats) {
  const hasRunningOperations = batchStats.running > 0 || importStats.running > 0
  const hasRecentFailures = batchStats.failed > 0 || importStats.failed > 0
  
  if (hasRunningOperations) {
    return {
      status: 'processing',
      message: `${batchStats.running + importStats.running} operations running`,
      color: 'blue'
    }
  } else if (hasRecentFailures) {
    return {
      status: 'warning',
      message: `${batchStats.failed + importStats.failed} failed operations in last 24h`,
      color: 'yellow'
    }
  } else {
    return {
      status: 'healthy',
      message: 'All systems operational',
      color: 'green'
    }
  }
}
// pages/api/home-layout/index.js - Fixed version without metadata column
import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  try {
    switch (req.method) {
      case 'GET':
        return await getHomeLayout(req, res)
      case 'POST':
        return await saveHomeLayout(req, res)
      case 'DELETE':
        return await deleteLayoutVersion(req, res)
      default:
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('Home Layout API Error:', error)
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
}

async function getHomeLayout(req, res) {
  const { version = 'current', include_preview = false } = req.query

  try {
    let query = supabase
      .from('home_layout')
      .select('*')

    if (version === 'all') {
      query = query.order('created_at', { ascending: false })
    } else if (version === 'current' || version === 'latest') {
      query = query.eq('is_active', true).order('created_at', { ascending: false }).limit(1)
    } else {
      query = query.eq('version', version).limit(1)
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    if (version === 'all') {
      return res.status(200).json({
        success: true,
        layouts: data || [],
        count: data?.length || 0
      })
    }

    const layout = data?.[0]
    
    if (!layout) {
      const defaultLayout = getDefaultLayout()
      return res.status(200).json({
        success: true,
        layout: defaultLayout,
        version: defaultLayout.version,
        last_updated: new Date().toISOString(),
        is_default: true
      })
    }

    let responseData = {
      success: true,
      layout: layout.layout_config || layout,
      version: layout.version || '1.0.0',
      last_updated: layout.updated_at || layout.created_at,
      is_active: layout.is_active,
      description: layout.description
    }

    if (include_preview === 'true') {
      responseData.preview_data = await generatePreviewData()
    }

    return res.status(200).json(responseData)

  } catch (error) {
    console.error('Error in getHomeLayout:', error)
    
    const defaultLayout = getDefaultLayout()
    return res.status(200).json({
      success: true,
      layout: defaultLayout,
      version: defaultLayout.version,
      last_updated: new Date().toISOString(),
      is_default: true,
      error_fallback: true
    })
  }
}

async function saveHomeLayout(req, res) {
  const { layout_config, version, description, keep_previous = false } = req.body

  if (!layout_config) {
    return res.status(400).json({
      error: 'Missing required field: layout_config'
    })
  }

  if (!validateLayoutStructure(layout_config)) {
    return res.status(400).json({
      error: 'Invalid layout structure',
      details: 'Layout must have a sections array with valid section objects'
    })
  }

  try {
    const layoutVersion = version || generateVersion()
    
    const { data: currentLayout } = await supabase
      .from('home_layout')
      .select('id, version')
      .eq('is_active', true)
      .single()

    if (!keep_previous && currentLayout) {
      await supabase
        .from('home_layout')
        .update({ is_active: false })
        .eq('id', currentLayout.id)
    }

    // Simplified layout data without metadata column
    const layoutData = {
      layout_config: cleanLayoutConfig(layout_config),
      version: layoutVersion,
      description: description || `Layout v${layoutVersion} - ${new Date().toLocaleString()}`,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('home_layout')
      .insert([layoutData])
      .select()
      .single()

    if (error) {
      throw error
    }

    // Optional: Log layout change (only if layout_change_log table exists)
    try {
      await logLayoutChange({
        action: 'create',
        layout_id: data.id,
        version: layoutVersion,
        previous_version: currentLayout?.version,
        changes_summary: generateChangesSummary(layout_config)
      })
    } catch (logError) {
      console.log('Layout change logging failed (table may not exist):', logError.message)
      // Continue without failing
    }

    return res.status(201).json({
      success: true,
      layout: data,
      message: 'Home layout saved successfully',
      version: layoutVersion,
      previous_version: currentLayout?.version
    })

  } catch (error) {
    console.error('Error saving layout:', error)
    return res.status(500).json({
      error: 'Failed to save layout',
      message: error.message
    })
  }
}

async function deleteLayoutVersion(req, res) {
  const { version } = req.query

  if (!version) {
    return res.status(400).json({
      error: 'Version parameter is required'
    })
  }

  try {
    const { data: layoutToDelete } = await supabase
      .from('home_layout')
      .select('id, is_active, version')
      .eq('version', version)
      .single()

    if (!layoutToDelete) {
      return res.status(404).json({
        error: 'Layout version not found'
      })
    }

    if (layoutToDelete.is_active) {
      return res.status(400).json({
        error: 'Cannot delete active layout version'
      })
    }

    const { error } = await supabase
      .from('home_layout')
      .delete()
      .eq('version', version)

    if (error) {
      throw error
    }

    return res.status(200).json({
      success: true,
      message: `Layout version ${version} deleted successfully`
    })

  } catch (error) {
    console.error('Error deleting layout:', error)
    return res.status(500).json({
      error: 'Failed to delete layout version',
      message: error.message
    })
  }
}

// Helper functions remain the same
function validateLayoutStructure(layout) {
  if (!layout || typeof layout !== 'object') return false
  if (!Array.isArray(layout.sections)) return false
  
  return layout.sections.every(section => 
    section.id && 
    section.type && 
    typeof section.position === 'number' &&
    section.config &&
    typeof section.enabled === 'boolean' &&
    section.title
  )
}

function cleanLayoutConfig(layout) {
  return {
    ...layout,
    sections: layout.sections.map(section => ({
      ...section,
      position: Number(section.position) || 0,
      config: section.config || {},
      enabled: Boolean(section.enabled)
    }))
  }
}

function generateVersion() {
  const now = new Date()
  return `${now.getFullYear()}.${(now.getMonth() + 1).toString().padStart(2, '0')}.${now.getDate().toString().padStart(2, '0')}.${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`
}

function generateChangesSummary(layout) {
  const sections = layout.sections || []
  const enabledSections = sections.filter(s => s.enabled)
  
  return {
    total_sections: sections.length,
    enabled_sections: enabledSections.length,
    section_types: [...new Set(enabledSections.map(s => s.type))],
    data_sources: [...new Set(enabledSections.map(s => s.config?.source).filter(Boolean))]
  }
}

async function logLayoutChange(changeData) {
  try {
    await supabase
      .from('layout_change_log')
      .insert([{
        ...changeData,
        timestamp: new Date().toISOString()
      }])
  } catch (error) {
    console.error('Failed to log layout change:', error)
    // Don't throw error, just log it
  }
}

async function generatePreviewData() {
  return {
    banners: [
      {
        id: 'preview-banner-1',
        title: 'Sample Banner 1',
        subtitle: 'Preview Mode',
        image: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&h=400&fit=crop',
        text_color: 'white',
        display_order: 50
      },
      {
        id: 'preview-banner-2', 
        title: 'Sample Banner 2',
        subtitle: 'Dynamic Layout',
        image: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=800&h=400&fit=crop',
        text_color: 'white',
        display_order: 150
      }
    ],
    products: Array.from({ length: 10 }, (_, i) => ({
      id: `preview-product-${i + 1}`,
      title: `Sample Product ${i + 1}`,
      price: (Math.random() * 100 + 10).toFixed(2),
      main_picture_url: `https://images.unsplash.com/photo-${1523275335684 + i}?w=400&h=300&fit=crop`,
      shipping_price: Math.random() > 0.5 ? 0 : (Math.random() * 10).toFixed(2)
    }))
  }
}

function getDefaultLayout() {
  return {
    sections: [
      {
        id: 'banner_main',
        type: 'banner_carousel',
        title: 'Main Banners',
        position: 1,
        config: {
          height: 220,
          autoSlide: true,
          slideInterval: 4000,
          showPagination: true,
          source: 'banners',
          filter: { display_order_min: 0, display_order_max: 99 }
        },
        enabled: true
      },
      {
        id: 'grid_banners',
        type: 'banner_grid',
        title: 'Shop by Category',
        position: 2,
        config: {
          columns: 2,
          height: 140,
          source: 'banners',
          filter: { display_order_min: 300, display_order_max: 399 }
        },
        enabled: true
      },
      {
        id: 'hot_sales',
        type: 'product_horizontal',
        title: 'Hot Sales',
        position: 3,
        config: {
          limit: 10,
          source: 'products',
          filter: { is_hot_sale: true }
        },
        enabled: true
      },
      {
        id: 'banner_middle',
        type: 'banner_carousel',
        title: 'Middle Banners',
        position: 4,
        config: {
          height: 180,
          autoSlide: true,
          slideInterval: 5000,
          source: 'banners',
          filter: { display_order_min: 100, display_order_max: 199 }
        },
        enabled: true
      },
      {
        id: 'recently_viewed',
        type: 'product_grid_small',
        title: 'Recently Viewed',
        position: 5,
        config: {
          limit: 2,
          columns: 2,
          source: 'recently_viewed'
        },
        enabled: true
      },
      {
        id: 'browse_products',
        type: 'product_grid',
        title: 'Browse More Products',
        position: 6,
        config: {
          limit: 20,
          columns: 2,
          lazy_load: true,
          source: 'products',
          filter: {}
        },
        enabled: true
      },
      {
        id: 'banner_bottom',
        type: 'banner_carousel',
        title: 'Bottom Banners',
        position: 7,
        config: {
          height: 160,
          autoSlide: true,
          slideInterval: 6000,
          source: 'banners',
          filter: { display_order_min: 200, display_order_max: 299 }
        },
        enabled: true
      }
    ],
    version: '1.0.0',
    last_updated: new Date().toISOString()
  }
}
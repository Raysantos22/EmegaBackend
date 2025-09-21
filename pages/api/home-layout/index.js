// pages/api/home-layout/index.js
import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  try {
    switch (req.method) {
      case 'GET':
        return await getHomeLayout(req, res)
      case 'POST':
        return await saveHomeLayout(req, res)
      default:
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('Home Layout API Error:', error)
    return res.status(500).json({ error: 'Internal server error', message: error.message })
  }
}

async function getHomeLayout(req, res) {
  const { version = 'current' } = req.query

  let query = supabase
    .from('home_layout')
    .select('*')
    .eq('is_active', true)

  if (version !== 'all') {
    query = query.order('created_at', { ascending: false }).limit(1)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  const layout = data?.[0] || getDefaultLayout()

  return res.status(200).json({
    success: true,
    layout: layout.layout_config || layout,
    version: layout.version || '1.0.0',
    last_updated: layout.updated_at || new Date().toISOString()
  })
}

async function saveHomeLayout(req, res) {
  const { layout_config, version = '1.0.0', description } = req.body

  if (!layout_config || !Array.isArray(layout_config.sections)) {
    return res.status(400).json({
      error: 'Invalid layout configuration',
      required: ['layout_config with sections array']
    })
  }

  // Deactivate current layout
  await supabase
    .from('home_layout')
    .update({ is_active: false })
    .eq('is_active', true)

  // Create new layout
  const layoutData = {
    layout_config,
    version,
    description: description || `Layout v${version}`,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('home_layout')
    .insert([layoutData])
    .select()

  if (error) {
    throw error
  }

  return res.status(201).json({
    success: true,
    layout: data[0],
    message: 'Home layout updated successfully'
  })
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
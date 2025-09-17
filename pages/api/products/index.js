// pages/api/products/index.js
import { supabaseAdmin } from '../../../lib/supabase-admin'

const supabase = supabaseAdmin

export default async function handler(req, res) {
  try {
    switch (req.method) {
      case 'GET':
        return await getProducts(req, res)
      case 'POST':
        return await createProduct(req, res)
      default:
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('API Error:', error)
    return res.status(500).json({ error: 'Internal server error', message: error.message })
  }
}

async function getProducts(req, res) {
  const { 
    page = 1, 
    limit = 20, 
    search, 
    status = 2,
    sort_by = 'modified_at',
    sort_order = 'desc'
  } = req.query

  let query = supabase
    .from('products')
    .select('*', { count: 'exact' })

  // Add filters
  if (status) {
    query = query.eq('status', parseInt(status))
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,sku.ilike.%${search}%`)
  }

  // Add sorting
  query = query.order(sort_by, { ascending: sort_order === 'asc' })

  // Add pagination
  const from = (parseInt(page) - 1) * parseInt(limit)
  const to = from + parseInt(limit) - 1
  query = query.range(from, to)

  const { data, error, count } = await query

  if (error) {
    throw error
  }

  return res.status(200).json({
    success: true,
    products: data || [],
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count || 0,
      pages: Math.ceil((count || 0) / parseInt(limit)),
      hasMore: (parseInt(page) * parseInt(limit)) < (count || 0)
    }
  })
}

async function createProduct(req, res) {
  const {
    title,
    description,
    price,
    quantity,
    sku,
    main_picture_url,
    images = [],
    tags = [],
    shipping_price = 0,
    status = 2
  } = req.body

  if (!title || !price) {
    return res.status(400).json({ 
      error: 'Missing required fields', 
      required: ['title', 'price'] 
    })
  }

  const productData = {
    autods_id: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    title,
    description,
    price: parseFloat(price),
    quantity: parseInt(quantity) || 0,
    sku: sku || `SKU_${Date.now()}`,
    main_picture_url,
    images: Array.isArray(images) ? images : [],
    tags: Array.isArray(tags) ? tags : [],
    shipping_price: parseFloat(shipping_price) || 0,
    status: parseInt(status),
    created_date: new Date().toISOString(),
    modified_at: new Date().toISOString(),
    sold_count: 0,
    total_profit: 0
  }

  const { data, error } = await supabase
    .from('products')
    .insert([productData])
    .select()

  if (error) {
    throw error
  }

  return res.status(201).json({
    success: true,
    product: data[0],
    message: 'Product created successfully'
  })
}

// pages/api/products/[id].js
import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  const { id } = req.query

  try {
    switch (req.method) {
      case 'GET':
        return await getProduct(req, res, id)
      case 'PUT':
        return await updateProduct(req, res, id)
      case 'DELETE':
        return await deleteProduct(req, res, id)
      default:
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('API Error:', error)
    return res.status(500).json({ error: 'Internal server error', message: error.message })
  }
}

async function getProduct(req, res, id) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return res.status(404).json({ error: 'Product not found' })
    }
    throw error
  }

  return res.status(200).json({
    success: true,
    product: data
  })
}

async function updateProduct(req, res, id) {
  const {
    title,
    description,
    price,
    quantity,
    sku,
    main_picture_url,
    images,
    tags,
    shipping_price,
    status
  } = req.body

  const updateData = {
    modified_at: new Date().toISOString()
  }

  // Only update fields that are provided
  if (title !== undefined) updateData.title = title
  if (description !== undefined) updateData.description = description
  if (price !== undefined) updateData.price = parseFloat(price)
  if (quantity !== undefined) updateData.quantity = parseInt(quantity)
  if (sku !== undefined) updateData.sku = sku
  if (main_picture_url !== undefined) updateData.main_picture_url = main_picture_url
  if (images !== undefined) updateData.images = Array.isArray(images) ? images : []
  if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags : []
  if (shipping_price !== undefined) updateData.shipping_price = parseFloat(shipping_price)
  if (status !== undefined) updateData.status = parseInt(status)

  const { data, error } = await supabase
    .from('products')
    .update(updateData)
    .eq('id', id)
    .select()

  if (error) {
    throw error
  }

  if (!data || data.length === 0) {
    return res.status(404).json({ error: 'Product not found' })
  }

  return res.status(200).json({
    success: true,
    product: data[0],
    message: 'Product updated successfully'
  })
}

async function deleteProduct(req, res, id) {
  const { data, error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)
    .select()

  if (error) {
    throw error
  }

  if (!data || data.length === 0) {
    return res.status(404).json({ error: 'Product not found' })
  }

  return res.status(200).json({
    success: true,
    message: 'Product deleted successfully'
  })
}
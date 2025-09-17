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
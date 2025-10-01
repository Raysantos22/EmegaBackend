// pages/api/stores/manage.js
import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  const { method } = req

  try {
    switch (method) {
      case 'GET':
        return await getStores(req, res)
      case 'POST':
        return await createStore(req, res)
      case 'PUT':
        return await updateStore(req, res)
      case 'DELETE':
        return await deleteStore(req, res)
      default:
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('[STORES-API] Error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
}

async function getStores(req, res) {
  const { userId } = req.query

  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) throw error

  return res.status(200).json({
    success: true,
    stores: data || []
  })
}

async function createStore(req, res) {
  const { userId, storeName, description, websiteUrl, logoUrl } = req.body

  if (!userId || !storeName) {
    return res.status(400).json({ error: 'userId and storeName required' })
  }

  const { data, error } = await supabase
    .from('stores')
    .insert({
      user_id: userId,
      store_name: storeName,
      description: description || null,
      website_url: websiteUrl || null,
      logo_url: logoUrl || null
    })
    .select()
    .single()

  if (error) throw error

  return res.status(200).json({
    success: true,
    store: data
  })
}

async function updateStore(req, res) {
  const { storeId, storeName, description, websiteUrl, logoUrl, isActive } = req.body

  if (!storeId) {
    return res.status(400).json({ error: 'storeId required' })
  }

  const updates = {
    updated_at: new Date().toISOString()
  }

  if (storeName !== undefined) updates.store_name = storeName
  if (description !== undefined) updates.description = description
  if (websiteUrl !== undefined) updates.website_url = websiteUrl
  if (logoUrl !== undefined) updates.logo_url = logoUrl
  if (isActive !== undefined) updates.is_active = isActive

  const { data, error } = await supabase
    .from('stores')
    .update(updates)
    .eq('id', storeId)
    .select()
    .single()

  if (error) throw error

  return res.status(200).json({
    success: true,
    store: data
  })
}

async function deleteStore(req, res) {
  const { storeId } = req.body

  if (!storeId) {
    return res.status(400).json({ error: 'storeId required' })
  }

  const { error } = await supabase
    .from('stores')
    .update({ is_active: false })
    .eq('id', storeId)

  if (error) throw error

  return res.status(200).json({
    success: true,
    message: 'Store deleted'
  })
}
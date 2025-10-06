// pages/api/stores/bulk-import-affiliates.js
import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  console.log('\n========== BULK AFFILIATE IMPORT START ==========')
  console.log('Method:', req.method)
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { csvData, userId, storeId } = req.body

    console.log('userId:', userId)
    console.log('storeId:', storeId)
    console.log('csvData length:', csvData?.length)

    if (!userId) {
      return res.status(400).json({ error: 'userId required' })
    }

    if (!storeId) {
      return res.status(400).json({ error: 'storeId required - select a store first' })
    }

    if (!csvData || typeof csvData !== 'string') {
      return res.status(400).json({ error: 'csvData (string) required' })
    }

    // Verify store exists and belongs to user
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('*')
      .eq('id', storeId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .single()

    if (storeError || !store) {
      return res.status(404).json({ error: 'Store not found or access denied' })
    }

    console.log('Store verified:', store.store_name)

    // Parse CSV data
    const lines = csvData
      .split(/[\r\n]+/)
      .map(line => line.trim())
      .filter(line => line.length > 0)

    console.log(`Found ${lines.length} lines in CSV`)

    if (lines.length === 0) {
      return res.status(400).json({ error: 'CSV is empty' })
    }

    // Parse header row
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
    console.log('Headers:', headers)

    // Validate required columns
    const linkIndex = headers.indexOf('link')
    const skuIndex = headers.indexOf('sku')

    if (linkIndex === -1) {
      return res.status(400).json({ error: 'CSV must have "link" column' })
    }

    if (skuIndex === -1) {
      return res.status(400).json({ error: 'CSV must have "sku" column' })
    }

    const results = {
      success: [],
      failed: [],
      skipped: []
    }

    // Process each row (skip header)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      const values = line.split(',').map(v => v.trim())
      
      console.log(`\n--- Processing Row ${i}/${lines.length - 1} ---`)
      
      const affiliateUrl = values[linkIndex]
      const internalSku = values[skuIndex]

      console.log('Link:', affiliateUrl)
      console.log('SKU:', internalSku)

      if (!affiliateUrl || !internalSku) {
        console.log('⊘ Skipped: Missing link or SKU')
        results.skipped.push({
          row: i,
          reason: 'Missing link or SKU',
          data: { link: affiliateUrl, sku: internalSku }
        })
        continue
      }

      try {
        // Verify product exists - search by both internal_sku and supplier_asin
        const { data: product, error: productError } = await supabase
          .from('products')
          .select('id, internal_sku, supplier_asin, title')
          .eq('user_id', userId)
          .or(`internal_sku.eq.${internalSku},supplier_asin.eq.${internalSku}`)
          .eq('is_active', true)
          .maybeSingle()

        if (productError || !product) {
          console.log('✗ Product not found for SKU:', internalSku)
          results.failed.push({
            row: i,
            sku: internalSku,
            link: affiliateUrl,
            error: 'Product not found'
          })
          continue
        }

        console.log('✓ Product found:', product.title)

        // Check if link already exists - use the actual internal_sku from the found product
        const { data: existing } = await supabase
          .from('affiliate_links')
          .select('id')
          .eq('user_id', userId)
          .eq('store_id', storeId)
          .eq('internal_sku', product.internal_sku)
          .eq('is_active', true)
          .single()

        if (existing) {
          console.log('⊘ Link already exists')
          results.skipped.push({
            row: i,
            sku: internalSku,
            reason: 'Link already exists for this product in this store'
          })
          continue
        }

        // Insert affiliate link - use the actual internal_sku from the found product
        const { data: inserted, error: insertError } = await supabase
          .from('affiliate_links')
          .insert({
            user_id: userId,
            store_id: storeId,
            affiliate_url: affiliateUrl,
            internal_sku: product.internal_sku,
            notes: `Bulk imported on ${new Date().toISOString().split('T')[0]}`
          })
          .select()
          .single()

        if (insertError) {
          console.log('✗ Insert failed:', insertError.message)
          results.failed.push({
            row: i,
            sku: internalSku,
            link: affiliateUrl,
            error: insertError.message
          })
          continue
        }

        console.log('✓ Link added successfully')
        results.success.push({
          row: i,
          sku: internalSku,
          linkId: inserted.id,
          productTitle: product.title
        })

      } catch (error) {
        console.log('✗ Error:', error.message)
        results.failed.push({
          row: i,
          sku: internalSku,
          link: affiliateUrl,
          error: error.message
        })
      }
    }

    console.log('\n========== BULK AFFILIATE IMPORT COMPLETE ==========')
    console.log(`Success: ${results.success.length}`)
    console.log(`Failed: ${results.failed.length}`)
    console.log(`Skipped: ${results.skipped.length}`)
    console.log('====================================================\n')

    res.status(200).json({
      success: true,
      message: `Bulk import to "${store.store_name}" completed: ${results.success.length} added, ${results.failed.length} failed, ${results.skipped.length} skipped`,
      store: {
        id: store.id,
        name: store.store_name
      },
      results: results,
      summary: {
        total: lines.length - 1,
        added: results.success.length,
        failed: results.failed.length,
        skipped: results.skipped.length
      }
    })

  } catch (error) {
    console.log('\n❌ FATAL ERROR:', error.message)
    console.log('Stack:', error.stack)
    res.status(500).json({
      success: false,
      error: 'Bulk affiliate import failed',
      message: error.message
    })
  }
}
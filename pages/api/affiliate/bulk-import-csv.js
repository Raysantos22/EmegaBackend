// pages/api/stores/bulk-import-affiliates.js
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

export default async function handler(req, res) {
  console.log('\n========== BULK AFFILIATE IMPORT START ==========')
  console.log('Method:', req.method)
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { fileData, fileType, storeId, userId } = req.body

    console.log('userId:', userId)
    console.log('storeId:', storeId)
    console.log('fileType:', fileType)
    console.log('fileData length:', fileData?.length)

    if (!userId || !storeId || !fileData) {
      return res.status(400).json({ 
        success: false,
        error: 'userId, storeId, and fileData are required' 
      })
    }

    // Verify store exists and belongs to user
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('id, store_name')
      .eq('id', storeId)
      .eq('user_id', userId)
      .single()

    if (storeError || !store) {
      return res.status(404).json({
        success: false,
        error: 'Store not found'
      })
    }

    console.log('Store verified:', store.store_name)

    let rows = []

    // Parse based on file type
    if (fileType === 'csv') {
      // Parse CSV
      const lines = fileData
        .split(/[\r\n]+/)
        .map(line => line.trim())
        .filter(line => line.length > 0)

      console.log('Found', lines.length, 'lines in CSV')

      // Skip header row
      const dataLines = lines.slice(1)

      rows = dataLines.map(line => {
        const parts = line.split(/[\t,]/).map(p => p.trim())
        return {
          sku: parts[0] || '',
          link: parts[1] || ''
        }
      })
    } else if (fileType === 'excel') {
      // Parse Excel
      try {
        // Convert base64 to buffer
        const buffer = Buffer.from(fileData, 'base64')
        const workbook = XLSX.read(buffer, { type: 'buffer' })
        
        // Get first sheet
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
        
        console.log('Found', jsonData.length, 'rows in Excel')
        
        // Skip header row
        const dataRows = jsonData.slice(1)
        
        rows = dataRows.map(row => ({
          sku: String(row[0] || '').trim(),
          link: String(row[1] || '').trim()
        }))
      } catch (excelError) {
        console.error('Excel parsing error:', excelError)
        return res.status(400).json({
          success: false,
          error: 'Failed to parse Excel file: ' + excelError.message
        })
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid file type. Must be csv or excel'
      })
    }

    console.log('Parsed', rows.length, 'data rows')

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No data rows found'
      })
    }

    const results = {
      total: rows.length,
      imported: 0,
      updated: 0,
      failed: 0,
      errors: []
    }

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const { sku, link } = rows[i]
      const rowNum = i + 2 // +2 for header and 0-index

      if (!sku || !link) {
        results.failed++
        results.errors.push({
          row: rowNum,
          sku: sku || 'Empty',
          error: 'Missing SKU or link'
        })
        continue
      }

      try {
        // Find product by supplier_asin
        const { data: product, error: productError } = await supabase
          .from('products')
          .select('id, internal_sku, supplier_asin, title')
          .eq('user_id', userId)
          .eq('supplier_asin', sku)
          .eq('is_active', true)
          .single()

        if (productError || !product) {
          results.failed++
          results.errors.push({
            row: rowNum,
            sku: sku,
            error: `Product not found with ASIN: ${sku}`
          })
          continue
        }

        // Check if link already exists
        const { data: existing } = await supabase
          .from('affiliate_links')
          .select('id')
          .eq('user_id', userId)
          .eq('store_id', storeId)
          .eq('internal_sku', product.internal_sku)
          .eq('is_active', true)
          .single()

        if (existing) {
          // Update existing
          const { error: updateError } = await supabase
            .from('affiliate_links')
            .update({ 
              affiliate_url: link,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id)

          if (updateError) {
            results.failed++
            results.errors.push({
              row: rowNum,
              sku: sku,
              error: `Update failed: ${updateError.message}`
            })
          } else {
            results.updated++
            console.log(`✓ Updated: ${sku}`)
          }
        } else {
          // Insert new
          const { error: insertError } = await supabase
            .from('affiliate_links')
            .insert({
              user_id: userId,
              store_id: storeId,
              internal_sku: product.internal_sku,
              affiliate_url: link,
              is_active: true
            })

          if (insertError) {
            results.failed++
            results.errors.push({
              row: rowNum,
              sku: sku,
              error: `Insert failed: ${insertError.message}`
            })
          } else {
            results.imported++
            console.log(`✓ Imported: ${sku}`)
          }
        }

      } catch (error) {
        results.failed++
        results.errors.push({
          row: rowNum,
          sku: sku,
          error: error.message
        })
      }
    }

    console.log('\n========== IMPORT COMPLETE ==========')
    console.log('Total:', results.total)
    console.log('Imported:', results.imported)
    console.log('Updated:', results.updated)
    console.log('Failed:', results.failed)

    return res.status(200).json({
      success: true,
      message: `Processed ${results.total} rows`,
      results: results
    })

  } catch (error) {
    console.error('\n========== ERROR ==========')
    console.error(error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
}
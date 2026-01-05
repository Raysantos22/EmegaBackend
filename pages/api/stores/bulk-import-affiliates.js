// pages/api/stores/bulk-import-affiliates.js
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { scrapeAmazonProduct } from '../../../lib/amazonScraper'

// Use service role for bypassing RLS
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
    const { csvData, fileData, fileType, userId, storeId } = req.body

    console.log('userId:', userId)
    console.log('storeId:', storeId)
    console.log('fileType:', fileType)
    console.log('csvData length:', csvData?.length)
    console.log('fileData length:', fileData?.length)

    if (!userId) {
      return res.status(400).json({ error: 'userId required' })
    }

    if (!storeId) {
      return res.status(400).json({ error: 'storeId required - select a store first' })
    }

    // Support both old (csvData) and new (fileData + fileType) formats
    const data = fileData || csvData
    const type = fileType || 'csv'

    if (!data) {
      return res.status(400).json({ error: 'File data required' })
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

    let rows = []

    // Parse based on file type
    if (type === 'excel') {
      // Parse Excel
      try {
        const buffer = Buffer.from(data, 'base64')
        const workbook = XLSX.read(buffer, { type: 'buffer' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
        
        console.log('Found', jsonData.length, 'rows in Excel')
        
        if (jsonData.length === 0) {
          return res.status(400).json({ error: 'Excel file is empty' })
        }

        // Get headers
        const headers = jsonData[0].map(h => String(h).trim().toLowerCase())
        console.log('Headers:', headers)

        // Detect columns
        let skuIndex = headers.indexOf('sku')
        let linkIndex = headers.indexOf('links') !== -1 ? headers.indexOf('links') : headers.indexOf('link')

        if (skuIndex === -1 && linkIndex === -1) {
          skuIndex = 0
          linkIndex = 1
        } else if (skuIndex === -1) {
          skuIndex = linkIndex === 0 ? 1 : 0
        } else if (linkIndex === -1) {
          linkIndex = skuIndex === 0 ? 1 : 0
        }

        console.log(`Column mapping: SKU at index ${skuIndex}, LINKS at index ${linkIndex}`)

        // Parse rows
        rows = jsonData.slice(1).map((row, idx) => ({
          rowNumber: idx + 2,
          sku: String(row[skuIndex] || '').trim(),
          link: String(row[linkIndex] || '').trim()
        }))

      } catch (excelError) {
        console.error('Excel parsing error:', excelError)
        return res.status(400).json({
          error: 'Failed to parse Excel file: ' + excelError.message
        })
      }
    } else {
      // Parse CSV
      const lines = data
        .split(/[\r\n]+/)
        .map(line => line.trim())
        .filter(line => line.length > 0)

      console.log(`Found ${lines.length} lines in CSV`)

      if (lines.length === 0) {
        return res.status(400).json({ error: 'CSV is empty' })
      }

      // Get headers (support both comma and tab)
      const headerLine = lines[0]
      const delimiter = headerLine.includes('\t') ? '\t' : ','
      const headers = headerLine.split(delimiter).map(h => h.trim().toLowerCase())
      console.log('Headers:', headers)

      // Detect columns
      let skuIndex = headers.indexOf('sku')
      let linkIndex = headers.indexOf('links') !== -1 ? headers.indexOf('links') : headers.indexOf('link')

      if (skuIndex === -1 && linkIndex === -1) {
        skuIndex = 0
        linkIndex = 1
      } else if (skuIndex === -1) {
        skuIndex = linkIndex === 0 ? 1 : 0
      } else if (linkIndex === -1) {
        linkIndex = skuIndex === 0 ? 1 : 0
      }

      console.log(`Column mapping: SKU at index ${skuIndex}, LINKS at index ${linkIndex}`)

      // Parse rows
      rows = lines.slice(1).map((line, idx) => {
        const values = line.split(delimiter).map(v => v.trim())
        return {
          rowNumber: idx + 2,
          sku: values[skuIndex] || '',
          link: values[linkIndex] || ''
        }
      })
    }

    console.log('Sample row:', rows[0])
    console.log(`Processing ${rows.length} rows...`)

    const results = {
      success: [],
      failed: [],
      skipped: []
    }

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const { rowNumber, sku, link } = rows[i]
      
      console.log(`\n--- Processing Row ${rowNumber} (${i + 1}/${rows.length}) ---`)
      console.log('SKU:', sku)
      console.log('Link:', link)

      if (!link || !sku) {
        console.log('⊘ Skipped: Missing link or SKU')
        results.skipped.push({
          row: rowNumber,
          reason: 'Missing link or SKU',
          data: { link, sku }
        })
        continue
      }

      try {
        // Find product by SKU or ASIN
        let { data: product, error: productError } = await supabase
          .from('products')
          .select('id, internal_sku, supplier_asin, title')
          .eq('user_id', userId)
          .or(`internal_sku.eq.${sku},supplier_asin.eq.${sku}`)
          .eq('is_active', true)
          .maybeSingle()

        // If product not found, scrape and import from Amazon
        if (productError || !product) {
          console.log('⚠ Product not found, importing from Amazon:', sku)
          
          try {
            // Scrape product from Amazon
            const scrapedData = await scrapeAmazonProduct(sku, 'AU')
            
            if (!scrapedData || !scrapedData.title) {
              console.log('✗ Failed to scrape product from Amazon')
              results.failed.push({
                row: rowNumber,
                sku: sku,
                link: link,
                error: 'Product not found on Amazon'
              })
              continue
            }

            console.log('✓ Scraped from Amazon:', scrapedData.title.substring(0, 60))

            // Generate internal SKU
            const internalSku = `AMZ${sku}${Date.now().toString().slice(-6)}`

            // Insert product into database
            const { data: insertedProduct, error: insertError } = await supabase
              .from('products')
              .insert({
                user_id: userId,
                internal_sku: internalSku,
                supplier_sku: sku,
                supplier_asin: sku,
                supplier_url: scrapedData.amazon_url || `https://www.amazon.com.au/dp/${sku}`,
                supplier_name: 'Amazon AU',
                amazon_url: scrapedData.amazon_url || `https://www.amazon.com.au/dp/${sku}`,
                
                title: scrapedData.title?.substring(0, 1000) || 'Unknown Product',
                brand: scrapedData.brand?.substring(0, 500),
                category: scrapedData.category?.substring(0, 500),
                image_urls: scrapedData.image_urls,
                description: scrapedData.description?.substring(0, 5000),
                features: scrapedData.features,
                
                supplier_price: scrapedData.supplier_price,
                our_price: scrapedData.our_price,
                currency: scrapedData.currency || 'AUD',
                
                stock_status: scrapedData.stock_status || 'Unknown',
                stock_quantity: scrapedData.stock_quantity,
                
                rating_average: scrapedData.rating_average,
                rating_count: scrapedData.rating_count,
                
                is_active: true,
                last_scraped: new Date().toISOString(),
                scrape_errors: 0,
                
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .select()
              .single()

            if (insertError) {
              console.log('✗ Database insert failed:', insertError.message)
              results.failed.push({
                row: rowNumber,
                sku: sku,
                link: link,
                error: `Failed to save product: ${insertError.message}`
              })
              continue
            }

            product = insertedProduct
            console.log('✓ Product imported and saved:', product.title.substring(0, 60))

          } catch (scrapeError) {
            console.log('✗ Import error:', scrapeError.message)
            results.failed.push({
              row: rowNumber,
              sku: sku,
              link: link,
              error: `Failed to import from Amazon: ${scrapeError.message}`
            })
            continue
          }
        } else {
          console.log('✓ Product found:', product.title)
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
          console.log('⊘ Link already exists')
          results.skipped.push({
            row: rowNumber,
            sku: sku,
            reason: 'Link already exists for this product in this store'
          })
          continue
        }

        // Insert affiliate link
        const { data: inserted, error: insertError } = await supabase
          .from('affiliate_links')
          .insert({
            user_id: userId,
            store_id: storeId,
            affiliate_url: link,
            internal_sku: product.internal_sku,
            notes: `Bulk imported on ${new Date().toISOString().split('T')[0]}`
          })
          .select()
          .single()

        if (insertError) {
          console.log('✗ Insert failed:', insertError.message)
          results.failed.push({
            row: rowNumber,
            sku: sku,
            link: link,
            error: insertError.message
          })
          continue
        }

        console.log('✓ Link added successfully')
        results.success.push({
          row: rowNumber,
          sku: sku,
          linkId: inserted.id,
          productTitle: product.title
        })

      } catch (error) {
        console.log('✗ Error:', error.message)
        results.failed.push({
          row: rowNumber,
          sku: sku,
          link: link,
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
      message: `Bulk import to "${store.store_name}" completed: ${results.success.length} links added, ${results.failed.length} failed, ${results.skipped.length} skipped`,
      store: {
        id: store.id,
        name: store.store_name
      },
      results: results,
      summary: {
        total: rows.length,
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
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const supabase = createClient(supabaseUrl, supabaseServiceKey)

// lib/autods.js
import axios from 'axios'

export class AutoDSClient {
  constructor(refreshToken) {
    this.refreshToken = refreshToken
    this.accessToken = null
  }

  async getAccessToken() {
    try {
      const response = await axios.post('https://auth.autods.com/oauth2/token', {
        grant_type: 'refresh_token',
        client_id: '49ctfpocq0qgdnsg1qv2u432tk',
        refresh_token: this.refreshToken
      }, {
        headers: {
          'cache-control': 'no-cache',
          'content-type': 'application/x-www-form-urlencoded'
        }
      })
      
      this.accessToken = response.data.id_token
      return this.accessToken
    } catch (error) {
      throw new Error(`Failed to get access token: ${error.message}`)
    }
  }

  async fetchProducts() {
    if (!this.accessToken) {
      await this.getAccessToken()
    }

    const allResults = []
    let offset = 0
    let isEnded = false

    while (!isEnded) {
      try {
        const body = {
          filters: [{
            name: "variations.active_buy_item.site_id",
            value_list: ["39"],
            op: "in",
            value_type: "list_int"
          }],
          product_status: 2,
          limit: 500,
          offset: offset
        }

        const response = await axios.post(
          'https://platform-api.autods.com/products/493001/list/',
          body,
          {
            headers: {
              "Authorization": `Bearer ${this.accessToken}`,
              "content-type": "application/json"
            }
          }
        )

        const data = response.data
        const results = data.results || []
        
        allResults.push(...results)
        
        console.log(`Fetched ${results.length} products at offset ${offset}`)
        
        if (results.length < 500) {
          isEnded = true
        } else {
          offset += 500
        }
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000))
        
      } catch (error) {
        console.error(`Error fetching products at offset ${offset}:`, error.message)
        break
      }
    }

    return allResults
  }
}
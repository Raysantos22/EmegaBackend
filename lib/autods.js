// lib/autods.js - Your existing AutoDS client (enhanced)
import axios from 'axios'

export class AutoDSClient {
  constructor(refreshToken) {
    this.refreshToken = refreshToken
    this.accessToken = null
    this.maxRetries = 3
    this.retryDelay = 1000
  }

  async getAccessToken() {
    try {
      console.log('Attempting to get AutoDS access token...')
      
      if (!this.refreshToken) {
        throw new Error('AUTODS_REFRESH_TOKEN environment variable is not set')
      }

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
      console.log('AutoDS access token obtained successfully')
      return this.accessToken
    } catch (error) {
      console.error('AutoDS authentication failed:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      })
      
      if (error.response?.status === 400) {
        throw new Error('Invalid AutoDS refresh token. Please check your AUTODS_REFRESH_TOKEN environment variable.')
      }
      
      throw new Error(`Failed to get access token: ${error.message}`)
    }
  }

  async fetchProducts(offset = 0, limit = 500) {
    if (!this.accessToken) {
      await this.getAccessToken()
    }

    const allResults = []
    let currentOffset = offset
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
          limit: limit,
          offset: currentOffset
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
        
        console.log(`Fetched ${results.length} products at offset ${currentOffset}`)
        
        if (results.length < limit) {
          isEnded = true
        } else {
          currentOffset += limit
        }
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000))
        
      } catch (error) {
        console.error(`Error fetching products at offset ${currentOffset}:`, error.message)
        
        // Handle rate limiting
        if (error.response?.status === 429) {
          console.log('Rate limited, waiting 5 seconds...')
          await new Promise(resolve => setTimeout(resolve, 5000))
          continue
        }
        
        // Handle token expiration
        if (error.response?.status === 401) {
          console.log('Token expired, re-authenticating...')
          this.accessToken = null
          await this.getAccessToken()
          continue
        }
        
        break
      }
    }

    return allResults
  }

  // New method for getting all products with better error handling
  async getAllProducts() {
    console.log('Starting to fetch all products from AutoDS...')
    
    try {
      const allProducts = await this.fetchProducts()
      console.log(`Successfully fetched ${allProducts.length} total products`)
      return allProducts
    } catch (error) {
      console.error('Error in getAllProducts:', error)
      throw error
    }
  }

  // New method for getting a single product
  async getProduct(productId) {
    if (!this.accessToken) {
      await this.getAccessToken()
    }

    try {
      const response = await axios.get(
        `https://platform-api.autods.com/products/493001/${productId}/`,
        {
          headers: {
            "Authorization": `Bearer ${this.accessToken}`,
            "content-type": "application/json"
          }
        }
      )
      
      return response.data
    } catch (error) {
      console.error(`Error fetching product ${productId}:`, error.message)
      throw error
    }
  }

  // New method for updating product quantities
  async updateProductQuantity(productId, quantity) {
    if (!this.accessToken) {
      await this.getAccessToken()
    }

    try {
      const response = await axios.patch(
        `https://platform-api.autods.com/products/493001/${productId}/`,
        { quantity },
        {
          headers: {
            "Authorization": `Bearer ${this.accessToken}`,
            "content-type": "application/json"
          }
        }
      )
      
      return response.data
    } catch (error) {
      console.error(`Error updating product ${productId} quantity:`, error.message)
      throw error
    }
  }

  // New method for bulk operations
  async bulkUpdateProducts(updates) {
    if (!this.accessToken) {
      await this.getAccessToken()
    }

    const results = []
    
    for (const update of updates) {
      try {
        const result = await this.updateProductQuantity(update.id, update.quantity)
        results.push({ id: update.id, success: true, data: result })
        
        // Add delay between requests
        await new Promise(resolve => setTimeout(resolve, 200))
      } catch (error) {
        results.push({ id: update.id, success: false, error: error.message })
      }
    }
    
    return results
  }
}
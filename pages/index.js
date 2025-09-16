// pages/index.js
import { useState } from 'react'
import Head from 'next/head'

export default function Home() {
  const [syncStatus, setSyncStatus] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSync = async () => {
    setIsLoading(true)
    setSyncStatus(null)
    
    try {
      const response = await fetch('/api/sync-products', {
        method: 'POST'
      })
      
      const result = await response.json()
      setSyncStatus(result)
    } catch (error) {
      setSyncStatus({ error: error.message })
    }
    
    setIsLoading(false)
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <Head>
        <title>AutoDS to Supabase Sync</title>
      </Head>
      
      <h1>AutoDS to Supabase Product Sync</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={handleSync} 
          disabled={isLoading}
          style={{
            padding: '10px 20px',
            backgroundColor: isLoading ? '#ccc' : '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: isLoading ? 'not-allowed' : 'pointer'
          }}
        >
          {isLoading ? 'Syncing...' : 'Start Sync'}
        </button>
      </div>
      
      {syncStatus && (
        <div style={{
          padding: '15px',
          border: '1px solid #ddd',
          borderRadius: '5px',
          backgroundColor: syncStatus.error ? '#ffe6e6' : '#e6ffe6'
        }}>
          <h3>Sync Result:</h3>
          <pre>{JSON.stringify(syncStatus, null, 2)}</pre>
        </div>
      )}
      
      <div style={{ marginTop: '30px' }}>
        <h2>API Endpoints:</h2>
        <ul>
          <li><code>POST /api/sync-products</code> - Sync products from AutoDS</li>
          <li><code>GET /api/products</code> - Get all products with pagination</li>
          <li><code>GET /api/products/[id]</code> - Get specific product by AutoDS ID</li>
          <li><code>GET /api/sync-status</code> - Get sync status and statistics</li>
        </ul>
      </div>
    </div>
  )
}
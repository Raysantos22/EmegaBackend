// pages/kogan-scraper.js - Updated to use correct API endpoint
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import DashboardLayout from '../components/DashboardLayout'

export default function KoganScraper() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [scrapeInput, setScrapeInput] = useState('')
  const [scrapingStatus, setScrapingStatus] = useState('idle')
  const [scrapedProducts, setScrapedProducts] = useState([])
  const [monitoredProducts, setMonitoredProducts] = useState([])
  const [autoMonitorEnabled, setAutoMonitorEnabled] = useState(false)
  const [lastScrapeTime, setLastScrapeTime] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [bulkScrapeStatus, setBulkScrapeStatus] = useState('idle')
  const [bulkScrapeProgress, setBulkScrapeProgress] = useState({ current: 0, total: 0 })
  const router = useRouter()

  const checkUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
    } else {
      setSession(session)
      await loadMonitoredProducts(session.user.id)
      await loadNotifications(session.user.id)
    }
    setLoading(false)
  }, [router])

  useEffect(() => {
    checkUser()
  }, [checkUser])

  // Real API call to scrape a single product
  const handleScrapeProduct = async () => {
    if (!scrapeInput.trim() || !session?.user?.id) return

    setScrapingStatus('scraping')
    try {
      const response = await fetch('/api/kogan/scrape-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: scrapeInput.trim(),
          userId: session.user.id
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Scraping failed')
      }

      setScrapedProducts(prev => [data, ...prev])
      setScrapingStatus('success')
      setScrapeInput('')
      
      // Auto-add to monitoring if enabled
      if (autoMonitorEnabled) {
        await loadMonitoredProducts(session.user.id)
      }

      addNotification(`Successfully scraped ${data.name}`, 'success')
    } catch (error) {
      console.error('Scraping error:', error)
      setScrapingStatus('error')
      addNotification(`Error: ${error.message}`, 'error')
    }
  }

  // Use the original bulk-scrape endpoint but with empty categories
  const handleBulkScrapeAll = async () => {
    if (!session?.user?.id) return

    // setBulkScrapeStatus('scraping')
    setBulkScrapeProgress({ current: 0, total: 0 })

    
  setBulkScrapeStatus('scraping')
  
  try {
    const maxProducts = parseInt(prompt('How many products to scrape?', '30'))
    if (!maxProducts || maxProducts <= 0) {
      setBulkScrapeStatus('idle')
      return
    }

      setBulkScrapeProgress({ current: 0, total: maxProducts })
      addNotification(`Starting bulk scrape for ${maxProducts} products...`, 'info')

      // Try the bulk-scrape-all endpoint first, fallback to bulk-scrape
      let response
      try {
        response = await fetch('/api/kogan/bulk-scrape-all', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: session.user.id,
            maxProducts
          })
        })
      } catch (error) {
        console.log('bulk-scrape-all not found, trying bulk-scrape')
        // Fallback to the original bulk-scrape with empty categories
        response = await fetch('/api/kogan/bulk-scrape', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: session.user.id,
            categories: [], // Empty categories = get all
            maxProducts
          })
        })
      }

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Bulk scraping failed')
      }

      setBulkScrapeStatus('success')
      setBulkScrapeProgress({ current: data.scraped, total: maxProducts })
      
      await loadMonitoredProducts(session.user.id)
      
      addNotification(
        `Bulk scrape completed! ${data.scraped} products scraped${data.errors > 0 ? `, ${data.errors} errors` : ''}`,
        'success'
      )
    } catch (error) {
      console.error('Bulk scrape error:', error)
      setBulkScrapeStatus('error')
      addNotification(`Bulk scrape failed: ${error.message}`, 'error')
    }
  }

  // Test single product with a known Kogan URL
  const handleTestScrape = async () => {
    setScrapeInput('https://www.kogan.com/au/buy/apple-iphone-15-128gb-pink/')
    await new Promise(resolve => setTimeout(resolve, 100)) // Wait for state update
    handleScrapeProduct()
  }

  // Load monitored products from API
  const loadMonitoredProducts = async (userId) => {
    try {
      const response = await fetch(`/api/kogan/get-products?userId=${userId}`)
      const data = await response.json()

      if (response.ok && data.success) {
        setMonitoredProducts(data.products)
      }
    } catch (error) {
      console.error('Error loading monitored products:', error)
    }
  }

  // Load notifications from API
  const loadNotifications = async (userId) => {
    try {
      const response = await fetch(`/api/kogan/get-notifications?userId=${userId}`)
      const data = await response.json()

      if (response.ok && data.success) {
        // Only show unread notifications in the UI
        const unreadNotifications = data.notifications
          .filter(n => !n.read)
          .slice(0, 5)
          .map(n => ({
            id: n.id,
            message: n.message,
            type: n.type,
            timestamp: n.created_at
          }))
        setNotifications(unreadNotifications)
      }
    } catch (error) {
      console.error('Error loading notifications:', error)
    }
  }

  // Remove product from monitoring
  const removeFromMonitoring = async (productId) => {
    try {
      const { error } = await supabase
        .from('kogan_products')
        .update({ monitoring_enabled: false })
        .eq('id', productId)
        .eq('user_id', session.user.id)

      if (error) throw error

      setMonitoredProducts(prev => prev.filter(p => p.id !== productId))
      addNotification('Product removed from monitoring', 'info')
    } catch (error) {
      console.error('Error removing from monitoring:', error)
      addNotification('Error removing product from monitoring', 'error')
    }
  }

  // Update single product
  const updateProductStatus = async (productId) => {
    setScrapingStatus('scraping')
    try {
      const response = await fetch('/api/kogan/update-products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: session.user.id,
          productIds: [productId]
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Update failed')
      }

      const result = data.results[0]
      if (result.status === 'success') {
        await loadMonitoredProducts(session.user.id)
        
        if (result.priceChanged) {
          addNotification(
            `Price changed: $${result.changes.price.old} → $${result.changes.price.new}`,
            'warning'
          )
        }
        
        if (result.stockChanged) {
          addNotification(
            `Stock changed: ${result.changes.stock.old} → ${result.changes.stock.new}`,
            result.changes.stock.new === 'In Stock' ? 'success' : 'warning'
          )
        }
        
        if (!result.priceChanged && !result.stockChanged) {
          addNotification('Product updated - no changes detected', 'info')
        }
      } else {
        throw new Error(result.error)
      }

      setScrapingStatus('success')
    } catch (error) {
      console.error('Update error:', error)
      setScrapingStatus('error')
      addNotification(`Update failed: ${error.message}`, 'error')
    }
  }

  // Bulk update all monitored products
  const bulkUpdateProducts = async () => {
    if (monitoredProducts.length === 0) return

    setScrapingStatus('scraping')
    try {
      const response = await fetch('/api/kogan/update-products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: session.user.id
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Bulk update failed')
      }

      setLastScrapeTime(new Date().toISOString())
      setScrapingStatus('success')
      
      await loadMonitoredProducts(session.user.id)
      await loadNotifications(session.user.id)
      
      const { summary } = data
      addNotification(
        `Bulk update completed: ${summary.success} updated, ${summary.errors} errors, ${summary.priceChanges} price changes`,
        'info'
      )
    } catch (error) {
      console.error('Bulk update error:', error)
      setScrapingStatus('error')
      addNotification(`Bulk update failed: ${error.message}`, 'error')
    }
  }

  const addNotification = (message, type = 'info') => {
    const notification = {
      id: Date.now(),
      message,
      type,
      timestamp: new Date().toISOString()
    }
    setNotifications(prev => [notification, ...prev.slice(0, 4)])
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id))
    }, 5000)
  }

  if (loading) {
    return (
      <DashboardLayout session={session} supabase={supabase} currentPage="kogan-scraper">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout session={session} supabase={supabase} currentPage="kogan-scraper">
      <div className="space-y-6">
        {/* Notifications */}
        {notifications.length > 0 && (
          <div className="fixed top-4 right-4 z-50 space-y-2">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 rounded-lg shadow-lg border max-w-sm animate-slide-in ${
                  notification.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
                  notification.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
                  notification.type === 'warning' ? 'bg-yellow-50 border-yellow-200 text-yellow-800' :
                  'bg-blue-50 border-blue-200 text-blue-800'
                }`}
              >
                <div className="flex justify-between items-start">
                  <p className="text-sm font-medium pr-2">{notification.message}</p>
                  <button
                    onClick={() => setNotifications(prev => prev.filter(n => n.id !== notification.id))}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
                <p className="text-xs opacity-75 mt-1">
                  {new Date(notification.timestamp).toLocaleTimeString()}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Kogan Product Monitor</h1>
                <p className="text-gray-600 mt-1">Real-time scraping and monitoring of Kogan products</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">Auto-monitor:</span>
                <button
                  onClick={() => setAutoMonitorEnabled(!autoMonitorEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                    autoMonitorEnabled ? 'bg-orange-500' : 'bg-gray-200'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                    autoMonitorEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
              {lastScrapeTime && (
                <span className="text-sm text-gray-500">
                  Last update: {new Date(lastScrapeTime).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Scraping Controls */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Scrape Kogan Products</h2>
          
          <div className="space-y-4">
            {/* Single Product Scraping */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Single Product</label>
              <div className="flex space-x-3">
                <div className="flex-1">
                  <input
                    type="text"
                    value={scrapeInput}
                    onChange={(e) => setScrapeInput(e.target.value)}
                    placeholder="Enter Kogan URL, SKU, or product name..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                    onKeyPress={(e) => e.key === 'Enter' && handleScrapeProduct()}
                  />
                </div>
                <button
                  onClick={handleScrapeProduct}
                  disabled={scrapingStatus === 'scraping' || !scrapeInput.trim()}
                  className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 font-medium"
                >
                  {scrapingStatus === 'scraping' ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Scraping...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <span>Scrape Product</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleTestScrape}
                  className="px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center space-x-2 font-medium"
                >
                  <span>Test</span>
                </button>
              </div>
            </div>

            {/* Bulk Scraping */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">Get All Products</label>
                {bulkScrapeStatus === 'scraping' && (
                  <div className="text-sm text-gray-600">
                    Progress: {bulkScrapeProgress.current} / {bulkScrapeProgress.total}
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleBulkScrapeAll}
                  disabled={bulkScrapeStatus === 'scraping'}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 font-medium"
                >
                  {bulkScrapeStatus === 'scraping' ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Scraping All...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>Get All Products</span>
                    </>
                  )}
                </button>
                <span className="text-sm text-gray-500">
                  Automatically scrape products from Kogan (fallback to existing API)
                </span>
              </div>
              
              {bulkScrapeStatus === 'scraping' && bulkScrapeProgress.total > 0 && (
                <div className="mt-3">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(bulkScrapeProgress.current / bulkScrapeProgress.total) * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Test Section */}
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-900 mb-2">Quick Test</h3>
              <div className="space-y-2 text-sm text-blue-800">
                <div><strong>Test Product:</strong> iPhone 15 from Kogan</div>
                <div><strong>What it does:</strong> Tests the scraper with a real Kogan product</div>
                <button
                  onClick={handleTestScrape}
                  className="mt-2 px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  Run Test Scrape
                </button>
              </div>
            </div>

            {/* Example inputs */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Example inputs:</h3>
              <div className="space-y-1 text-sm text-gray-600">
                <div><strong>URL:</strong> https://www.kogan.com/au/buy/samsung-galaxy-s24/</div>
                <div><strong>SKU:</strong> KGELECTSG24</div>
                <div><strong>Name:</strong> Samsung Galaxy S24</div>
              </div>
            </div>
          </div>
        </div>

        {/* Recently Scraped Products */}
        {scrapedProducts.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Recently Scraped Products</h2>
              <button
                onClick={() => setScrapedProducts([])}
                className="text-sm text-gray-500 hover:text-orange-600"
              >
                Clear All
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {scrapedProducts.slice(0, 6).map((product) => (
                <div key={product.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex flex-col space-y-3">
                    <div className="relative">
                      <img
                        src={product.image_url || `https://picsum.photos/300/200?random=${product.id}`}
                        alt={product.name}
                        className="w-full h-32 object-cover rounded-lg"
                        onError={(e) => {
                          e.target.src = `https://picsum.photos/300/200?random=${product.id}`
                        }}
                      />
                      {product.kogan_first && (
                        <span className="absolute top-2 left-2 bg-orange-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                          Kogan First
                        </span>
                      )}
                      {product.discount_percent && (
                        <span className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                          -{product.discount_percent}%
                        </span>
                      )}
                    </div>
                    
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 line-clamp-2">{product.name}</h3>
                      <p className="text-xs text-gray-500">SKU: {product.sku}</p>
                      <p className="text-xs text-gray-500">Brand: {product.brand}</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-lg font-bold text-gray-900">${product.price_current}</span>
                        {product.price_original && (
                          <span className="text-sm text-gray-500 line-through">${product.price_original}</span>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          product.status === 'In Stock' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {product.status}
                        </span>
                        {product.rating_average && (
                          <div className="flex items-center space-x-1 text-xs text-gray-500">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            <span>{product.rating_average} ({product.rating_count})</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                          🚚 {product.shipping_free ? 'Free shipping' : 'Paid shipping'}
                        </span>
                        <button
                          onClick={() => window.open(product.source_url, '_blank')}
                          className="text-xs bg-orange-500 text-white px-3 py-1 rounded hover:bg-orange-600 transition-colors"
                        >
                          View on Kogan
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Monitored Products */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Monitored Products ({monitoredProducts.length})
            </h2>
            <div className="flex space-x-2">
              <button
                onClick={bulkUpdateProducts}
                disabled={scrapingStatus === 'scraping' || monitoredProducts.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Update All</span>
              </button>
            </div>
          </div>

          {monitoredProducts.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 text-6xl mb-4">🛍️</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No products being monitored</h3>
              <p className="text-gray-600">Start by scraping some Kogan products to monitor them.</p>
              <button
                onClick={handleTestScrape}
                className="mt-4 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
              >
                Try Test Scrape
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rating</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Updated</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {monitoredProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <img 
                            className="h-12 w-12 rounded-lg object-cover" 
                            src={product.image_url || `https://picsum.photos/100/100?random=${product.id}`} 
                            alt=""
                            onError={(e) => {
                              e.target.src = `https://picsum.photos/100/100?random=${product.id}`
                            }}
                          />
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900 max-w-xs truncate">{product.name}</div>
                            <div className="text-sm text-gray-500">SKU: {product.sku}</div>
                            <div className="text-xs text-gray-500">{product.brand} • {product.category}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-gray-900">${product.price_current}</div>
                        {product.price_original && (
                          <div className="text-xs text-gray-500 line-through">${product.price_original}</div>
                        )}
                        <div className="text-xs text-green-600">
                          {product.shipping_free ? 'Free shipping' : 'Paid shipping'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          product.status === 'In Stock' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {product.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {product.rating_average ? (
                          <div className="flex items-center">
                            <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            <span className="ml-1 text-sm text-gray-900">{product.rating_average}</span>
                            <span className="ml-1 text-xs text-gray-500">({product.rating_count})</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">No rating</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(product.last_updated).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium space-x-2">
                        <button
                          onClick={() => updateProductStatus(product.id)}
                          className="text-blue-600 hover:text-blue-900 transition-colors"
                        >
                          Update
                        </button>
                        <button
                          onClick={() => window.open(product.source_url, '_blank')}
                          className="text-orange-600 hover:text-orange-900 transition-colors"
                        >
                          View
                        </button>
                        <button
                          onClick={() => removeFromMonitoring(product.id)}
                          className="text-red-600 hover:text-red-900 transition-colors"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Statistics Dashboard */}
        {monitoredProducts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Products</dt>
                    <dd className="text-lg font-medium text-gray-900">{monitoredProducts.length}</dd>
                  </dl>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">In Stock</dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {monitoredProducts.filter(p => p.status === 'In Stock').length}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                    </svg>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Avg Price</dt>
                    <dd className="text-lg font-medium text-gray-900">
                      ${monitoredProducts.length > 0 
                        ? (monitoredProducts.reduce((sum, p) => sum + parseFloat(p.price_current || 0), 0) / monitoredProducts.length).toFixed(2)
                        : '0.00'
                      }
                    </dd>
                  </dl>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">On Sale</dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {monitoredProducts.filter(p => p.discount_percent).length}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Status Messages */}
        {scrapingStatus === 'success' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-green-700">Product information updated successfully!</p>
              </div>
            </div>
          </div>
        )}

        {scrapingStatus === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">Error occurred while scraping. Please try again.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </DashboardLayout>
  )
}
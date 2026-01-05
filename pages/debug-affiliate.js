// pages/debug-affiliate.js - Debug page to see what's in your database
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import DashboardLayout from '../components/DashboardLayout'

export default function DebugAffiliatePage() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [debugData, setDebugData] = useState(null)
  const router = useRouter()

  useEffect(() => {
    checkUser()
  }, [])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
    } else {
      setSession(session)
      await loadDebugData(session.user.id)
    }
    setLoading(false)
  }

  const loadDebugData = async (userId) => {
    try {
      // Get all stores
      const { data: stores } = await supabase
        .from('stores')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)

      // Get all products
      const { data: products } = await supabase
        .from('products')
        .select('id, internal_sku, supplier_asin, title, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(10)

      // Get all affiliate links
      const { data: affiliateLinks } = await supabase
        .from('affiliate_links')
        .select(`
          id,
          affiliate_url,
          internal_sku,
          store_id,
          is_active,
          created_at,
          stores (
            store_name
          )
        `)
        .eq('user_id', userId)
        .eq('is_active', true)

      // Get API keys
      const { data: apiKeys } = await supabase
        .from('api_keys')
        .select('key, name, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)

      setDebugData({
        stores: stores || [],
        products: products || [],
        affiliateLinks: affiliateLinks || [],
        apiKeys: apiKeys || []
      })
    } catch (error) {
      console.error('Debug error:', error)
    }
  }

  const testApiEndpoint = async (apiKey, storeName) => {
    const url = storeName
      ? `/api/public/affiliate-products?apiKey=${apiKey}&storeName=${encodeURIComponent(storeName)}`
      : `/api/public/affiliate-products?apiKey=${apiKey}`
    
    window.open(url, '_blank')
  }

  if (loading) {
    return (
      <DashboardLayout session={session} supabase={supabase}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout session={session} supabase={supabase}>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold mb-2">🔍 Affiliate System Debug</h1>
          <p className="text-gray-600">Check if your data is properly configured</p>
        </div>

        {debugData && (
          <>
            {/* API Keys */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="bg-blue-600 px-6 py-4">
                <h2 className="text-lg font-semibold text-white">
                  🔑 API Keys ({debugData.apiKeys.length})
                </h2>
              </div>
              <div className="p-6">
                {debugData.apiKeys.length === 0 ? (
                  <p className="text-gray-500">No API keys found. Create one in the API Keys page.</p>
                ) : (
                  <div className="space-y-4">
                    {debugData.apiKeys.map((key) => (
                      <div key={key.key} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold">{key.name}</h3>
                          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                            Active
                          </span>
                        </div>
                        <code className="block bg-gray-100 p-2 rounded text-sm break-all mb-2">
                          {key.key}
                        </code>
                        {debugData.stores.length > 0 && (
                          <div className="flex gap-2 flex-wrap">
                            <button
                              onClick={() => testApiEndpoint(key.key, null)}
                              className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                            >
                              Test (All Stores)
                            </button>
                            {debugData.stores.map(store => (
                              <button
                                key={store.id}
                                onClick={() => testApiEndpoint(key.key, store.store_name)}
                                className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                              >
                                Test ({store.store_name})
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Stores */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="bg-green-600 px-6 py-4">
                <h2 className="text-lg font-semibold text-white">
                  🏪 Stores ({debugData.stores.length})
                </h2>
              </div>
              <div className="p-6">
                {debugData.stores.length === 0 ? (
                  <p className="text-gray-500">No stores found. Create one in the Stores page.</p>
                ) : (
                  <div className="space-y-2">
                    {debugData.stores.map((store) => (
                      <div key={store.id} className="border border-gray-200 rounded p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-semibold">{store.store_name}</div>
                            <div className="text-sm text-gray-500">ID: {store.id}</div>
                          </div>
                          <div className="text-sm text-gray-600">
                            {debugData.affiliateLinks.filter(l => l.store_id === store.id).length} links
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Products */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="bg-purple-600 px-6 py-4">
                <h2 className="text-lg font-semibold text-white">
                  📦 Products ({debugData.products.length} shown, more may exist)
                </h2>
              </div>
              <div className="p-6">
                {debugData.products.length === 0 ? (
                  <p className="text-gray-500">No products found. Import products from Amazon Products page.</p>
                ) : (
                  <div className="space-y-2">
                    {debugData.products.map((product) => (
                      <div key={product.id} className="border border-gray-200 rounded p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{product.title}</div>
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                              <span>SKU: {product.internal_sku}</span>
                              <span>ASIN: {product.supplier_asin}</span>
                            </div>
                          </div>
                          <div className="text-sm">
                            {debugData.affiliateLinks.filter(l => l.internal_sku === product.internal_sku).length > 0 ? (
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                                ✓ Linked
                              </span>
                            ) : (
                              <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">
                                Not Linked
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Affiliate Links */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="bg-orange-600 px-6 py-4">
                <h2 className="text-lg font-semibold text-white">
                  🔗 Affiliate Links ({debugData.affiliateLinks.length})
                </h2>
              </div>
              <div className="p-6">
                {debugData.affiliateLinks.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-600 font-medium mb-2">
                      ⚠️ No affiliate links found!
                    </p>
                    <p className="text-gray-500 text-sm mb-4">
                      This is why your API returns no products.
                    </p>
                    <p className="text-sm text-gray-600 mb-2">
                      To create affiliate links:
                    </p>
                    <ol className="text-left text-sm text-gray-600 space-y-1 max-w-md mx-auto">
                      <li>1. Go to Amazon Products page</li>
                      <li>2. Click "Link" button on any product</li>
                      <li>3. Select a store and enter affiliate URL</li>
                      <li>4. Or use CSV bulk import on Affiliate Links page</li>
                    </ol>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {debugData.affiliateLinks.map((link) => (
                      <div key={link.id} className="border border-gray-200 rounded p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-mono text-sm font-semibold">{link.internal_sku}</span>
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">
                                {link.stores?.store_name}
                              </span>
                            </div>
                            <div className="text-sm text-gray-600 break-all">
                              {link.affiliate_url}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              Created: {new Date(link.created_at).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Summary */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg shadow p-6 text-white">
              <h2 className="text-xl font-bold mb-4">📊 Status Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/10 rounded-lg p-3 backdrop-blur">
                  <div className="text-2xl font-bold">{debugData.apiKeys.length}</div>
                  <div className="text-sm opacity-90">API Keys</div>
                </div>
                <div className="bg-white/10 rounded-lg p-3 backdrop-blur">
                  <div className="text-2xl font-bold">{debugData.stores.length}</div>
                  <div className="text-sm opacity-90">Stores</div>
                </div>
                <div className="bg-white/10 rounded-lg p-3 backdrop-blur">
                  <div className="text-2xl font-bold">{debugData.products.length}+</div>
                  <div className="text-sm opacity-90">Products</div>
                </div>
                <div className="bg-white/10 rounded-lg p-3 backdrop-blur">
                  <div className="text-2xl font-bold">{debugData.affiliateLinks.length}</div>
                  <div className="text-sm opacity-90">Links</div>
                </div>
              </div>
              
              {debugData.affiliateLinks.length === 0 && (
                <div className="mt-4 bg-yellow-500/20 border border-yellow-300/50 rounded-lg p-4">
                  <p className="font-semibold">⚠️ Action Required</p>
                  <p className="text-sm mt-1">
                    You have no affiliate links! Create links to see products in the API.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
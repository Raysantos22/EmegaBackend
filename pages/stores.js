// pages/stores.js
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import DashboardLayout from '../components/DashboardLayout'

export default function StoresPage() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [stores, setStores] = useState([])
  const [products, setProducts] = useState([])
  const [notifications, setNotifications] = useState([])
  
  // Modals
  const [showStoreModal, setShowStoreModal] = useState(false)
  const [showAddLinkModal, setShowAddLinkModal] = useState(false)
  const [showStoreDetailsModal, setShowStoreDetailsModal] = useState(false)
  const [showProductDetailsModal, setShowProductDetailsModal] = useState(false)
  const [selectedStore, setSelectedStore] = useState(null)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [newlyCreatedStore, setNewlyCreatedStore] = useState(null)
  
  // Form states
  const [storeForm, setStoreForm] = useState({ storeName: '' })
  const [linkForm, setLinkForm] = useState({
    storeId: null,
    affiliateUrl: '',
    selectedProduct: null,
    notes: ''
  })
  
  const [searchTerm, setSearchTerm] = useState('')
  const [productSearchTerm, setProductSearchTerm] = useState('')
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const router = useRouter()

  const checkUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
    } else {
      setSession(session)
      await loadStores(session.user.id)
      await loadProducts(session.user.id)
    }
    setLoading(false)
  }, [router])

  useEffect(() => {
    checkUser()
  }, [checkUser])

  const generateApiKey = () => {
    return 'emega_' + [...Array(32)].map(() => 
      Math.random().toString(36)[2]).join('')
  }

  const loadStores = async (userId) => {
    try {
      const { data: storesData, error: storesError } = await supabase
        .from('stores')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (storesError) throw storesError

      const { data: apiKeysData, error: keysError } = await supabase
        .from('api_keys')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)

      if (keysError) throw keysError

      const { data: linksData, error: linksError } = await supabase
        .from('affiliate_links')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)

      if (linksError) throw linksError

      const enrichedStores = await Promise.all(
        (storesData || []).map(async (store) => {
          const apiKey = apiKeysData?.find(k => k.store_id === store.id)
          const storeLinks = linksData?.filter(l => l.store_id === store.id) || []

          const linksWithProducts = await Promise.all(
            storeLinks.map(async (link) => {
              const { data: product } = await supabase
                .from('products')
                .select('*')
                .eq('internal_sku', link.internal_sku)
                .eq('user_id', userId)
                .single()

              return { ...link, product }
            })
          )

          return {
            ...store,
            apiKey: apiKey,
            links: linksWithProducts
          }
        })
      )

      setStores(enrichedStores)
    } catch (error) {
      console.error('Error loading stores:', error)
      addNotification('Failed to load stores', 'error')
    }
  }

  const loadProducts = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, internal_sku, supplier_asin, title, brand, image_urls, our_price, stock_status')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('title')

      if (error) throw error
      setProducts(data || [])
    } catch (error) {
      console.error('Error loading products:', error)
    }
  }

  const handleCreateStore = async (e) => {
    e.preventDefault()
    
    try {
      const { data: existingStore } = await supabase
        .from('stores')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('store_name', storeForm.storeName)
        .eq('is_active', true)
        .single()

      if (existingStore) {
        addNotification('A store with this name already exists', 'error')
        return
      }

      const { data: store, error: storeError } = await supabase
        .from('stores')
        .insert({
          user_id: session.user.id,
          store_name: storeForm.storeName
        })
        .select()
        .single()

      if (storeError) throw storeError

      const newKey = generateApiKey()
      const { error: keyError } = await supabase
        .from('api_keys')
        .insert({
          user_id: session.user.id,
          store_id: store.id,
          key: newKey,
          name: `${storeForm.storeName} API Key`
        })

      if (keyError) throw keyError

      setNewlyCreatedStore({ ...store, apiKey: newKey })
      addNotification('Store created successfully', 'success')
      await loadStores(session.user.id)
    } catch (error) {
      addNotification(`Failed to create store: ${error.message}`, 'error')
    }
  }

  const handleAddLink = async (e) => {
    e.preventDefault()
    
    if (!linkForm.storeId || !linkForm.affiliateUrl || !linkForm.selectedProduct) {
      addNotification('Please fill in all required fields', 'error')
      return
    }

    try {
      const { error } = await supabase
        .from('affiliate_links')
        .insert({
          user_id: session.user.id,
          store_id: linkForm.storeId,
          affiliate_url: linkForm.affiliateUrl,
          internal_sku: linkForm.selectedProduct.internal_sku,
          notes: linkForm.notes
        })

      if (error) throw error

      addNotification('Affiliate link added successfully', 'success')
      setShowAddLinkModal(false)
      setLinkForm({ storeId: null, affiliateUrl: '', selectedProduct: null, notes: '' })
      await loadStores(session.user.id)
    } catch (error) {
      addNotification(`Failed to add link: ${error.message}`, 'error')
    }
  }

  const handleDeleteStore = async (storeId) => {
    if (!confirm('Delete this store, its API key, and all affiliate links?')) return

    try {
      const { error: storeError } = await supabase
        .from('stores')
        .update({ is_active: false })
        .eq('id', storeId)

      if (storeError) throw storeError

      await supabase
        .from('api_keys')
        .update({ is_active: false })
        .eq('store_id', storeId)

      await supabase
        .from('affiliate_links')
        .update({ is_active: false })
        .eq('store_id', storeId)

      addNotification('Store deleted', 'success')
      setShowStoreDetailsModal(false)
      await loadStores(session.user.id)
    } catch (error) {
      addNotification('Failed to delete store', 'error')
    }
  }

  const handleDeleteLink = async (linkId) => {
    if (!confirm('Delete this affiliate link?')) return

    try {
      const { error } = await supabase
        .from('affiliate_links')
        .update({ is_active: false })
        .eq('id', linkId)

      if (error) throw error
      addNotification('Link deleted', 'success')
      await loadStores(session.user.id)
      setShowProductDetailsModal(false)
    } catch (error) {
      addNotification('Failed to delete link', 'error')
    }
  }

  const copyToClipboard = (text, label = 'Copied to clipboard') => {
    navigator.clipboard.writeText(text)
    addNotification(label, 'success')
  }

  const addNotification = (message, type = 'info') => {
    const notification = { id: Date.now(), message, type }
    setNotifications(prev => [notification, ...prev.slice(0, 4)])
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id))
    }, 5000)
  }

  const filteredStores = stores.filter(store => {
    if (!searchTerm) return true
    return store.store_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           store.links.some(link => 
             link.product?.title?.toLowerCase().includes(searchTerm.toLowerCase())
           )
  })

  const filteredProducts = products.filter(product => {
    if (!productSearchTerm) return true
    return product.title.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
           product.brand?.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
           product.internal_sku?.toLowerCase().includes(productSearchTerm.toLowerCase())
  })

  const openStoreDetails = (store) => {
    setSelectedStore(store)
    setShowStoreDetailsModal(true)
  }

  const openProductDetails = (link, store) => {
    setSelectedProduct({ ...link, storeName: store.store_name })
    setShowProductDetailsModal(true)
  }

  if (loading) {
    return (
      <DashboardLayout session={session} supabase={supabase} currentPage="stores">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout session={session} supabase={supabase} currentPage="stores">
      <div className="min-h-screen bg-gray-50">
        {/* Toast Notifications */}
        {notifications.length > 0 && (
          <div className="fixed top-4 right-4 z-50 space-y-2">
            {notifications.map((notification) => (
              <div key={notification.id} className={`p-4 rounded-xl shadow-lg border backdrop-blur-sm ${
                notification.type === 'success' ? 'bg-green-50/90 border-green-200 text-green-800' :
                notification.type === 'error' ? 'bg-red-50/90 border-red-200 text-red-800' :
                'bg-blue-50/90 border-blue-200 text-blue-800'
              }`}>
                <p className="text-sm font-medium">{notification.message}</p>
              </div>
            ))}
          </div>
        )}

        {/* Header */}
        <div className="bg-white border-b border-gray-200">
          <div className="px-6 py-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Stores & Affiliate Links</h1>
                <p className="text-sm text-gray-600 mt-1">Manage your stores, API keys, and affiliate product links</p>
              </div>
              <button 
                onClick={() => setShowStoreModal(true)}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Store
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search stores or products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Store Grid */}
        <div className="px-6 py-8">
          {stores.length === 0 ? (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No stores yet</h3>
              <p className="text-sm text-gray-600 mb-6">Create your first store to start managing affiliate links</p>
              <button 
                onClick={() => setShowStoreModal(true)}
                className="inline-flex items-center px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create First Store
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredStores.map((store) => (
                <div 
                  key={store.id} 
                  onClick={() => openStoreDetails(store)}
                  className="bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden border border-gray-200 cursor-pointer group"
                >
                  {/* Store Card - Simple Design */}
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-12 h-12 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                        <span className="text-xl font-bold text-white">
                          {store.store_name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedStore(store)
                            setLinkForm({ ...linkForm, storeId: store.id })
                            setShowAddLinkModal(true)
                          }}
                          className="p-1.5 rounded-md bg-white/20 hover:bg-white/30 text-white transition-all"
                          title="Add Product"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteStore(store.id)
                          }}
                          className="p-1.5 rounded-md bg-white/20 hover:bg-red-500 text-white transition-all"
                          title="Delete Store"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1">{store.store_name}</h3>
                    <p className="text-blue-100 text-sm flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                      {store.links.length} {store.links.length === 1 ? 'product' : 'products'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create Store Modal */}
        {showStoreModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-lg font-bold text-gray-900">Create New Store</h3>
              </div>
              {newlyCreatedStore ? (
                <div className="p-6">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                    <p className="text-sm font-semibold text-green-900 mb-2">Store created successfully!</p>
                    <p className="text-xs text-green-700 mb-3">Save this API key - you can view it later in the store details.</p>
                    <code className="text-xs bg-white px-3 py-2 rounded block break-all border border-green-300 font-mono text-green-900">
                      {newlyCreatedStore.apiKey}
                    </code>
                    <button
                      onClick={() => copyToClipboard(newlyCreatedStore.apiKey, 'API key copied')}
                      className="mt-3 w-full px-4 py-2 text-sm font-semibold text-green-700 bg-green-100 rounded-lg hover:bg-green-200 transition-colors"
                    >
                      Copy API Key
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setShowStoreModal(false)
                      setNewlyCreatedStore(null)
                      setStoreForm({ storeName: '' })
                    }}
                    className="w-full px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleCreateStore} className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Store Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={storeForm.storeName}
                      onChange={(e) => setStoreForm({...storeForm, storeName: e.target.value})}
                      placeholder="e.g., Petacular"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1.5">Choose a unique name for this store</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-xs text-blue-800">An API key will be automatically generated for this store</p>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowStoreModal(false)
                        setStoreForm({ storeName: '' })
                      }}
                      className="flex-1 px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Create Store
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Store Details Modal */}
        {showStoreDetailsModal && selectedStore && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              {/* Header with Store Name and API Key */}
              <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-500 to-blue-600">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                      <span className="text-xl font-bold text-white">
                        {selectedStore.store_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">{selectedStore.store_name}</h3>
                      <p className="text-blue-100 text-sm">{selectedStore.links.length} products</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowStoreDetailsModal(false)}
                    className="p-2 rounded-lg hover:bg-white/20 text-white transition-colors flex-shrink-0"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                {/* API Key in Header */}
                {/* {selectedStore.apiKey && (
                  <div className="mt-4 bg-white/10 backdrop-blur-sm rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-white uppercase tracking-wide">API Key</span>
                    </div>
                    <code className="text-xs bg-white/20 px-2 py-1.5 rounded block break-all font-mono text-white">
                      {selectedStore.apiKey.key}
                    </code>
                    <button
                      onClick={() => copyToClipboard(selectedStore.apiKey.key, 'API key copied')}
                      className="mt-2 w-full px-3 py-1.5 text-xs font-semibold text-blue-600 bg-white rounded-md hover:bg-blue-50 transition-colors"
                    >
                      Copy API Key
                    </button>
                  </div>
                )} */}
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {/* API Endpoint */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                  <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">API Endpoint</h4>
                  <code className="text-xs bg-white px-2 py-1.5 rounded block break-all border border-gray-300 font-mono text-gray-900 mb-2">
                    {typeof window !== 'undefined' && `${window.location.origin}/api/public/affiliate-products?apiKey=${selectedStore.apiKey?.key}`}
                  </code>
                  <button
                    onClick={() => copyToClipboard(
                      `${window.location.origin}/api/public/affiliate-products?apiKey=${selectedStore.apiKey?.key}`,
                      'Endpoint copied'
                    )}
                    className="w-full px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                  >
                    Copy Endpoint URL
                  </button>
                </div>

                {/* Products Grid */}
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-bold text-gray-900">Products ({selectedStore.links.length})</h4>
                  <button
                    onClick={() => {
                      setShowStoreDetailsModal(false)
                      setLinkForm({ ...linkForm, storeId: selectedStore.id })
                      setShowAddLinkModal(true)
                    }}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    + Add Product
                  </button>
                </div>
                
                {selectedStore.links.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                    <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <p className="text-sm text-gray-500 mb-3">No products in this store yet</p>
                    <button
                      onClick={() => {
                        setShowStoreDetailsModal(false)
                        setLinkForm({ ...linkForm, storeId: selectedStore.id })
                        setShowAddLinkModal(true)
                      }}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Add first product
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {selectedStore.links.map((link) => (
                      <div 
                        key={link.id}
                        onClick={() => openProductDetails(link, selectedStore)}
                        className="bg-gray-50 rounded-lg p-3 hover:bg-blue-50 hover:shadow-md transition-all cursor-pointer group border border-gray-200 hover:border-blue-300"
                      >
                        <div className="aspect-square rounded-md overflow-hidden mb-2 bg-white">
                          <img 
                            src={link.product?.image_urls?.[0] || 'https://via.placeholder.com/200'} 
                            alt={link.product?.title || 'Product'} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            onError={(e) => e.target.src = 'https://via.placeholder.com/200'}
                          />
                        </div>
                        <p className="text-xs font-semibold text-gray-900 line-clamp-2 mb-1">
                          {link.product?.title || 'Product not found'}
                        </p>
                        <p className="text-xs text-gray-500">{link.product?.brand || 'Unknown'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
                <button
                  onClick={() => setShowStoreDetailsModal(false)}
                  className="w-full px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Product Details Modal */}
        {showProductDetailsModal && selectedProduct && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900">Product Details</h3>
                  <button
                    onClick={() => setShowProductDetailsModal(false)}
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <div className="flex gap-6 mb-6">
                  <img 
                    src={selectedProduct.product?.image_urls?.[0] || 'https://via.placeholder.com/200'} 
                    alt={selectedProduct.product?.title || 'Product'} 
                    className="w-40 h-40 rounded-lg object-cover flex-shrink-0 bg-gray-100"
                    onError={(e) => e.target.src = 'https://via.placeholder.com/200'}
                  />
                  <div className="flex-1">
                    <h4 className="text-lg font-bold text-gray-900 mb-2">
                      {selectedProduct.product?.title || 'Product not found'}
                    </h4>
                    <p className="text-sm text-gray-600 mb-3">{selectedProduct.product?.brand || 'Unknown Brand'}</p>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-md font-medium text-xs">
                        {selectedProduct.product?.stock_status || 'Unknown'}
                      </span>
                      {selectedProduct.product?.our_price && (
                        <span className="text-lg font-bold text-gray-900">
                          ${selectedProduct.product.our_price}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Affiliate Link */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <h5 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Affiliate Link</h5>
                  <code className="text-xs bg-white px-2 py-1.5 rounded block break-all border border-green-300 font-mono text-gray-900 mb-3">
                    {selectedProduct.affiliate_url}
                  </code>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyToClipboard(selectedProduct.affiliate_url, 'Affiliate link copied')}
                      className="flex-1 px-3 py-2 text-xs font-semibold text-green-700 bg-green-100 rounded-md hover:bg-green-200 transition-colors"
                    >
                      Copy Link
                    </button>
                    <a
                      href={selectedProduct.affiliate_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors text-center"
                    >
                      Open Link
                    </a>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex gap-3">
                <button
                  onClick={() => handleDeleteLink(selectedProduct.id)}
                  className="px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                >
                  Delete Link
                </button>
                <button
                  onClick={() => setShowProductDetailsModal(false)}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Link Modal */}
        {showAddLinkModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className={`bg-white rounded-xl shadow-2xl max-w-4xl w-full flex flex-col transition-all duration-300 ${
              showProductDropdown && filteredProducts.length > 0 ? 'h-[60vh]' : 'h-[35vh]'
            }`}>
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Add Affiliate Link</h3>
                  {selectedStore && (
                    <p className="text-sm text-gray-600 mt-0.5">to {selectedStore.store_name}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddLinkModal(false)
                    setSelectedStore(null)
                    setLinkForm({ storeId: null, affiliateUrl: '', selectedProduct: null, notes: '' })
                    setProductSearchTerm('')
                    setShowProductDropdown(false)
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <form onSubmit={handleAddLink} className="flex-1 overflow-y-auto p-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Affiliate URL <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    value={linkForm.affiliateUrl}
                    onChange={(e) => setLinkForm({...linkForm, affiliateUrl: e.target.value})}
                    placeholder="https://amzn.to/3IyHUoa"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Select Product <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="relative">
                      <input
                        type="text"
                        value={productSearchTerm}
                        onChange={(e) => {
                          setProductSearchTerm(e.target.value)
                          setShowProductDropdown(true)
                        }}
                        onFocus={() => setShowProductDropdown(true)}
                        placeholder="Search products..."
                        className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    
                    {showProductDropdown && filteredProducts.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {filteredProducts.map(product => (
                          <div
                            key={product.id}
                            onClick={() => {
                              setLinkForm({...linkForm, selectedProduct: product})
                              setProductSearchTerm(product.title)
                              setShowProductDropdown(false)
                            }}
                            className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                          >
                            <img 
                              src={product.image_urls?.[0] || 'https://via.placeholder.com/40'} 
                              alt={product.title}
                              className="w-10 h-10 rounded object-cover flex-shrink-0"
                              onError={(e) => e.target.src = 'https://via.placeholder.com/40'}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{product.title}</p>
                              <p className="text-xs text-gray-500">{product.brand} • {product.internal_sku}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {linkForm.selectedProduct && (
                    <div className="mt-3 flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <img 
                        src={linkForm.selectedProduct.image_urls?.[0] || 'https://via.placeholder.com/50'} 
                        alt={linkForm.selectedProduct.title}
                        className="w-12 h-12 rounded object-cover flex-shrink-0"
                        onError={(e) => e.target.src = 'https://via.placeholder.com/50'}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 line-clamp-2">{linkForm.selectedProduct.title}</p>
                        <p className="text-xs text-gray-600">{linkForm.selectedProduct.brand} • {linkForm.selectedProduct.internal_sku}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setLinkForm({...linkForm, selectedProduct: null})
                          setProductSearchTerm('')
                        }}
                        className="p-1.5 hover:bg-blue-100 rounded text-gray-500 hover:text-gray-700 flex-shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </form>
              
              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddLinkModal(false)
                    setSelectedStore(null)
                    setLinkForm({ storeId: null, affiliateUrl: '', selectedProduct: null, notes: '' })
                    setProductSearchTerm('')
                    setShowProductDropdown(false)
                  }}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddLink}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Add Affiliate Link
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
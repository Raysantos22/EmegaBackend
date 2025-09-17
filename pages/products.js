// pages/products.js
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import Layout from '../components/Layout'
import ProductCard from '../components/ProductCard'
import ProductModal from '../components/ProductModal'

export default function Products({ session, supabase }) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const router = useRouter()

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
      })
      
      if (searchTerm) params.append('search', searchTerm)
      if (statusFilter) params.append('status', statusFilter)

      const response = await fetch(`/api/products?${params}`)
      const data = await response.json()

      if (response.ok) {
        if (page === 1) {
          setProducts(data.products)
        } else {
          setProducts(prev => [...prev, ...data.products])
        }
        setHasMore(data.products.length === 20)
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError('Failed to fetch products')
    } finally {
      setLoading(false)
    }
  }, [page, searchTerm, statusFilter])

  useEffect(() => {
    if (!session) {
      router.push('/login')
      return
    }
    fetchProducts()
  }, [session, router, fetchProducts])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const response = await fetch('/api/sync-products', {
        method: 'POST'
      })
      const data = await response.json()
      
      if (response.ok) {
        alert(`Sync completed! ${data.success_count} products synced successfully.`)
        setPage(1)
        fetchProducts()
      } else {
        alert(`Sync failed: ${data.message}`)
      }
    } catch (err) {
      alert('Sync failed: Network error')
    } finally {
      setSyncing(false)
    }
  }

  const handleProductUpdate = (updatedProduct) => {
    setProducts(products.map(p => 
      p.autods_id === updatedProduct.autods_id ? updatedProduct : p
    ))
  }

  const handleProductDelete = (deletedProductId) => {
    setProducts(products.filter(p => p.autods_id !== deletedProductId))
  }

  const loadMore = () => {
    setPage(prev => prev + 1)
  }

  return (
    <Layout session={session} supabase={supabase}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-3xl font-bold text-gray-900">Products</h1>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="btn-primary"
          >
            {syncing ? 'Syncing...' : 'Sync from AutoDS'}
          </button>
        </div>

        {/* Filters */}
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Products
              </label>
              <input
                type="text"
                placeholder="Search by title or description..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setPage(1)
                }}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setPage(1)
                }}
                className="input-field"
              >
                <option value="">All Status</option>
                <option value="1">Draft</option>
                <option value="2">Active</option>
                <option value="3">Paused</option>
                <option value="4">Out of Stock</option>
              </select>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-300 text-red-800 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Products Grid */}
        {loading && page === 1 ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {products.map((product) => (
                <ProductCard
                  key={product.autods_id}
                  product={product}
                  onEdit={(product) => {
                    setSelectedProduct(product)
                    setIsModalOpen(true)
                  }}
                  onDelete={handleProductDelete}
                  supabase={supabase}
                />
              ))}
            </div>

            {products.length === 0 && !loading && (
              <div className="text-center py-12">
                <div className="text-gray-500 text-lg">No products found</div>
                <p className="text-gray-400 mt-2">Try adjusting your search or sync products from AutoDS</p>
              </div>
            )}

            {hasMore && products.length > 0 && (
              <div className="text-center py-6">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="btn-primary"
                >
                  {loading ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}

        {/* Product Modal */}
        <ProductModal
          product={selectedProduct}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false)
            setSelectedProduct(null)
          }}
          onUpdate={handleProductUpdate}
          supabase={supabase}
        />
      </div>
    </Layout>
  )
}
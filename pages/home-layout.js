// // pages/home-layout.js - Complete Dynamic Home Layout Configuration with Preview
// import { useState, useEffect, useCallback } from 'react'
// import { useRouter } from 'next/router'
// import { supabase } from '../lib/supabase'
// import DashboardLayout from '../components/DashboardLayout'

// export default function HomeLayoutManager() {
//   const [layout, setLayout] = useState(null)
//   const [loading, setLoading] = useState(true)
//   const [saving, setSaving] = useState(false)
//   const [session, setSession] = useState(null)
//   const [previewMode, setPreviewMode] = useState(false)
//   const [previewData, setPreviewData] = useState({})
//   const router = useRouter()

//   const checkUser = useCallback(async () => {
//     const { data: { session } } = await supabase.auth.getSession()
//     if (!session) {
//       router.push('/login')
//     } else {
//       setSession(session)
//     }
//   }, [router])

//   const fetchLayout = useCallback(async () => {
//     try {
//       setLoading(true)
//       const response = await fetch('/api/home-layout?include_preview=true')
//       const result = await response.json()
      
//       if (result.success) {
//         setLayout(result.layout || getDefaultLayout())
//         if (result.preview_data) {
//           setPreviewData(result.preview_data)
//         }
//       } else {
//         console.error('Failed to fetch layout:', result.error)
//         setLayout(getDefaultLayout())
//       }
//     } catch (error) {
//       console.error('Error fetching layout:', error)
//       setLayout(getDefaultLayout())
//     } finally {
//       setLoading(false)
//     }
//   }, [])

//   useEffect(() => {
//     checkUser()
//     fetchLayout()
//   }, [checkUser, fetchLayout])

//   const getDefaultLayout = () => ({
//     sections: [
//       {
//         id: 'banner_main',
//         type: 'banner_carousel',
//         title: 'Main Banners',
//         position: 1,
//         config: {
//           height: 220,
//           autoSlide: true,
//           slideInterval: 4000,
//           showPagination: true,
//           source: 'banners',
//           filter: { display_order_min: 0, display_order_max: 99 }
//         },
//         enabled: true
//       },
//       {
//         id: 'grid_banners',
//         type: 'banner_grid',
//         title: 'Shop by Category',
//         position: 2,
//         config: {
//           columns: 2,
//           height: 140,
//           source: 'banners',
//           filter: { display_order_min: 300, display_order_max: 399 }
//         },
//         enabled: true
//       },
//       {
//         id: 'hot_sales',
//         type: 'product_horizontal',
//         title: 'Hot Sales',
//         position: 3,
//         config: {
//           limit: 10,
//           source: 'products',
//           filter: { is_hot_sale: true }
//         },
//         enabled: true
//       }
//     ]
//   })

//   const handleSaveLayout = async () => {
//     setSaving(true)

//     try {
//       const response = await fetch('/api/home-layout', {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//         },
//         body: JSON.stringify({
//           layout_config: layout,
//           version: generateVersion(),
//           description: `Layout updated ${new Date().toLocaleString()}`
//         }),
//       })

//       const result = await response.json()

//       if (result.success) {
//         showNotification('Layout saved successfully!', 'success')
//         fetchLayout()
//       } else {
//         showNotification('Error saving layout: ' + result.error, 'error')
//       }
//     } catch (error) {
//       console.error('Error saving layout:', error)
//       showNotification('Error saving layout: ' + error.message, 'error')
//     } finally {
//       setSaving(false)
//     }
//   }

//   const generateVersion = () => {
//     const now = new Date()
//     return `${now.getFullYear()}.${(now.getMonth() + 1).toString().padStart(2, '0')}.${now.getDate().toString().padStart(2, '0')}.${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`
//   }

//   const showNotification = (message, type) => {
//     const notification = document.createElement('div')
//     notification.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 ${
//       type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
//     }`
//     notification.textContent = message
//     document.body.appendChild(notification)
//     setTimeout(() => {
//       if (document.body.contains(notification)) {
//         document.body.removeChild(notification)
//       }
//     }, 3000)
//   }

//   const updateSection = (sectionId, updates) => {
//     setLayout(prev => ({
//       ...prev,
//       sections: prev.sections.map(section => 
//         section.id === sectionId 
//           ? { ...section, ...updates }
//           : section
//       )
//     }))
//   }

//   const moveSection = (sectionId, direction) => {
//     setLayout(prev => {
//       const sections = [...prev.sections]
//       const index = sections.findIndex(s => s.id === sectionId)
      
//       if (direction === 'up' && index > 0) {
//         const currentPosition = sections[index].position
//         const targetPosition = sections[index - 1].position
        
//         sections[index].position = targetPosition
//         sections[index - 1].position = currentPosition
        
//         sections.sort((a, b) => a.position - b.position)
//       } else if (direction === 'down' && index < sections.length - 1) {
//         const currentPosition = sections[index].position
//         const targetPosition = sections[index + 1].position
        
//         sections[index].position = targetPosition
//         sections[index + 1].position = currentPosition
        
//         sections.sort((a, b) => a.position - b.position)
//       }
      
//       return { ...prev, sections }
//     })
//   }

//   const addSection = () => {
//     const newSection = {
//       id: `section_${Date.now()}`,
//       type: 'product_horizontal',
//       title: 'New Section',
//       position: (layout?.sections?.length || 0) + 1,
//       config: {
//         limit: 10,
//         source: 'products',
//         filter: {}
//       },
//       enabled: true
//     }
    
//     setLayout(prev => ({
//       ...prev,
//       sections: [...(prev?.sections || []), newSection]
//     }))
//   }

//   const removeSection = (sectionId) => {
//     if (confirm('Are you sure you want to remove this section?')) {
//       setLayout(prev => ({
//         ...prev,
//         sections: prev.sections.filter(section => section.id !== sectionId)
//       }))
//     }
//   }

//   const getSectionTypeOptions = () => [
//     { value: 'banner_carousel', label: 'Banner Carousel' },
//     { value: 'banner_grid', label: 'Banner Grid' },
//     { value: 'product_horizontal', label: 'Products (Horizontal)' },
//     { value: 'product_grid', label: 'Products (Grid)' },
//     { value: 'product_grid_small', label: 'Products (Small Grid)' }
//   ]

//   const getSourceOptions = () => [
//     { value: 'banners', label: 'Banners' },
//     { value: 'products', label: 'Products' },
//     { value: 'recently_viewed', label: 'Recently Viewed' }
//   ]

//   const togglePreviewMode = () => {
//     if (!previewMode) {
//       loadPreviewData()
//     }
//     setPreviewMode(!previewMode)
//   }

//   const loadPreviewData = async () => {
//     try {
//       const sampleBanners = [
//         {
//           id: 'preview-banner-1',
//           title: 'Sample Banner 1',
//           subtitle: 'Preview Mode',
//           image: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&h=400&fit=crop',
//           text_color: 'white'
//         },
//         {
//           id: 'preview-banner-2', 
//           title: 'Sample Banner 2',
//           subtitle: 'Dynamic Layout',
//           image: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=800&h=400&fit=crop',
//           text_color: 'white'
//         }
//       ]

//       const sampleProducts = Array.from({ length: 10 }, (_, i) => ({
//         id: `preview-product-${i + 1}`,
//         title: `Sample Product ${i + 1}`,
//         price: (Math.random() * 100 + 10).toFixed(2),
//         main_picture_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop',
//         shipping_price: 0
//       }))

//       setPreviewData({
//         banners: sampleBanners,
//         products: sampleProducts,
//         recently_viewed: sampleProducts.slice(0, 2)
//       })
//     } catch (error) {
//       console.error('Error loading preview data:', error)
//     }
//   }

//   const renderPreviewSection = (section) => {
//     const data = previewData[section.config?.source] || []
    
//     switch (section.type) {
//       case 'banner_carousel':
//         return (
//           <div key={section.id} className="mb-6">
//             <div 
//               className="relative rounded-lg overflow-hidden bg-gradient-to-r from-blue-500 to-purple-600"
//               style={{ height: section.config?.height || 220 }}
//             >
//               <div className="absolute inset-0 flex items-center justify-center">
//                 <div className="text-center text-white">
//                   <h3 className="text-2xl font-bold">{section.title}</h3>
//                   <p className="text-sm opacity-90">Banner Carousel Preview</p>
//                 </div>
//               </div>
//             </div>
//           </div>
//         )
      
//       case 'banner_grid':
//         return (
//           <div key={section.id} className="mb-6">
//             <h3 className="text-xl font-bold mb-4">{section.title}</h3>
//             <div className="grid grid-cols-2 gap-4">
//               {[1, 2].map(i => (
//                 <div 
//                   key={i}
//                   className="relative rounded-lg overflow-hidden bg-gradient-to-br from-green-500 to-blue-500"
//                   style={{ height: section.config?.height || 140 }}
//                 >
//                   <div className="absolute inset-0 flex items-center justify-center">
//                     <div className="text-center text-white">
//                       <p className="font-semibold">Banner {i}</p>
//                     </div>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           </div>
//         )
      
//       case 'product_horizontal':
//         return (
//           <div key={section.id} className="mb-6">
//             <h3 className="text-xl font-bold mb-4">{section.title}</h3>
//             <div className="flex gap-4 overflow-x-auto pb-2">
//               {[1, 2, 3].map(i => (
//                 <div key={i} className="flex-shrink-0 w-48 bg-white rounded-lg shadow-md overflow-hidden">
//                   <div className="h-32 bg-gray-200 flex items-center justify-center">
//                     <span className="text-gray-500">Product {i}</span>
//                   </div>
//                   <div className="p-3">
//                     <p className="font-semibold text-sm">Sample Product {i}</p>
//                     <p className="text-green-600 font-bold">$29.99</p>
//                     <p className="text-xs text-green-500">Free shipping</p>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           </div>
//         )
      
//       case 'product_grid':
//         return (
//           <div key={section.id} className="mb-6">
//             <h3 className="text-xl font-bold mb-4">{section.title}</h3>
//             <div className="grid grid-cols-2 gap-4">
//               {[1, 2, 3, 4].map(i => (
//                 <div key={i} className="bg-white rounded-lg shadow-md overflow-hidden">
//                   <div className="h-32 bg-gray-200 flex items-center justify-center">
//                     <span className="text-gray-500">Product {i}</span>
//                   </div>
//                   <div className="p-3">
//                     <p className="font-semibold text-sm">Sample Product {i}</p>
//                     <p className="text-green-600 font-bold">$29.99</p>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           </div>
//         )
      
//       case 'product_grid_small':
//         return (
//           <div key={section.id} className="mb-6">
//             <h3 className="text-xl font-bold mb-4">{section.title}</h3>
//             <div className="grid grid-cols-2 gap-4">
//               {[1, 2].map(i => (
//                 <div key={i} className="relative bg-white rounded-lg shadow-md overflow-hidden h-24">
//                   <div className="h-full bg-gray-200 flex items-center justify-center">
//                     <span className="text-gray-500 text-sm">Recent {i}</span>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           </div>
//         )
      
//       default:
//         return (
//           <div key={section.id} className="mb-6 p-4 bg-gray-100 rounded-lg">
//             <h3 className="font-semibold">{section.title}</h3>
//             <p className="text-sm text-gray-600">Unknown section type: {section.type}</p>
//           </div>
//         )
//     }
//   }

//   if (loading) {
//     return (
//       <DashboardLayout session={session} supabase={supabase} currentPage="home-layout">
//         <div className="flex items-center justify-center h-64">
//           <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
//         </div>
//       </DashboardLayout>
//     )
//   }

//   return (
//     <DashboardLayout session={session} supabase={supabase} currentPage="home-layout">
//       <div className="flex h-full">
//         {/* Left Panel - Configuration */}
//         <div className={`${previewMode ? 'w-1/2' : 'w-full'} transition-all duration-300 overflow-y-auto`}>
//           {/* Page Header */}
//           <div className="bg-white shadow-lg rounded-lg mb-6">
//             <div className="px-6 py-4 border-b border-gray-200">
//               <div className="flex justify-between items-center">
//                 <div>
//                   <h2 className="text-2xl font-bold text-gray-900">Home Screen Layout</h2>
//                   <p className="text-sm text-gray-600 mt-1">
//                     Configure your mobile app's home screen layout dynamically
//                   </p>
//                 </div>
//                 <div className="flex space-x-3">
//                   <button
//                     onClick={togglePreviewMode}
//                     className={`px-4 py-2 rounded-lg font-medium transition-colors ${
//                       previewMode 
//                         ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' 
//                         : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
//                     }`}
//                   >
//                     {previewMode ? 'Hide Preview' : 'Show Preview'}
//                   </button>
//                   <button
//                     onClick={handleSaveLayout}
//                     disabled={saving}
//                     className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl"
//                   >
//                     {saving ? 'Saving...' : 'Save Layout'}
//                   </button>
//                 </div>
//               </div>
//             </div>

//             {/* Layout Stats */}
//             <div className="px-6 py-4">
//               <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
//                 <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
//                   <div className="flex items-center">
//                     <div className="flex-shrink-0">
//                       <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
//                         <span className="text-white text-lg font-bold">{layout?.sections?.length || 0}</span>
//                       </div>
//                     </div>
//                     <div className="ml-4">
//                       <p className="text-sm font-medium text-blue-900">Total Sections</p>
//                       <p className="text-xs text-blue-600">All sections</p>
//                     </div>
//                   </div>
//                 </div>

//                 <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
//                   <div className="flex items-center">
//                     <div className="flex-shrink-0">
//                       <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
//                         <span className="text-white text-lg font-bold">
//                           {layout?.sections?.filter(s => s.enabled).length || 0}
//                         </span>
//                       </div>
//                     </div>
//                     <div className="ml-4">
//                       <p className="text-sm font-medium text-green-900">Active Sections</p>
//                       <p className="text-xs text-green-600">Currently visible</p>
//                     </div>
//                   </div>
//                 </div>

//                 <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-lg p-4 border border-yellow-200">
//                   <div className="flex items-center">
//                     <div className="flex-shrink-0">
//                       <div className="w-10 h-10 bg-yellow-500 rounded-lg flex items-center justify-center">
//                         <span className="text-white text-lg font-bold">
//                           {layout?.sections?.filter(s => s.type.includes('banner')).length || 0}
//                         </span>
//                       </div>
//                     </div>
//                     <div className="ml-4">
//                       <p className="text-sm font-medium text-yellow-900">Banner Sections</p>
//                       <p className="text-xs text-yellow-600">Image displays</p>
//                     </div>
//                   </div>
//                 </div>

//                 <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
//                   <div className="flex items-center">
//                     <div className="flex-shrink-0">
//                       <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
//                         <span className="text-white text-lg font-bold">
//                           {layout?.sections?.filter(s => s.type.includes('product')).length || 0}
//                         </span>
//                       </div>
//                     </div>
//                     <div className="ml-4">
//                       <p className="text-sm font-medium text-purple-900">Product Sections</p>
//                       <p className="text-xs text-purple-600">Product displays</p>
//                     </div>
//                   </div>
//                 </div>
//               </div>
//             </div>
//           </div>

//           {/* Layout Editor */}
//           <div className="bg-white shadow-lg rounded-lg">
//             <div className="px-6 py-4 border-b border-gray-200">
//               <div className="flex justify-between items-center">
//                 <h3 className="text-lg font-medium text-gray-900">Layout Sections</h3>
//                 <button
//                   onClick={addSection}
//                   className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
//                 >
//                   Add Section
//                 </button>
//               </div>
//             </div>

//             <div className="p-6">
//               {layout?.sections?.length === 0 ? (
//                 <div className="text-center py-16">
//                   <div className="mx-auto h-24 w-24 text-gray-400 mb-4">
//                     <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
//                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
//                     </svg>
//                   </div>
//                   <h3 className="mt-2 text-lg font-medium text-gray-900">No sections configured</h3>
//                   <p className="mt-2 text-sm text-gray-500">Get started by adding your first section to the home screen layout.</p>
//                   <div className="mt-8">
//                     <button
//                       onClick={addSection}
//                       className="inline-flex items-center px-6 py-3 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700"
//                     >
//                       Add First Section
//                     </button>
//                   </div>
//                 </div>
//               ) : (
//                 <div className="space-y-4">
//                   {layout.sections
//                     .sort((a, b) => a.position - b.position)
//                     .map((section, index) => (
//                       <div key={section.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
//                         <div className="flex items-center justify-between mb-4">
//                           <div className="flex items-center space-x-4">
//                             <div className="flex flex-col space-y-1">
//                               <button
//                                 onClick={() => moveSection(section.id, 'up')}
//                                 disabled={index === 0}
//                                 className="p-1 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
//                               >
//                                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
//                                 </svg>
//                               </button>
//                               <button
//                                 onClick={() => moveSection(section.id, 'down')}
//                                 disabled={index === layout.sections.length - 1}
//                                 className="p-1 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
//                               >
//                                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
//                                 </svg>
//                               </button>
//                             </div>
                            
//                             <div className="flex items-center space-x-2">
//                               <span className="bg-indigo-100 text-indigo-800 text-xs font-medium px-2.5 py-0.5 rounded">
//                                 Position {section.position}
//                               </span>
//                               <input
//                                 type="checkbox"
//                                 checked={section.enabled}
//                                 onChange={(e) => updateSection(section.id, { enabled: e.target.checked })}
//                                 className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
//                               />
//                               <label className="text-sm text-gray-700">Enabled</label>
//                             </div>
//                           </div>
                          
//                           <button
//                             onClick={() => removeSection(section.id)}
//                             className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50"
//                           >
//                             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
//                             </svg>
//                           </button>
//                         </div>

//                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
//                           <div>
//                             <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
//                             <input
//                               type="text"
//                               value={section.title}
//                               onChange={(e) => updateSection(section.id, { title: e.target.value })}
//                               className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
//                             />
//                           </div>

//                           <div>
//                             <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
//                             <select
//                               value={section.type}
//                               onChange={(e) => updateSection(section.id, { type: e.target.value })}
//                               className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
//                             >
//                               {getSectionTypeOptions().map(option => (
//                                 <option key={option.value} value={option.value}>
//                                   {option.label}
//                                 </option>
//                               ))}
//                             </select>
//                           </div>

//                           <div>
//                             <label className="block text-sm font-medium text-gray-700 mb-1">Data Source</label>
//                             <select
//                               value={section.config?.source || 'products'}
//                               onChange={(e) => updateSection(section.id, { 
//                                 config: { ...section.config, source: e.target.value }
//                               })}
//                               className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
//                             >
//                               {getSourceOptions().map(option => (
//                                 <option key={option.value} value={option.value}>
//                                   {option.label}
//                                 </option>
//                               ))}
//                             </select>
//                           </div>
//                         </div>

//                         {/* Section-specific configuration */}
//                         <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
//                           {section.type.includes('product') && (
//                             <div>
//                               <label className="block text-sm font-medium text-gray-700 mb-1">Limit</label>
//                               <input
//                                 type="number"
//                                 value={section.config?.limit || 10}
//                                 onChange={(e) => updateSection(section.id, { 
//                                   config: { ...section.config, limit: parseInt(e.target.value) }
//                                 })}
//                                 className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
//                               />
//                             </div>
//                           )}

//                           {section.type.includes('grid') && (
//                             <div>
//                               <label className="block text-sm font-medium text-gray-700 mb-1">Columns</label>
//                               <input
//                                 type="number"
//                                 value={section.config?.columns || 2}
//                                 onChange={(e) => updateSection(section.id, { 
//                                   config: { ...section.config, columns: parseInt(e.target.value) }
//                                 })}
//                                 className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
//                               />
//                             </div>
//                           )}

//                           {section.type.includes('banner') && (
//                             <div>
//                               <label className="block text-sm font-medium text-gray-700 mb-1">Height (px)</label>
//                               <input
//                                 type="number"
//                                 value={section.config?.height || 220}
//                                 onChange={(e) => updateSection(section.id, { 
//                                   config: { ...section.config, height: parseInt(e.target.value) }
//                                 })}
//                                 className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
//                               />
//                             </div>
//                           )}

//                           <div className="flex items-end">
//                             <label className="flex items-center space-x-2">
//                               <input
//                                 type="checkbox"
//                                 checked={section.config?.lazy_load || false}
//                                 onChange={(e) => updateSection(section.id, { 
//                                   config: { ...section.config, lazy_load: e.target.checked }
//                                 })}
//                                 className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
//                               />
//                               <span className="text-sm text-gray-700">Lazy Load</span>
//                             </label>
//                           </div>
//                         </div>
//                       </div>
//                     ))}
//                 </div>
//               )}
//             </div>
//           </div>
//         </div>

//         {/* Right Panel - Preview Mode */}
//         {previewMode && (
//           <div className="w-1/2 pl-6">
//             <div className="bg-white shadow-lg rounded-lg h-full">
//               <div className="px-6 py-4 border-b border-gray-200">
//                 <h3 className="text-lg font-medium text-gray-900">Mobile Preview</h3>
//                 <p className="text-sm text-gray-600">Preview how your layout will look on mobile</p>
//               </div>
              
//               <div className="p-6">
//                 <div className="max-w-sm mx-auto border border-gray-300 rounded-2xl overflow-hidden bg-gray-50" style={{ height: '600px' }}>
//                   {/* Mobile Header */}
//                   <div className="bg-white p-4 border-b border-gray-200">
//                     <div className="flex items-center justify-between">
//                       <div className="text-red-600 font-bold text-lg">eMEGA</div>
//                       <div className="flex items-center space-x-3">
//                         <div className="w-6 h-6 bg-gray-200 rounded-full"></div>
//                         <div className="w-6 h-6 bg-gray-200 rounded-full"></div>
//                       </div>
//                     </div>
//                   </div>
                  
//                   {/* Mobile Content */}
//                   <div className="overflow-y-auto" style={{ height: 'calc(600px - 80px)' }}>
//                     {layout?.sections?.length === 0 ? (
//                       <div className="flex items-center justify-center h-full">
//                         <div className="text-center text-gray-500">
//                           <div className="w-16 h-16 mx-auto mb-4 bg-gray-200 rounded-lg flex items-center justify-center">
//                             <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
//                             </svg>
//                           </div>
//                           <p className="text-sm">No Layout Configured</p>
//                           <p className="text-xs mt-1">Add sections to see preview</p>
//                         </div>
//                       </div>
//                     ) : (
//                       <div className="p-4 space-y-4">
//                         {layout.sections
//                           .filter(section => section.enabled)
//                           .sort((a, b) => a.position - b.position)
//                           .map(section => renderPreviewSection(section))}
//                       </div>
//                     )}
//                   </div>
//                 </div>
//               </div>
//             </div>
//           </div>
//         )}
//       </div>
//     </DashboardLayout>
//   )
// }
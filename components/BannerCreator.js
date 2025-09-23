// components/BannerCreator.js - Updated with no required fields
import { useState, useRef, useEffect } from 'react'

export default function BannerCreator({ 
  isOpen, 
  onClose, 
  onSubmit, 
  editingBanner = null,
  loading = false 
}) {
  const [formData, setFormData] = useState({
    title: '',
    subtitle: '',
    image_url: '',
    text_color: 'white',
    action_type: 'category',
    action_value: '',
    is_active: true,
    display_order: 0,
    start_date: '',
    end_date: ''
  })

  const [previewMode, setPreviewMode] = useState('desktop')
  const [showPreview, setShowPreview] = useState(true)
  const canvasRef = useRef(null)

  // Predefined color schemes
  const colorSchemes = [
    { name: 'Gradient Blue', bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', text: 'white' },
    { name: 'Sunset', bg: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', text: 'white' },
    { name: 'Ocean', bg: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', text: 'white' },
    { name: 'Forest', bg: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', text: 'black' },
    { name: 'Dark', bg: 'linear-gradient(135deg, #2c3e50 0%, #34495e 100%)', text: 'white' },
    { name: 'Purple', bg: 'linear-gradient(135deg, #8360c3 0%, #2ebf91 100%)', text: 'white' }
  ]

  // Template banners
  const templates = [
    {
      name: 'Sale Banner',
      title: 'MEGA SALE',
      subtitle: 'Up to 70% OFF',
      image_url: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&h=400&fit=crop',
      text_color: 'white',
      action_type: 'category'
    },
    {
      name: 'New Arrival',
      title: 'NEW COLLECTION',
      subtitle: 'Discover Latest Trends',
      image_url: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&h=400&fit=crop',
      text_color: 'white',
      action_type: 'category'
    },
    {
      name: 'Summer Special',
      title: 'SUMMER VIBES',
      subtitle: 'Fresh & Cool Deals',
      image_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=400&fit=crop',
      text_color: 'white',
      action_type: 'category'
    }
  ]

  useEffect(() => {
    if (editingBanner) {
      setFormData({
        title: editingBanner.title || '',
        subtitle: editingBanner.subtitle || '',
        image_url: editingBanner.image_url || '',
        text_color: editingBanner.text_color || 'white',
        action_type: editingBanner.action_type || 'category',
        action_value: editingBanner.action_value || '',
        is_active: editingBanner.is_active !== undefined ? editingBanner.is_active : true,
        display_order: editingBanner.display_order || 0,
        start_date: editingBanner.start_date ? editingBanner.start_date.split('T')[0] : '',
        end_date: editingBanner.end_date ? editingBanner.end_date.split('T')[0] : ''
      })
    } else {
      // Reset form when creating new banner
      resetForm()
    }
  }, [editingBanner, isOpen])

  const resetForm = () => {
    setFormData({
      title: '',
      subtitle: '',
      image_url: '',
      text_color: 'white',
      action_type: 'category',
      action_value: '',
      is_active: true,
      display_order: 0,
      start_date: '',
      end_date: ''
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    
    // No validation - allow submission with empty fields
    console.log('Submitting form data:', formData)
    onSubmit(formData)
  }

  const applyTemplate = (template) => {
    setFormData(prev => ({
      ...prev,
      title: template.title,
      subtitle: template.subtitle,
      image_url: template.image_url,
      text_color: template.text_color,
      action_type: template.action_type
    }))
  }

  const handleImageUpload = (event) => {
    const file = event.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        setFormData(prev => ({ ...prev, image_url: e.target.result }))
      }
      reader.readAsDataURL(file)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-4 mx-auto p-5 border w-full max-w-7xl shadow-lg rounded-md bg-white min-h-[90vh]">
        <div className="flex h-full">
          {/* Left Panel - Form */}
          <div className="w-1/2 pr-6 border-r border-gray-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-gray-900">
                {editingBanner ? 'Edit Banner' : 'Create Banner'}
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            {/* Templates Section */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-gray-900 mb-3">Quick Templates</h4>
              <div className="grid grid-cols-3 gap-2">
                {templates.map((template, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => applyTemplate(template)}
                    className="p-2 border border-gray-200 rounded-lg hover:border-indigo-300 transition-colors"
                  >
                    <img
                      src={template.image_url}
                      alt={template.name}
                      className="w-full h-16 object-cover rounded mb-1"
                    />
                    <div className="text-xs text-gray-600">{template.name}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title <span className="text-gray-400 text-xs">(optional)</span>
                  </label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    placeholder="Enter banner title (can be empty)"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subtitle <span className="text-gray-400 text-xs">(optional)</span>
                  </label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    value={formData.subtitle}
                    onChange={(e) => setFormData({...formData, subtitle: e.target.value})}
                    placeholder="Enter subtitle (can be empty)"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Image <span className="text-gray-400 text-xs">(optional)</span>
                  </label>
                  <div className="space-y-2">
                    <input
                      type="url"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      value={formData.image_url}
                      onChange={(e) => setFormData({...formData, image_url: e.target.value})}
                      placeholder="https://example.com/image.jpg (can be empty)"
                    />
                    <div className="text-center text-gray-500 text-sm">or</div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Text Color</label>
                  <select
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    value={formData.text_color}
                    onChange={(e) => setFormData({...formData, text_color: e.target.value})}
                  >
                    <option value="white">White</option>
                    <option value="black">Black</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Action Type</label>
                  <select
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    value={formData.action_type}
                    onChange={(e) => setFormData({...formData, action_type: e.target.value})}
                  >
                    <option value="category">Category</option>
                    <option value="product">Product</option>
                    <option value="url">External URL</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Action Value <span className="text-gray-400 text-xs">(optional)</span>
                  </label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    value={formData.action_value}
                    onChange={(e) => setFormData({...formData, action_value: e.target.value})}
                    placeholder="electronics, product-123, or https://... (can be empty)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
                  <input
                    type="number"
                    min="0"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    value={formData.display_order}
                    onChange={(e) => setFormData({...formData, display_order: e.target.value})}
                  />
                </div>

                <div>
                  <label className="flex items-center mt-6">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                    />
                    <span className="ml-2 text-sm text-gray-700">Active</span>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date <span className="text-gray-400 text-xs">(optional)</span>
                  </label>
                  <input
                    type="date"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    value={formData.start_date}
                    onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date <span className="text-gray-400 text-xs">(optional)</span>
                  </label>
                  <input
                    type="date"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    value={formData.end_date}
                    onChange={(e) => setFormData({...formData, end_date: e.target.value})}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Saving...' : (editingBanner ? 'Update' : 'Create')}
                </button>
              </div>
            </form>
          </div>

          {/* Right Panel - Preview */}
          <div className="w-1/2 pl-6">
            <div className="sticky top-0">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-lg font-semibold text-gray-900">Live Preview</h4>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setPreviewMode('mobile')}
                    className={`px-3 py-1 text-xs rounded ${
                      previewMode === 'mobile' 
                        ? 'bg-indigo-100 text-indigo-800' 
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    Mobile
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode('desktop')}
                    className={`px-3 py-1 text-xs rounded ${
                      previewMode === 'desktop' 
                        ? 'bg-indigo-100 text-indigo-800' 
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    Desktop
                  </button>
                </div>
              </div>

              {/* Preview Container */}
              <div className={`mx-auto border border-gray-300 rounded-lg overflow-hidden ${
                previewMode === 'mobile' ? 'max-w-sm' : 'w-full'
              }`}>
                <div className="relative h-48 bg-gray-200">
                  {formData.image_url ? (
                    <img
                      src={formData.image_url}
                      alt="Banner preview"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.src = 'https://via.placeholder.com/400x200/f0f0f0/999999?text=Image+Preview'
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100">
                      <div className="text-center text-gray-400">
                        <svg className="mx-auto h-12 w-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="text-sm">No image selected</p>
                        <p className="text-xs text-gray-500 mt-1">Image is optional</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Text Overlay */}
                  <div className="absolute inset-0 bg-black bg-opacity-30 flex items-end p-4">
                    <div>
                      {formData.title ? (
                        <h3 className={`text-lg font-bold ${
                          formData.text_color === 'white' ? 'text-white' : 'text-black'
                        }`}>
                          {formData.title}
                        </h3>
                      ) : (
                        <h3 className="text-lg font-bold text-gray-400 italic">
                          No title (optional)
                        </h3>
                      )}
                      {formData.subtitle ? (
                        <p className={`text-sm ${
                          formData.text_color === 'white' ? 'text-white' : 'text-black'
                        }`}>
                          {formData.subtitle}
                        </p>
                      ) : (
                        <p className="text-sm text-gray-400 italic">
                          No subtitle (optional)
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="absolute top-2 right-2">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      formData.is_active 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {formData.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>

                {/* Preview Details */}
                <div className="p-4 bg-white">
                  <div className="text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Action:</span>
                      <span className="font-medium">{formData.action_type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Target:</span>
                      <span className="font-medium truncate ml-2">
                        {formData.action_value || 'Not specified (optional)'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Order:</span>
                      <span className="font-medium">{formData.display_order}</span>
                    </div>
                    {(formData.start_date || formData.end_date) && (
                      <div className="pt-2 border-t border-gray-100">
                        {formData.start_date && (
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Start:</span>
                            <span>{new Date(formData.start_date).toLocaleDateString()}</span>
                          </div>
                        )}
                        {formData.end_date && (
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">End:</span>
                            <span>{new Date(formData.end_date).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Preview Info */}
              <div className="mt-4 p-3 bg-green-50 rounded-lg">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-green-400 mt-0.5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div className="text-sm text-green-800">
                    <p className="font-medium">Flexible Mode Active:</p>
                    <ul className="mt-1 text-xs space-y-1">
                      <li>• All fields are optional - you can submit with empty title/subtitle</li>
                      <li>• Image URL can be empty or invalid</li>
                      <li>• Great for testing or placeholder banners</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
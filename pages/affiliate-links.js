// Add to your affiliate-links.js - REPLACE the CSV upload section

// State variables
const [uploadFile, setUploadFile] = useState(null)
const [uploadStatus, setUploadStatus] = useState('idle')
const [uploadResults, setUploadResults] = useState(null)
const [showUploadModal, setShowUploadModal] = useState(false)
const [selectedStoreForUpload, setSelectedStoreForUpload] = useState(null)

// File upload handler - supports CSV and Excel
const handleFileChange = (event) => {
  const file = event.target.files[0]
  
  if (!file) {
    setUploadFile(null)
    return
  }

  const validTypes = [
    'text/csv',
    'application/vnd.ms-excel', // .xls
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // .xlsx
  ]

  const isValidType = validTypes.includes(file.type) || 
                      file.name.endsWith('.csv') || 
                      file.name.endsWith('.xlsx') || 
                      file.name.endsWith('.xls')

  if (isValidType) {
    setUploadFile(file)
    setUploadStatus('idle')
    console.log('File selected:', file.name, file.type)
  } else {
    addNotification('Please select a CSV or Excel file', 'error')
    setUploadFile(null)
    event.target.value = ''
  }
}

const handleFileUpload = async () => {
  if (!uploadFile || !selectedStoreForUpload) {
    addNotification('Please select a file and store', 'error')
    return
  }

  setUploadStatus('processing')
  
  try {
    let fileData
    let fileType

    // Check file type
    const isExcel = uploadFile.name.endsWith('.xlsx') || 
                    uploadFile.name.endsWith('.xls') ||
                    uploadFile.type.includes('spreadsheet') ||
                    uploadFile.type.includes('excel')

    if (isExcel) {
      // Read Excel file as base64
      fileData = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
          // Get base64 string (remove data URL prefix)
          const base64 = e.target.result.split(',')[1]
          resolve(base64)
        }
        reader.onerror = reject
        reader.readAsDataURL(uploadFile)
      })
      fileType = 'excel'
      console.log('Uploading as Excel, base64 length:', fileData.length)
    } else {
      // Read CSV as text
      fileData = await uploadFile.text()
      fileType = 'csv'
      console.log('Uploading as CSV, text length:', fileData.length)
    }

    const response = await fetch('/api/stores/bulk-import-affiliates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        fileData: fileData,
        fileType: fileType,
        storeId: selectedStoreForUpload,
        userId: session.user.id 
      })
    })
    
    const data = await response.json()
    
    if (response.ok && data.success) {
      setUploadResults(data.results)
      setUploadStatus('completed')
      addNotification(
        `Import Complete! ✓${data.results.imported} ↻${data.results.updated} ✗${data.results.failed}`, 
        'success'
      )
      
      // Reload affiliate links
      await loadAffiliateLinks(session.user.id)
      
      // Reset file input
      setUploadFile(null)
      const fileInput = document.getElementById('file-upload-input')
      if (fileInput) fileInput.value = ''
      
    } else {
      throw new Error(data.error || 'Upload failed')
    }
  } catch (error) {
    setUploadStatus('error')
    addNotification(`Upload failed: ${error.message}`, 'error')
  }
}

// Replace your CSV button with this
<button 
  onClick={() => setShowUploadModal(true)}
  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700"
  disabled={stores.length === 0}
>
  <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
  </svg>
  Import CSV/Excel
</button>

// Replace your CSV modal with this
{showUploadModal && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-green-600 to-emerald-600">
        <div className="flex items-center justify-between">
          <div className="text-white">
            <h3 className="text-lg font-bold">Bulk Import Affiliate Links</h3>
            <p className="text-sm text-green-100 mt-1">Upload CSV or Excel file</p>
          </div>
          <button
            onClick={() => {
              setShowUploadModal(false)
              setUploadFile(null)
              setUploadStatus('idle')
              setUploadResults(null)
            }}
            className="text-white/80 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Format Instructions */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h4 className="text-sm font-bold text-blue-900 mb-2">File Format Requirements</h4>
              <div className="space-y-2 text-sm text-blue-800">
                <p className="font-medium">Your file must have 2 columns:</p>
                <div className="bg-white rounded border border-blue-200 p-3 font-mono text-xs">
                  <div className="grid grid-cols-2 gap-4 font-bold text-blue-900 mb-1">
                    <div>SKU (ASIN)</div>
                    <div>AFFILIATE LINK</div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-gray-700">
                    <div>B0F1TFGPM8</div>
                    <div>https://amzn.to/44NOv63</div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-gray-700">
                    <div>B077P2F6G5</div>
                    <div>https://amzn.to/3N4J2BI</div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-gray-700">
                    <div>B0FJ5DTNMJ</div>
                    <div>https://amzn.to/4awNUtd</div>
                  </div>
                </div>
                <div className="flex items-start gap-2 text-xs">
                  <span className="text-green-600 font-bold">✓</span>
                  <span>Accepts: <strong>.csv</strong>, <strong>.xlsx</strong>, <strong>.xls</strong></span>
                </div>
                <div className="flex items-start gap-2 text-xs">
                  <span className="text-green-600 font-bold">✓</span>
                  <span>SKU must match your product's Amazon ASIN</span>
                </div>
                <div className="flex items-start gap-2 text-xs">
                  <span className="text-green-600 font-bold">✓</span>
                  <span>Updates existing links automatically</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Store Selection */}
        <div>
          <label className="block text-sm font-bold text-gray-900 mb-2">
            Select Store <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedStoreForUpload || ''}
            onChange={(e) => setSelectedStoreForUpload(parseInt(e.target.value))}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
            required
          >
            <option value="">Choose a store...</option>
            {stores.map(store => (
              <option key={store.id} value={store.id}>{store.store_name}</option>
            ))}
          </select>
        </div>

        {/* File Upload */}
        <div>
          <label className="block text-sm font-bold text-gray-900 mb-2">
            Upload File <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id="file-upload-input"
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
              disabled={uploadStatus === 'processing' || !selectedStoreForUpload}
              className="w-full text-sm file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100 cursor-pointer border border-gray-300 rounded-lg"
            />
          </div>
          {uploadFile && (
            <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">{uploadFile.name}</span>
              <span className="text-gray-400">({(uploadFile.size / 1024).toFixed(1)} KB)</span>
            </div>
          )}
          {!selectedStoreForUpload && (
            <p className="text-xs text-yellow-600 mt-2 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Please select a store first
            </p>
          )}
        </div>

        {/* Upload Button */}
        {uploadFile && uploadStatus === 'idle' && selectedStoreForUpload && (
          <button
            onClick={handleFileUpload}
            className="w-full px-6 py-3 text-sm font-bold text-white bg-gradient-to-r from-green-600 to-emerald-600 rounded-lg hover:from-green-700 hover:to-emerald-700 shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload and Process
          </button>
        )}

        {/* Processing */}
        {uploadStatus === 'processing' && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-green-600"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
            </div>
            <p className="text-sm font-medium text-gray-900 mt-4">Processing file...</p>
            <p className="text-xs text-gray-500 mt-1">This may take a moment</p>
          </div>
        )}

        {/* Results */}
        {uploadStatus === 'completed' && uploadResults && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h4 className="text-lg font-bold text-green-900">Import Complete!</h4>
              </div>
              
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-white rounded-lg p-3 border border-gray-200 text-center">
                  <div className="text-2xl font-bold text-gray-900">{uploadResults.total}</div>
                  <div className="text-xs text-gray-600 mt-1">Total Rows</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-green-200 text-center">
                  <div className="text-2xl font-bold text-green-600">{uploadResults.imported}</div>
                  <div className="text-xs text-gray-600 mt-1">Imported</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-blue-200 text-center">
                  <div className="text-2xl font-bold text-blue-600">{uploadResults.updated}</div>
                  <div className="text-xs text-gray-600 mt-1">Updated</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-red-200 text-center">
                  <div className="text-2xl font-bold text-red-600">{uploadResults.failed}</div>
                  <div className="text-xs text-gray-600 mt-1">Failed</div>
                </div>
              </div>

              {uploadResults.errors && uploadResults.errors.length > 0 && (
                <div className="mt-4">
                  <h5 className="text-xs font-bold text-red-900 mb-2 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Errors ({uploadResults.errors.length})
                  </h5>
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {uploadResults.errors.slice(0, 10).map((err, idx) => (
                      <div key={idx} className="text-xs bg-red-50 border border-red-200 rounded p-2">
                        <span className="font-bold text-red-900">Row {err.row}:</span>{' '}
                        <span className="font-mono text-red-700">{err.sku}</span> - {err.error}
                      </div>
                    ))}
                    {uploadResults.errors.length > 10 && (
                      <p className="text-xs text-gray-500 italic">
                        ...and {uploadResults.errors.length - 10} more errors
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setShowUploadModal(false)
                setUploadFile(null)
                setUploadStatus('idle')
                setUploadResults(null)
                setSelectedStoreForUpload(null)
              }}
              className="w-full px-4 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  </div>
)}
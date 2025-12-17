import React, { useState, useRef } from 'react';
import { Plus, Trash2, CheckCircle, XCircle, Circle, FileText, Mail, Download, Calendar, Camera, Search, Package } from 'lucide-react';
import { useQuery, useMutation, useLazyQuery } from '@animaapp/playground-react-sdk';
import { generateWordDocument } from '../../lib/wordExport';
import { Packer } from 'docx';
import html2canvas from 'html2canvas';

export const ProductTesting = (): JSX.Element => {
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showInventorySearch, setShowInventorySearch] = useState(false);
  const [inventorySearchId, setInventorySearchId] = useState('');
  const [newProduct, setNewProduct] = useState({
    inventoryId: '',
    name: '',
    description: '',
    price: 0,
    photos: [] as string[],
    components: [] as Array<{ name: string }>
  });
  const [newComponent, setNewComponent] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const testPanelRef = useRef<HTMLDivElement>(null);

  // Fetch all products
  const { data: products = [], isPending: isLoadingProducts, error: productsError } = useQuery('Product', {
    orderBy: { updatedAt: 'desc' }
  });

  // Fetch selected product
  const { data: selectedProduct } = useQuery('Product', selectedProductId || '');

  // Fetch components for selected product
  const { data: components = [] } = useQuery('ComponentTest', {
    where: { productId: selectedProductId || '' }
  });

  // Fetch photos for selected product
  const { data: photos = [] } = useQuery('ProductPhoto', {
    where: { productId: selectedProductId || '' }
  });

  // Mutations
  const { create: createProduct, remove: deleteProduct, isPending: isProductMutating } = useMutation('Product');
  const { create: createComponent, update: updateComponent, isPending: isComponentMutating } = useMutation('ComponentTest');
  const { create: createPhoto, remove: deletePhoto } = useMutation('ProductPhoto');

  // Lazy queries
  const { query: queryProducts } = useLazyQuery('Product');
  const { query: queryComponents } = useLazyQuery('ComponentTest');
  const { query: queryPhotos } = useLazyQuery('ProductPhoto');

  const handleAddProduct = async () => {
    if (!newProduct.name || !newProduct.inventoryId) return;
    
    try {
      const product = await createProduct({
        inventoryId: newProduct.inventoryId,
        name: newProduct.name,
        description: newProduct.description,
        price: newProduct.price
      });

      // Add components
      for (const comp of newProduct.components) {
        await createComponent({
          productId: product.id,
          name: comp.name,
          status: 'untested',
          notes: ''
        });
      }

      // Add photos
      for (const photoUrl of newProduct.photos) {
        await createPhoto({
          productId: product.id,
          url: photoUrl
        });
      }

      setNewProduct({ inventoryId: '', name: '', description: '', price: 0, photos: [], components: [] });
      setShowAddProduct(false);
      setSelectedProductId(product.id);
    } catch (error) {
      console.error('Failed to add product:', error);
    }
  };

  const handleAddComponent = () => {
    if (!newComponent) return;
    
    setNewProduct({
      ...newProduct,
      components: [...newProduct.components, { name: newComponent }]
    });
    setNewComponent('');
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setNewProduct(prev => ({
            ...prev,
            photos: [...prev.photos, event.target!.result as string]
          }));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemovePhoto = (index: number) => {
    setNewProduct(prev => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index)
    }));
  };

  const handleUpdateComponentStatus = async (componentId: string, status: string) => {
    try {
      await updateComponent(componentId, { 
        status,
        testedAt: new Date()
      });
    } catch (error) {
      console.error('Failed to update component status:', error);
    }
  };

  const handleUpdateComponentNotes = async (componentId: string, notes: string) => {
    try {
      await updateComponent(componentId, { notes });
    } catch (error) {
      console.error('Failed to update component notes:', error);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      // Delete associated components
      const productComponents = await queryComponents({ where: { productId: id } });
      for (const comp of productComponents) {
        await updateComponent(comp.id, { productId: '' }); // Soft delete by clearing productId
      }

      // Delete associated photos
      const productPhotos = await queryPhotos({ where: { productId: id } });
      for (const photo of productPhotos) {
        await deletePhoto(photo.id);
      }

      // Delete product
      await deleteProduct(id);
      
      if (selectedProductId === id) {
        setSelectedProductId(null);
      }
    } catch (error) {
      console.error('Failed to delete product:', error);
    }
  };

  const handleSearchByInventoryId = async () => {
    if (!inventorySearchId) return;
    
    try {
      const results = await queryProducts({ where: { inventoryId: inventorySearchId } });
      if (results.length > 0) {
        setSelectedProductId(results[0].id);
        setShowInventorySearch(false);
        setInventorySearchId('');
      } else {
        alert('Product not found with this Inventory ID');
      }
    } catch (error) {
      console.error('Failed to search product:', error);
    }
  };

  const captureScreenshot = async (): Promise<string | undefined> => {
    if (!testPanelRef.current) return undefined;
    
    try {
      const canvas = await html2canvas(testPanelRef.current, {
        backgroundColor: '#ffffff',
        scale: 2
      });
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('Screenshot capture failed:', error);
      return undefined;
    }
  };

  const handleDownloadWordReport = async () => {
    if (!selectedProduct) return;
    
    setIsGeneratingDoc(true);
    try {
      const screenshot = await captureScreenshot();
      const doc = await generateWordDocument(selectedProduct, components, photos, screenshot);
      const blob = await Packer.toBlob(doc);
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedProduct.name.replace(/\s+/g, '_')}_test_report_${Date.now()}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Document generation failed:', error);
      alert('Failed to generate document. Please try again.');
    } finally {
      setIsGeneratingDoc(false);
    }
  };

  const handleEmailReport = async () => {
    if (!selectedProduct || !emailAddress) return;
    
    setIsGeneratingDoc(true);
    try {
      const screenshot = await captureScreenshot();
      const doc = await generateWordDocument(selectedProduct, components, photos, screenshot);
      const blob = await Packer.toBlob(doc);
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedProduct.name.replace(/\s+/g, '_')}_test_report.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      const subject = encodeURIComponent(`Product Testing Report: ${selectedProduct.name} (ID: ${selectedProduct.inventoryId})`);
      const body = encodeURIComponent(`Please find attached the testing report for ${selectedProduct.name}.\n\nInventory ID: ${selectedProduct.inventoryId}\nTest Date: ${new Date().toLocaleDateString()}\n\nNote: The Word document has been downloaded to your computer. Please attach it to this email.`);
      
      window.location.href = `mailto:${emailAddress}?subject=${subject}&body=${body}`;
      setShowExportModal(false);
      setEmailAddress('');
    } catch (error) {
      console.error('Email preparation failed:', error);
      alert('Failed to prepare email. Please try again.');
    } finally {
      setIsGeneratingDoc(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'working':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'not-working':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Circle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusStats = (productId: string) => {
    const productComponents = components.filter(c => c.productId === productId);
    const working = productComponents.filter(c => c.status === 'working').length;
    const notWorking = productComponents.filter(c => c.status === 'not-working').length;
    const untested = productComponents.filter(c => c.status === 'untested').length;
    return { working, notWorking, untested, total: productComponents.length };
  };

  if (isLoadingProducts) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-xl text-gray-600">Loading products...</div>
      </div>
    );
  }

  if (productsError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-xl text-red-600">Error: {productsError.message}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Product Component Testing</h1>
              <p className="text-gray-600">Test and document your product components</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowInventorySearch(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-xl hover:from-blue-700 hover:to-blue-800 transition shadow-md hover:shadow-lg"
              >
                <Search className="w-5 h-5" />
                Search by ID
              </button>
              <button
                onClick={() => setShowAddProduct(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-primary-600 to-primary-700 text-white px-6 py-3 rounded-xl hover:from-primary-700 hover:to-primary-800 transition shadow-md hover:shadow-lg"
              >
                <Plus className="w-5 h-5" />
                Add Product
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Products List */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-xl shadow-md p-4">
              <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-primary-600" />
                Products ({products.length})
              </h2>
              <div className="space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto">
                {products.map(product => {
                  const stats = getStatusStats(product.id);
                  const passRate = stats.total > 0 ? Math.round((stats.working / stats.total) * 100) : 0;
                  
                  return (
                    <div
                      key={product.id}
                      onClick={() => setSelectedProductId(product.id)}
                      className={`p-4 bg-gradient-to-br from-white to-gray-50 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md ${
                        selectedProductId === product.id 
                          ? 'border-primary-600 shadow-md' 
                          : 'border-gray-200 hover:border-primary-300'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="text-xs text-primary-600 font-semibold mb-1">ID: {product.inventoryId}</div>
                          <h3 className="font-semibold text-gray-900 text-lg">{product.name}</h3>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProduct(product.id);
                          }}
                          disabled={isProductMutating}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-sm text-gray-600 mb-3 line-clamp-2">{product.description}</p>
                      
                      {/* Progress Bar */}
                      <div className="mb-3">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>Progress</span>
                          <span className="font-semibold">{passRate}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-gradient-to-r from-green-500 to-green-600 h-2 rounded-full transition-all"
                            style={{ width: `${passRate}%` }}
                          />
                        </div>
                      </div>
                      
                      <div className="flex gap-4 text-sm">
                        <span className="flex items-center gap-1 text-green-600 font-medium">
                          <CheckCircle className="w-4 h-4" /> {stats.working}
                        </span>
                        <span className="flex items-center gap-1 text-red-600 font-medium">
                          <XCircle className="w-4 h-4" /> {stats.notWorking}
                        </span>
                        <span className="flex items-center gap-1 text-gray-400 font-medium">
                          <Circle className="w-4 h-4" /> {stats.untested}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Component Testing Panel */}
          <div className="lg:col-span-2">
            {selectedProduct ? (
              <div ref={testPanelRef} className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <div className="text-sm text-primary-600 font-semibold mb-1">Inventory ID: {selectedProduct.inventoryId}</div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">{selectedProduct.name}</h2>
                    <p className="text-gray-600">{selectedProduct.description}</p>
                    <p className="text-primary-600 font-semibold mt-2">${selectedProduct.price}</p>
                  </div>
                  <button
                    onClick={() => setShowExportModal(true)}
                    className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 rounded-lg hover:from-blue-700 hover:to-blue-800 transition shadow-md"
                  >
                    <FileText className="w-4 h-4" />
                    Export Report
                  </button>
                </div>

                {/* Product Photos */}
                {photos.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <Camera className="w-5 h-5 text-primary-600" />
                      Product Photos
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                      {photos.map((photo) => (
                        <img
                          key={photo.id}
                          src={photo.url}
                          alt="Product"
                          className="w-full h-32 object-cover rounded-lg border-2 border-gray-200"
                        />
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="space-y-4 max-h-[calc(100vh-450px)] overflow-y-auto pr-2">
                  <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2 sticky top-0 bg-white py-2">
                    <Calendar className="w-5 h-5 text-primary-600" />
                    Components Testing
                  </h3>
                  {components.map(component => (
                    <div key={component.id} className="border-2 border-gray-200 rounded-xl p-4 hover:border-primary-300 transition bg-gradient-to-br from-white to-gray-50">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-gray-900 text-lg">{component.name}</h4>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUpdateComponentStatus(component.id, 'working')}
                            disabled={isComponentMutating}
                            className={`p-2 rounded-lg transition ${
                              component.status === 'working' 
                                ? 'bg-green-100 ring-2 ring-green-500' 
                                : 'hover:bg-gray-100'
                            }`}
                            title="Mark as Working"
                          >
                            <CheckCircle className={`w-6 h-6 ${component.status === 'working' ? 'text-green-600' : 'text-gray-400'}`} />
                          </button>
                          <button
                            onClick={() => handleUpdateComponentStatus(component.id, 'not-working')}
                            disabled={isComponentMutating}
                            className={`p-2 rounded-lg transition ${
                              component.status === 'not-working' 
                                ? 'bg-red-100 ring-2 ring-red-500' 
                                : 'hover:bg-gray-100'
                            }`}
                            title="Mark as Not Working"
                          >
                            <XCircle className={`w-6 h-6 ${component.status === 'not-working' ? 'text-red-600' : 'text-gray-400'}`} />
                          </button>
                          <button
                            onClick={() => handleUpdateComponentStatus(component.id, 'untested')}
                            disabled={isComponentMutating}
                            className={`p-2 rounded-lg transition ${
                              component.status === 'untested' 
                                ? 'bg-gray-100 ring-2 ring-gray-500' 
                                : 'hover:bg-gray-100'
                            }`}
                            title="Mark as Untested"
                          >
                            <Circle className={`w-6 h-6 ${component.status === 'untested' ? 'text-gray-600' : 'text-gray-400'}`} />
                          </button>
                        </div>
                      </div>
                      <textarea
                        placeholder="Add notes about this component test..."
                        defaultValue={component.notes}
                        onBlur={(e) => handleUpdateComponentNotes(component.id, e.target.value)}
                        disabled={isComponentMutating}
                        className="w-full p-3 border-2 border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition disabled:opacity-50"
                        rows={3}
                      />
                      {component.testedAt && (
                        <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Last tested: {new Date(component.testedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-lg p-12 text-center">
                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">Select a product to test its components</p>
                <p className="text-gray-400 text-sm mt-2">or search by Inventory ID</p>
              </div>
            )}
          </div>
        </div>

        {/* Inventory Search Modal */}
        {showInventorySearch && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
              <h2 className="text-2xl font-bold mb-6 text-gray-900 flex items-center gap-2">
                <Search className="w-6 h-6 text-primary-600" />
                Search by Inventory ID
              </h2>
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Enter Inventory ID (e.g., INV-12345)"
                  value={inventorySearchId}
                  onChange={(e) => setInventorySearchId(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearchByInventoryId()}
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowInventorySearch(false);
                      setInventorySearchId('');
                    }}
                    className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSearchByInventoryId}
                    disabled={!inventorySearchId}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg hover:from-primary-700 hover:to-primary-800 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    Search
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Product Modal */}
        {showAddProduct && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl my-8">
              <h2 className="text-2xl font-bold mb-6 text-gray-900">Add New Product</h2>
              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Inventory ID *</label>
                  <input
                    type="text"
                    placeholder="e.g., INV-12345"
                    value={newProduct.inventoryId}
                    onChange={(e) => setNewProduct({ ...newProduct, inventoryId: e.target.value })}
                    className="w-full p-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
                  <input
                    type="text"
                    placeholder="Enter product name"
                    value={newProduct.name}
                    onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                    className="w-full p-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    placeholder="Enter product description"
                    value={newProduct.description}
                    onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                    className="w-full p-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price ($)</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={newProduct.price}
                    onChange={(e) => setNewProduct({ ...newProduct, price: parseFloat(e.target.value) || 0 })}
                    className="w-full p-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition"
                  />
                </div>

                {/* Photo Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Product Photos</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 transition flex items-center justify-center gap-2 text-gray-600 hover:text-primary-600"
                  >
                    <Camera className="w-5 h-5" />
                    Click to upload photos
                  </button>
                  {newProduct.photos.length > 0 && (
                    <div className="grid grid-cols-4 gap-3 mt-3">
                      {newProduct.photos.map((photo, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={photo}
                            alt={`Product ${index + 1}`}
                            className="w-full h-24 object-cover rounded-lg border-2 border-gray-200"
                          />
                          <button
                            onClick={() => handleRemovePhoto(index)}
                            className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Components to Test</label>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      placeholder="Component name"
                      value={newComponent}
                      onChange={(e) => setNewComponent(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddComponent()}
                      className="flex-1 p-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition"
                    />
                    <button
                      onClick={handleAddComponent}
                      className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition shadow-md"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {newProduct.components.map((comp, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span className="text-sm font-medium text-gray-700">{comp.name}</span>
                        <button
                          onClick={() => setNewProduct({
                            ...newProduct,
                            components: newProduct.components.filter((_, i) => i !== index)
                          })}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      setShowAddProduct(false);
                      setNewProduct({ inventoryId: '', name: '', description: '', price: 0, photos: [], components: [] });
                      setNewComponent('');
                    }}
                    className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddProduct}
                    disabled={!newProduct.name || !newProduct.inventoryId || isProductMutating}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg hover:from-primary-700 hover:to-primary-800 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {isProductMutating ? 'Adding...' : 'Add Product'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Export Report Modal */}
        {showExportModal && selectedProduct && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 back

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
// Note: getAnalytics is imported but not used in the provided functional logic.
// If you intend to use Firebase Analytics, you'd add calls like logEvent(analytics, 'screen_view', { screen_name: 'Dashboard' });
// import { getAnalytics } from "firebase/analytics";
import { LayoutDashboard, Upload, Folder, Search, Settings, FileText, Download, Trash2, PlusCircle, Bell, User, ChevronRight, HeartPulse, Shield, NotebookPen, ClipboardPaste, Stethoscope, FlaskConical, X, FileCheck, BarChart, Boxes, Eye } from 'lucide-react';

// Global variables provided by the Canvas environment (with local fallbacks)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'local-meddocs-app'; // A dummy ID for local development

// YOUR WEB APP'S FIREBASE CONFIGURATION - PROVIDED BY USER
const firebaseConfig = {
    apiKey: "AIzaSyArtdt7C7UTRxNHETnxL25PCzIVQ4i0Nkg",
    authDomain: "med-mind-b7a71.firebaseapp.com",
    projectId: "med-mind-b7a71",
    storageBucket: "med-mind-b7a71.firebasestorage.app",
    messagingSenderId: "460832695260",
    appId: "1:460832695260:web:c0966a266e6b05ef9be519",
    measurementId: "G-1S5BBNBL73"
};

const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null; // Keep null for local anonymous sign-in

// Define your backend URL (already updated to your Render deployment)
const BACKEND_URL = 'https://med-mind-2.onrender.com';

// Viewer Modal Component
const ViewerModal = ({ show, onClose, content, contentType, title }) => {
    if (!show) return null;

    const renderContent = () => {
        if (!content) return <p className="text-gray-600">No content available to display.</p>;

        if (contentType && contentType.startsWith('image/')) {
            return <img src={content} alt="Document View" className="max-w-full h-auto rounded-lg shadow-md" />;
        } else if (contentType === 'application/pdf') {
            return (
                <iframe
                    src={content}
                    width="100%"
                    height="500px"
                    className="border-none rounded-lg shadow-md"
                    title="PDF Viewer"
                >
                    This browser does not support PDFs. Please download the file to view it.
                </iframe>
            );
        } else if (contentType === 'text/plain' || contentType === 'application/octet-stream' || contentType === 'text/markdown') {
            return (
                <textarea
                    readOnly
                    className="w-full h-96 p-4 border border-gray-300 rounded-lg bg-gray-50 text-gray-800 font-mono resize-none"
                    value={content}
                ></textarea>
            );
        }
        return <p className="text-gray-600">Unsupported file type for in-app viewing. Please download.</p>;
    };

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 shadow-xl max-w-3xl w-full relative">
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
                >
                    <X size={24} />
                </button>
                <h3 className="text-xl font-semibold text-gray-900 mb-4 border-b pb-2">{title}</h3>
                <div className="max-h-[70vh] overflow-y-auto">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};


function App() {
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [documents, setDocuments] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [loadingDocs, setLoadingDocs] = useState(true);
    const [error, setError] = useState(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [docToDelete, setDocToDelete] = useState(null);
    const fileInputRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const [analyticsData, setAnalyticsData] = useState(null);

    // State for Viewer Modal
    const [showViewerModal, setShowViewerModal] = useState(false);
    const [viewerContent, setViewerContent] = useState('');
    const [viewerContentType, setViewerContentType] = useState('');
    const [viewerTitle, setViewerTitle] = useState('');

    // New state for category filtering
    const [selectedCategory, setSelectedCategory] = useState(null); // null means "All Documents"


    // State to manage current page/view
    const [currentPage, setCurrentPage] = useState('dashboard'); // 'dashboard', 'documents', 'categories', 'digital-copy', 'analytics', 'upload', 'search', 'settings'

    // Refs for scrolling to sections (only relevant if sections are on the same page)
    const uploadSectionRef = useRef(null);
    const searchBarRef = useRef(null);

    // Handle sidebar navigation and scrolling (adjusted for new page structure)
    const handleNavigationClick = (page) => {
        setCurrentPage(page);
        // Reset selected category when navigating to a different main page
        if (page !== 'categories' && selectedCategory !== null) {
            setSelectedCategory(null);
        }
    };

    // Initialize Firebase for Auth only
    useEffect(() => {
        try {
            // Log the config being used to help debug
            console.log('Firebase config used:', firebaseConfig);
            const app = initializeApp(firebaseConfig);
            // If you want to use analytics, uncomment the line below and the import at the top
            // const analytics = getAnalytics(app);
            const firebaseAuth = getAuth(app);
            setAuth(firebaseAuth);

            const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    try {
                        // IMPORTANT: Ensure Anonymous Authentication is enabled in your Firebase project
                        // Go to Firebase Console -> Authentication -> Sign-in method -> Anonymous
                        if (initialAuthToken) {
                            await signInWithCustomToken(firebaseAuth, initialAuthToken);
                        } else {
                            await signInAnonymously(firebaseAuth);
                        }
                    } catch (e) {
                        console.error("Error signing in:", e);
                        setError("Failed to sign in. Please try again.");
                    }
                }
                setIsAuthReady(true);
            });

            return () => unsubscribe();
        } catch (e) {
            console.error("Error initializing Firebase Auth:", e);
            setError("Failed to initialize authentication. Please check console for details.");
        }
    }, []);

    // Function to fetch documents from backend
    const fetchDocuments = useCallback(async () => {
        if (!userId) {
            return;
        }
        setLoadingDocs(true);
        setError(null);
        try {
            const response = await fetch(`${BACKEND_URL}/documents`, {
                headers: {
                    'X-User-Id': userId,
                },
            });
            if (!response.ok) {
                // If response is not OK, it means a server-side error or specific HTTP error
                const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            setDocuments(data);
        } catch (e) {
            console.error("Error fetching documents from backend:", e);
            // More specific error message for network issues
            if (e instanceof TypeError && e.message === 'Failed to fetch') {
                setError("Failed to connect to the backend. Please ensure the backend server is running and accessible at " + BACKEND_URL + ".");
            } else {
                setError(`Failed to load documents: ${e.message}. Please check backend logs.`);
            }
        } finally {
            setLoadingDocs(false);
        }
    }, [userId]);

    // Function to fetch analytics from backend
    const fetchAnalytics = useCallback(async () => {
        if (!userId) {
            return;
        }
        setError(null);
        try {
            const response = await fetch(`${BACKEND_URL}/analytics`, {
                headers: {
                    'X-User-Id': userId,
                },
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            setAnalyticsData(data);
        } catch (e) {
            console.error("Error fetching analytics from backend:", e);
            if (e instanceof TypeError && e.message === 'Failed to fetch') {
                setError("Failed to connect to the backend for analytics. Please ensure the backend server is running and accessible at " + BACKEND_URL + ".");
            } else {
                setError(`Failed to load analytics data: ${e.message}. Please check backend logs.`);
            }
        }
    }, [userId]);


    // Fetch documents and analytics when auth is ready and userId is available
    useEffect(() => {
        if (isAuthReady && userId) {
            fetchDocuments();
            fetchAnalytics();
        }
    }, [isAuthReady, userId, fetchDocuments, fetchAnalytics]);

    // Handle sidebar navigation and scrolling (adjusted for new page structure)
    useEffect(() => {
        if (currentPage === 'upload' && uploadSectionRef.current) {
            uploadSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (currentPage === 'search' && searchBarRef.current) {
            searchBarRef.current.focus();
        }
    }, [currentPage]);

    // Handle file selection
    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            setSelectedFile(file);
            setError(null);
        }
    };

    // Handle file drop
    const handleDrop = (event) => {
        event.preventDefault();
        setIsDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) {
            setSelectedFile(file);
            setError(null);
        }
    };

    // Prevent default drag behavior
    const handleDragOver = (event) => {
        event.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    // Upload document to backend
    const handleUpload = async () => {
        if (!selectedFile) {
            setError("Please select a file to upload.");
            return;
        }
        if (!userId) {
            setError("User not authenticated. Please wait.");
            return;
        }

        setUploading(true);
        setError(null);

        const formData = new FormData();
        formData.append('file', selectedFile);

        try {
            const response = await fetch(`${BACKEND_URL}/upload`, {
                method: 'POST',
                headers: {
                    'X-User-Id': userId,
                },
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log("Upload successful:", result);
            setSelectedFile(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            fetchDocuments(); // Refresh document list
            fetchAnalytics(); // Refresh analytics
        } catch (e) {
            console.error("Error uploading document:", e);
            if (e instanceof TypeError && e.message === 'Failed to fetch') {
                setError("Failed to upload document: Could not connect to the backend. Please ensure the backend server is running and accessible at " + BACKEND_URL + ".");
            } else {
                setError(`Failed to upload document: ${e.message}. Please check backend logs.`);
            }
        } finally {
            setUploading(false);
        }
    };

    // Handle viewing document content
    const handleView = useCallback(async (documentId, type = 'original') => {
        if (!userId) {
            setError("User not authenticated. Cannot view.");
            return;
        }
        setError(null);
        try {
            const response = await fetch(`${BACKEND_URL}/documents/${documentId}/download/${type}`, {
                headers: {
                    'X-User-Id': userId,
                },
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const blob = await response.blob();
            const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
            const url = window.URL.createObjectURL(blob);

            const doc = documents.find(d => d.id === documentId);
            const title = `${doc?.name || 'Document'} (${type === 'original' ? 'Original' : 'Digital Copy'})`;

            // For text content, read as text
            if (contentType.startsWith('text/')) {
                const text = await blob.text();
                setViewerContent(text);
                setViewerContentType('text/plain'); // Force to text/plain for consistent display
            } else if (contentType.startsWith('image/') || contentType === 'application/pdf') {
                setViewerContent(url); // For images/PDFs, the URL is enough
                setViewerContentType(contentType);
            } else {
                // Fallback for other types, try to display as text or inform user
                const text = await blob.text(); // Attempt to read as text for display
                setViewerContent(`Cannot display this file type directly. Content preview:\n\n${text.substring(0, 500)}...`);
                setViewerContentType('text/plain');
            }

            setViewerTitle(title);
            setShowViewerModal(true);

        } catch (e) {
            console.error(`Error viewing ${type} document:`, e);
            if (e instanceof TypeError && e.message === 'Failed to fetch') {
                setError(`Failed to view ${type} document: Could not connect to the backend. Please ensure the backend server is running and accessible at ` + BACKEND_URL + ".");
            } else {
                setError(`Failed to view ${type} document: ${e.message}. Please check backend logs.`);
            }
        }
    }, [userId, documents]);


    // Download document from backend (kept for explicit download option)
    const handleDownload = useCallback(async (documentId, type = 'original') => {
        if (!userId) {
            setError("User not authenticated. Cannot download.");
            return;
        }
        setError(null);
        try {
            const response = await fetch(`${BACKEND_URL}/documents/${documentId}/download/${type}`, { // Corrected variable name from document_id to documentId
                headers: {
                    'X-User-Id': userId,
                },
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const blob = await response.blob();
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'download';
            if (contentDisposition && contentDisposition.indexOf('filename=') !== -1) {
                filename = contentDisposition.split('filename=')[1].split(';')[0].replace(/"/g, '');
            } else {
                // Fallback filename if Content-Disposition is missing or malformed
                const doc = documents.find(d => d.id === documentId);
                if (doc) {
                    filename = type === 'original' ? doc.name : `${doc.name.split('.')[0]}_digital.txt`;
                }
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            console.error(`Error downloading ${type} document:`, e);
            if (e instanceof TypeError && e.message === 'Failed to fetch') {
                setError(`Failed to download ${type} document: Could not connect to the backend. Please ensure the backend server is running and accessible at ` + BACKEND_URL + ".");
            } else {
                setError(`Failed to download ${type} document: ${e.message}. Please check backend logs.`);
            }
        }
    }, [userId, documents]);

    // Confirm deletion
    const confirmDelete = (doc) => {
        setDocToDelete(doc);
        setShowDeleteConfirm(true);
    };

    // Delete document via backend
    const handleDelete = async () => {
        if (!userId || !docToDelete) {
            setError("User not authenticated or no document selected for deletion.");
            setShowDeleteConfirm(false);
            setDocToDelete(null);
            return;
        }

        setLoadingDocs(true); // Indicate loading while deleting
        setError(null);
        try {
            const response = await fetch(`${BACKEND_URL}/documents/${docToDelete.id}`, {
                method: 'DELETE',
                headers: {
                    'X-User-Id': userId,
                },
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            console.log("Document deleted successfully!");
            fetchDocuments(); // Refresh document list
            fetchAnalytics(); // Refresh analytics
        } catch (e) {
            console.error("Error deleting document:", e);
            if (e instanceof TypeError && e.message === 'Failed to fetch') {
                setError("Failed to delete document: Could not connect to the backend. Please ensure the backend server is running and accessible at " + BACKEND_URL + ".");
            } else {
                setError(`Failed to delete document: ${e.message}. Please check backend logs.`);
            }
        } finally {
            setShowDeleteConfirm(false);
            setDocToDelete(null);
            setLoadingDocs(false); // End loading
        }
    };

    // Handle category item click - now also filters documents
    const handleCategoryClick = (categoryName) => {
        setCurrentPage('documents'); // Navigate to the documents page
        setSelectedCategory(categoryName === 'All Documents' ? null : categoryName); // Set filter, null for 'All'
        console.log(`Filtering documents by category: ${categoryName}`);
    };

    // Handle "Add Custom Category" click
    const handleAddCustomCategory = () => {
        console.log("Opening modal/form to add a custom category (placeholder).");
    };

    // Handle "Bulk Upload" click
    const handleBulkUpload = () => {
        console.log("Initiating bulk upload (placeholder).");
        fileInputRef.current.click();
    };

    // Handle "Export Data" click
    const handleExportData = () => {
        console.log("Exporting data (placeholder).");
        try {
            const dataToExport = JSON.stringify(documents, null, 2);
            const blob = new Blob([dataToExport], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `meddocs_data_export_${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            console.log("Data exported successfully!");
        } catch (e) {
            console.error("Error exporting data:", e);
            setError("Failed to export data.");
        }
    };

    // Handle "Manage Categories" click
    const handleManageCategories = () => {
        console.log("Navigating to manage categories (placeholder).");
    };

    const documentCategories = [
        { name: 'All Documents', icon: Folder }, // Added 'All Documents' category
        { name: 'Lab Results', icon: FlaskConical },
        { name: 'Prescriptions', icon: Stethoscope },
        { name: 'Radiology', icon: ClipboardPaste },
        { name: 'Discharge Summaries', icon: NotebookPen },
        { name: 'Vital Signs', icon: HeartPulse },
        { name: 'Insurance', icon: Shield },
        { name: 'Consultation Notes', icon: NotebookPen },
        { name: 'Other', icon: Boxes },
    ];

    // Calculate category counts for display
    const categoryCounts = documentCategories.reduce((acc, cat) => {
        if (cat.name === 'All Documents') {
            acc[cat.name] = documents.length;
        } else {
            acc[cat.name] = documents.filter(doc => doc.category === cat.name).length;
        }
        return acc;
    }, {});

    // Filtered documents based on selectedCategory
    const filteredDocuments = selectedCategory
        ? documents.filter(doc => doc.category === selectedCategory)
        : documents;


    if (!isAuthReady) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100">
                <div className="text-xl font-semibold text-gray-700">Loading application...</div>
            </div>
        );
    }

    // --- Page Rendering Functions ---

    const renderDashboard = () => (
        <>
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div className="card flex flex-col justify-between cursor-pointer" onClick={() => handleNavigationClick('documents')}>
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-medium text-gray-500">Total Documents</h3>
                        <FileText className="text-indigo-500" size={24} />
                    </div>
                    <p className="text-3xl font-bold text-gray-900">{analyticsData?.total_documents || 0}</p>
                    <p className="text-sm text-green-500">+12% from last month</p>
                </div>
                {/* Digital Copy Section */}
                <div className="card flex flex-col justify-between cursor-pointer" onClick={() => handleNavigationClick('digital-copy')}>
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-medium text-gray-500">Digital Copy</h3>
                        <FileCheck className="text-blue-500" size={24} />
                    </div>
                    <p className="text-3xl font-bold text-gray-900">{analyticsData?.total_documents || 0}</p>
                    <p className="text-sm text-green-500">+0% from last month</p>
                </div>
                <div className="card flex flex-col justify-between cursor-pointer" onClick={() => handleNavigationClick('categories')}>
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-medium text-gray-500">Categories</h3>
                        <Folder className="text-orange-500" size={24} />
                    </div>
                    <p className="text-3xl font-bold text-gray-900">{Object.keys(analyticsData?.documents_by_category || {}).length}</p>
                    <p className="text-sm text-gray-500">N/A</p>
                </div>
                {/* Analytics Section */}
                <div className="card flex flex-col justify-between cursor-pointer" onClick={() => handleNavigationClick('analytics')}>
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-medium text-gray-500">Analytics</h3>
                        <BarChart className="text-teal-500" size={24} />
                    </div>
                    <p className="text-3xl font-bold text-gray-900">View Insights</p>
                    <p className="text-sm text-green-500">N/A</p>
                </div>
            </div>

            {/* Upload Medical Documents Section */}
            <div className="card mb-4" ref={uploadSectionRef}>
                <h2 className="text-xl font-semibold text-gray-800 mb-2">Upload Medical Documents</h2>
                <p className="text-sm text-gray-500 mb-4">AI will automatically categorize your documents</p>
                <div
                    className={`upload-area ${isDragging ? 'dragging' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <Upload className="mx-auto text-gray-400 mb-3" size={48} />
                    <p className="text-lg font-medium text-gray-700">Drop files here or click to upload</p>
                    <p className="text-sm text-gray-500 mb-4">Support for PDF, JPG, PNG, and TXT files up to 10MB</p>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        id="file-upload-input"
                    />
                    <button
                        onClick={() => fileInputRef.current.click()}
                        className="btn-secondary"
                    >
                        Choose Files
                    </button>
                    {selectedFile && (
                        <p className="text-sm text-gray-600 mt-2">Selected: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)</p>
                    )}
                    <button
                        onClick={handleUpload}
                        disabled={!selectedFile || uploading}
                        className={`btn-primary mt-4 ${(!selectedFile || uploading) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {uploading ? 'Uploading...' : 'Upload Selected Document'}
                    </button>
                </div>
            </div>

            {/* Recent Documents Section */}
            <div className="card">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-gray-800">Recent Documents</h2>
                    <a href="#" onClick={() => handleNavigationClick('documents')} className="text-indigo-600 hover:underline text-sm font-medium">View All</a>
                </div>
                {loadingDocs ? (
                    <p className="text-center text-gray-600">Loading documents...</p>
                ) : filteredDocuments.length === 0 ? (
                    <p className="text-center text-gray-600 py-8">No documents yet. Upload your first medical document to get started.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 rounded-lg overflow-hidden">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Document Name
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Category
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Type
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Size
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Uploaded On
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredDocuments.slice(0, 5).map((doc) => ( // Show only top 5 recent documents
                                    <tr key={doc.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            {doc.name}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {doc.category || 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {doc.type}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {doc.size ? `${Math.round(doc.size / 1024)} KB` : 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {doc.timestamp ? new Date(doc.timestamp).toLocaleString() : 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                            <button
                                                onClick={() => handleView(doc.id, 'original')}
                                                className="text-gray-600 hover:text-gray-900"
                                                title="View Original Document"
                                            >
                                                <Eye size={18} className="inline-block mr-1" />
                                                View Original
                                            </button>
                                            <button
                                                onClick={() => handleDownload(doc.id, 'original')}
                                                className="text-indigo-600 hover:text-indigo-900 ml-2"
                                                title="Download Original Document"
                                            >
                                                <Download size={18} className="inline-block mr-1" />
                                                Download Original
                                            </button>
                                            <button
                                                onClick={() => handleView(doc.id, 'digital_copy')}
                                                className="text-gray-600 hover:text-gray-900 ml-2"
                                                title="View Digital Copy"
                                                disabled={!doc.digital_copy_content}
                                            >
                                                <Eye size={18} className="inline-block mr-1" />
                                                View Digital
                                            </button>
                                            <button
                                                onClick={() => handleDownload(doc.id, 'digital_copy')}
                                                className="text-blue-600 hover:text-blue-900 ml-2"
                                                title="Download Digital Copy"
                                                disabled={!doc.digital_copy_content}
                                            >
                                                <FileCheck size={18} className="inline-block mr-1" />
                                                Download Digital
                                            </button>
                                            <button
                                                onClick={() => confirmDelete(doc)}
                                                className="text-red-600 hover:text-red-900 ml-2"
                                                title="Delete Document"
                                            >
                                                <Trash2 size={18} className="inline-block mr-1" />
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    );

    const renderDocumentsPage = () => (
        <div className="card flex-grow">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-800">
                    {selectedCategory ? `${selectedCategory} Documents` : 'All Documents'}
                </h2>
                <button onClick={() => handleNavigationClick('dashboard')} className="text-indigo-600 hover:underline text-sm font-medium">Back to Dashboard</button>
            </div>
            {loadingDocs ? (
                <p className="text-center text-gray-600">Loading documents...</p>
            ) : filteredDocuments.length === 0 ? (
                <p className="text-center text-gray-600 py-8">
                    {selectedCategory
                        ? `No documents found in the "${selectedCategory}" category.`
                        : 'No documents uploaded yet. Upload one from the dashboard!'}
                </p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 rounded-lg overflow-hidden">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Document Name
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Category
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Type
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Size
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Uploaded On
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredDocuments.map((doc) => (
                                <tr key={doc.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {doc.name}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {doc.category || 'N/A'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {doc.type}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {doc.size ? `${Math.round(doc.size / 1024)} KB` : 'N/A'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {doc.timestamp ? new Date(doc.timestamp).toLocaleString() : 'N/A'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                        <button
                                            onClick={() => handleView(doc.id, 'original')}
                                            className="text-gray-600 hover:text-gray-900"
                                            title="View Original Document"
                                        >
                                            <Eye size={18} className="inline-block mr-1" />
                                            View Original
                                        </button>
                                        <button
                                            onClick={() => handleDownload(doc.id, 'original')}
                                            className="text-indigo-600 hover:text-indigo-900 ml-2"
                                            title="Download Original Document"
                                            >
                                            <Download size={18} className="inline-block mr-1" />
                                            Download Original
                                        </button>
                                        <button
                                            onClick={() => handleView(doc.id, 'digital_copy')}
                                            className="text-gray-600 hover:text-gray-900 ml-2"
                                            title="View Digital Copy"
                                            disabled={!doc.digital_copy_content}
                                        >
                                            <Eye size={18} className="inline-block mr-1" />
                                            View Digital
                                        </button>
                                        <button
                                            onClick={() => handleDownload(doc.id, 'digital_copy')}
                                            className="text-blue-600 hover:text-blue-900 ml-2"
                                            title="Download Digital Copy"
                                            disabled={!doc.digital_copy_content}
                                        >
                                            <FileCheck size={18} className="inline-block mr-1" />
                                            Download Digital
                                        </button>
                                        <button
                                            onClick={() => confirmDelete(doc)}
                                            className="text-red-600 hover:text-red-900 ml-2"
                                            title="Delete Document"
                                        >
                                            <Trash2 size={18} className="inline-block mr-1" />
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );

    const renderCategoriesPage = () => (
        <div className="card flex-grow">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-800">Document Categories</h2>
                <button onClick={() => handleNavigationClick('dashboard')} className="text-indigo-600 hover:underline text-sm font-medium">Back to Dashboard</button>
            </div>
            <p className="text-sm text-gray-500 mb-4">AI-organized sections</p>
            <div className="space-y-2">
                {documentCategories.map((category, index) => (
                    <button
                        key={index}
                        onClick={() => handleCategoryClick(category.name)} // This now also sets the filter
                        className={`category-item w-full flex justify-between items-center border border-gray-200 rounded-lg text-left ${selectedCategory === category.name || (selectedCategory === null && category.name === 'All Documents') ? 'bg-indigo-50 border-indigo-200' : ''}`}
                    >
                        <div className="flex items-center">
                            <div className="p-2 bg-gray-100 rounded-md mr-3">
                                <category.icon size={20} className="text-gray-600" />
                            </div>
                            <span className="font-medium text-gray-700">{category.name}</span>
                        </div>
                        <div className="flex items-center text-gray-500 text-sm">
                            <span>{categoryCounts[category.name] || 0} documents</span>
                            <ChevronRight size={18} className="ml-2" />
                        </div>
                    </button>
                ))}
            </div>
            <button
                onClick={handleAddCustomCategory}
                className="btn-secondary w-full mt-4 flex items-center justify-center"
            >
                <PlusCircle size={20} className="mr-2" /> Add Custom Category
            </button>
        </div>
    );

    const renderDigitalCopyPage = () => (
        <div className="card flex-grow">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-800">Digital Copies</h2>
                <button onClick={() => handleNavigationClick('dashboard')} className="text-indigo-600 hover:underline text-sm font-medium">Back to Dashboard</button>
            </div>
            <p className="text-sm text-gray-500 mb-4">All your uploaded digital documents with processed text.</p>
            {loadingDocs ? (
                <p className="text-center text-gray-600">Loading digital copies...</p>
            ) : filteredDocuments.length === 0 ? (
                <p className="text-center text-gray-600 py-8">No digital copies uploaded yet. Upload one from the dashboard!</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 rounded-lg overflow-hidden">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Document Name
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Category
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Uploaded On
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredDocuments.map((doc) => (
                                <tr key={doc.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {doc.name}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {doc.category || 'N/A'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {doc.timestamp ? new Date(doc.timestamp).toLocaleString() : 'N/A'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                        <button
                                            onClick={() => handleView(doc.id, 'digital_copy')}
                                            className="text-gray-600 hover:text-gray-900"
                                            title="View Digital Copy"
                                            disabled={!doc.digital_copy_content}
                                        >
                                            <Eye size={18} className="inline-block mr-1" />
                                            View Digital
                                        </button>
                                        <button
                                            onClick={() => handleDownload(doc.id, 'digital_copy')}
                                            className="text-blue-600 hover:text-blue-900 ml-2"
                                            title="Download Digital Copy"
                                            disabled={!doc.digital_copy_content}
                                        >
                                            <FileCheck size={18} className="inline-block mr-1" />
                                            Download Digital
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );

    const renderAnalyticsPage = () => (
        <div className="card flex-grow">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-800">Analytics Report</h2>
                <button onClick={() => handleNavigationClick('dashboard')} className="text-indigo-600 hover:underline text-sm font-medium">Back to Dashboard</button>
            </div>
            {analyticsData ? (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-4 bg-gray-50 rounded-lg shadow-sm">
                            <h3 className="text-lg font-semibold text-gray-700">Total Documents</h3>
                            <p className="text-3xl font-bold text-gray-900">{analyticsData.total_documents}</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-lg shadow-sm">
                            <h3 className="text-lg font-semibold text-gray-700">Total Storage Used</h3>
                            <p className="text-3xl font-bold text-gray-900">{analyticsData.total_size_kb} KB</p>
                        </div>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-2">Documents by Category</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {Object.entries(analyticsData.documents_by_category).map(([categoryName, count]) => (
                            <div key={categoryName} className="p-3 bg-blue-50 rounded-lg flex items-center justify-between">
                                <span className="font-medium text-blue-800">{categoryName}</span>
                                <span className="text-blue-700 font-bold">{count}</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-sm text-gray-500 mt-4">Last Updated: {new Date(analyticsData.last_updated).toLocaleString()}</p>
                </div>
            ) : (
                <p className="text-center text-gray-600 py-8">Loading analytics data or no data available.</p>
            )}
        </div>
    );


    // Render content based on currentPage
    const renderContent = () => {
        switch (currentPage) {
            case 'dashboard':
                return renderDashboard();
            case 'documents':
                return renderDocumentsPage();
            case 'categories':
                return renderCategoriesPage();
            case 'digital-copy':
                return renderDigitalCopyPage();
            case 'analytics':
                return renderAnalyticsPage();
            case 'upload':
                return renderDashboard(); // Stays on dashboard, scrolls to upload section
            case 'search':
                return renderDashboard(); // Stays on dashboard, focuses search bar
            case 'settings':
                return (
                    <div className="card flex-grow flex items-center justify-center flex-col">
                        <p className="text-xl text-gray-600">Settings Page (Under Construction)</p>
                        <button onClick={() => handleNavigationClick('dashboard')} className="mt-4 btn-secondary">Back to Dashboard</button>
                    </div>
                );
            default:
                return renderDashboard();
        }
    };

    return (
        <div className="flex min-h-screen bg-gray-100 font-sans antialiased text-gray-800">
            <style>
                {`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
                body {
                    font-family: 'Inter', sans-serif;
                }
                .sidebar {
                    width: 250px;
                    min-width: 250px;
                    background-color: #ffffff;
                    box-shadow: 2px 0 5px rgba(0,0,0,0.05);
                    display: flex;
                    flex-direction: column;
                    padding: 1.5rem 1rem;
                    border-radius: 0.75rem;
                    margin: 1rem;
                }
                .main-content {
                    flex-grow: 1;
                    padding: 1rem;
                    display: flex;
                    flex-direction: column;
                }
                .header {
                    background-color: #ffffff;
                    padding: 1rem 2rem;
                    border-radius: 0.75rem;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.05);
                    margin-bottom: 1rem;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .card {
                    background-color: #ffffff;
                    border-radius: 0.75rem;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.05);
                    padding: 1.5rem;
                }
                .btn-primary {
                    background-color: #4F46E5; /* Indigo 600 */
                    color: white;
                    padding: 0.75rem 1.5rem;
                    border-radius: 0.5rem;
                    font-weight: 600;
                    transition: background-color 0.2s ease-in-out;
                }
                .btn-primary:hover {
                    background-color: #4338CA; /* Indigo 700 */
                }
                .btn-danger {
                    background-color: #EF4444; /* Red 500 */
                    color: white;
                    padding: 0.5rem 1rem;
                    border-radius: 0.375rem;
                    font-weight: 500;
                    transition: background-color 0.2s ease-in-out;
                }
                .btn-danger:hover {
                    background-color: #DC2626; /* Red 600 */
                }
                .btn-secondary {
                    background-color: #E5E7EB; /* Gray 200 */
                    color: #374151; /* Gray 700 */
                    padding: 0.5rem 1rem;
                    border-radius: 0.375rem;
                    font-weight: 500;
                    transition: background-color 0.2s ease-in-out;
                }
                .btn-secondary:hover {
                    background-color: #D1D5DB; /* Gray 300 */
                }
                .upload-area {
                    border: 2px dashed #D1D5DB;
                    border-radius: 0.75rem;
                    padding: 2rem;
                    text-align: center;
                    transition: border-color 0.2s ease-in-out, background-color 0.2s ease-in-out;
                }
                .upload-area.dragging {
                    border-color: #4F46E5;
                    background-color: #EEF2FF; /* Indigo 50 */
                }
                .category-item {
                    display: flex;
                    align-items: center;
                    padding: 0.75rem 1rem;
                    border-radius: 0.5rem;
                    transition: background-color 0.2s ease-in-out;
                }
                .category-item:hover {
                    background-color: #F3F4F6; /* Gray 100 */
                }
                .category-item svg {
                    margin-right: 0.75rem;
                }
                @media (max-width: 768px) {
                    .sidebar {
                        width: 100%;
                        min-width: unset;
                        margin: 0;
                        border-radius: 0;
                        padding: 1rem;
                        box-shadow: none;
                        position: fixed;
                        top: 0;
                        left: 0;
                        height: 100%;
                        z-index: 1000;
                        transform: translateX(-100%); /* Always hidden on mobile */
                    }
                    /* No .sidebar.open needed as it's not toggled */
                    .main-content {
                        padding: 0.5rem;
                        width: 100%;
                        margin-left: 0;
                    }
                    .header {
                        flex-direction: column;
                        align-items: flex-start;
                        padding: 1rem;
                    }
                    .header .search-bar {
                        width: 100%;
                        margin-top: 1rem;
                    }
                    .header .icons {
                        margin-top: 1rem;
                        width: 100%;
                        justify-content: flex-end;
                    }
                    .stats-grid {
                        grid-template-columns: 1fr;
                    }
                    .dashboard-layout {
                        flex-direction: column;
                    }
                    .dashboard-layout > div {
                        width: 100%;
                        margin-left: 0 !important;
                        margin-top: 1rem;
                    }
                }
                `}
            </style>

            {/* Sidebar */}
            <aside className={`sidebar md:flex`}>
                <div className="flex items-center mb-10">
                    <img src="https://placehold.co/40x40/4F46E5/ffffff?text=AI" alt="MedDocs AI Logo" className="mr-3 rounded-md" />
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">MedDocs AI</h2>
                        <p className="text-sm text-gray-500">Document Storage</p>
                    </div>
                </div>
                <nav className="flex-grow">
                    <ul>
                        <li className="mb-2">
                            <a
                                href="#"
                                onClick={() => handleNavigationClick('dashboard')}
                                className={`flex items-center p-3 rounded-lg font-medium ${currentPage === 'dashboard' ? 'text-indigo-600 bg-indigo-50' : 'text-gray-700 hover:bg-gray-100'}`}
                            >
                                <LayoutDashboard className="mr-3" size={20} /> Dashboard
                            </a>
                        </li>
                        <li className="mb-2">
                            <a
                                href="#"
                                onClick={() => handleNavigationClick('upload')}
                                className={`flex items-center p-3 rounded-lg font-medium ${currentPage === 'upload' ? 'text-indigo-600 bg-indigo-50' : 'text-gray-700 hover:bg-gray-100'}`}
                            >
                                <Upload className="mr-3" size={20} /> Upload Documents
                            </a>
                        </li>
                        <li className="mb-2">
                            <a
                                href="#"
                                onClick={() => handleNavigationClick('categories')}
                                className={`flex items-center p-3 rounded-lg font-medium ${currentPage === 'categories' ? 'text-indigo-600 bg-indigo-50' : 'text-gray-700 hover:bg-gray-100'}`}
                            >
                                <Folder className="mr-3" size={20} /> Categories
                            </a>
                        </li>
                        <li className="mb-2">
                            <a
                                href="#"
                                onClick={() => handleNavigationClick('digital-copy')}
                                className={`flex items-center p-3 rounded-lg font-medium ${currentPage === 'digital-copy' ? 'text-indigo-600 bg-indigo-50' : 'text-gray-700 hover:bg-gray-100'}`}
                            >
                                <FileCheck className="mr-3" size={20} /> Digital Copy
                            </a>
                        </li>
                        <li className="mb-2">
                            <a
                                href="#"
                                onClick={() => handleNavigationClick('analytics')}
                                className={`flex items-center p-3 rounded-lg font-medium ${currentPage === 'analytics' ? 'text-indigo-600 bg-indigo-50' : 'text-gray-700 hover:bg-gray-100'}`}
                            >
                                <BarChart className="mr-3" size={20} /> Analytics
                            </a>
                        </li>
                        <li className="mb-2">
                            <a
                                href="#"
                                onClick={() => handleNavigationClick('search')}
                                className={`flex items-center p-3 rounded-lg font-medium ${currentPage === 'search' ? 'text-indigo-600 bg-indigo-50' : 'text-gray-700 hover:bg-gray-100'}`}
                            >
                                <Search className="mr-3" size={20} /> Search Documents
                            </a>
                        </li>
                        <li className="mb-2">
                            <a
                                href="#"
                                onClick={() => handleNavigationClick('settings')}
                                className={`flex items-center p-3 rounded-lg font-medium ${currentPage === 'settings' ? 'text-indigo-600 bg-indigo-50' : 'text-gray-700 hover:bg-gray-100'}`}
                            >
                                <Settings className="mr-3" size={20} /> Settings
                            </a>
                        </li>
                    </ul>
                </nav>
                {userId && (
                    <div className="mt-auto text-xs text-gray-500 p-3 bg-gray-50 rounded-lg break-all">
                        User ID: <span className="font-mono text-gray-700">{userId}</span>
                    </div>
                )}
            </aside>

            {/* Main Content Area */}
            <div className={`main-content`}>
                {/* Header */}
                <header className="header">
                    <div className="flex items-center">
                        {/* Removed sidebar toggle button */}
                        <div className="flex flex-col">
                            <h1 className="text-2xl font-bold text-gray-900">Medical Document Dashboard</h1>
                            <p className="text-sm text-gray-500">AI-powered document organization and storage</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-4">
                        <div className="relative w-64 hidden sm:block">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                placeholder="Search documents..."
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                ref={searchBarRef}
                            />
                        </div>
                        <Bell className="text-gray-500 cursor-pointer hover:text-gray-700" size={24} />
                        <User className="text-gray-500 cursor-pointer hover:text-gray-700" size={24} />
                    </div>
                </header>

                {error && (
                    <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-md mb-4">
                        {error}
                        <button onClick={() => setError(null)} className="float-right text-red-700 hover:text-red-900">
                            <X size={18} />
                        </button>
                    </div>
                )}

                {/* Render content based on currentPage */}
                {renderContent()}
            </div>

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg p-6 shadow-xl max-w-sm w-full">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Confirm Deletion</h3>
                        <p className="text-gray-700 mb-6">
                            Are you sure you want to delete "<span className="font-medium">{docToDelete?.name}</span>"? This action cannot be undone.
                        </p>
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="btn-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                className="btn-danger"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Viewer Modal */}
            <ViewerModal
                show={showViewerModal}
                onClose={() => {
                    setShowViewerModal(false);
                    setViewerContent(''); // Clear content on close
                    setViewerContentType('');
                    if (viewerContent.startsWith('blob:')) {
                        URL.revokeObjectURL(viewerContent); // Clean up object URL if it was a blob
                    }
                }}
                content={viewerContent}
                contentType={viewerContentType}
                title={viewerTitle}
            />
        </div>
    );
}

export default App;

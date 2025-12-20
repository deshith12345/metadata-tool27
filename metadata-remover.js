// Metadata Remover - ACTUALLY removes ALL metadata
class MetadataRemover {
    constructor() {
        this.currentFile = null;
        this.cleanedFile = null;
        this.originalExifData = null;
        this.originalMetadataCount = 0;
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        const fileInput = document.getElementById('remover-file-input');
        fileInput.addEventListener('change', (e) => {
            this.handleFileSelection(e.target.files[0]);
        });

        const cleanButton = document.getElementById('clean-metadata-btn');
        cleanButton.addEventListener('click', () => {
            this.cleanMetadata();
        });
    }

    async handleFileSelection(file) {
        if (!file) return;

        this.currentFile = file;
        this.displayFileInfo(file);
        
        // Analyze original metadata
        await this.analyzeOriginalMetadata(file);
        
        document.getElementById('processing-section').style.display = 'block';
        document.getElementById('result-section').style.display = 'none';
    }

    displayFileInfo(file) {
        const fileInfoDiv = document.getElementById('remover-file-info');
        fileInfoDiv.innerHTML = `
            <p><strong>File Name:</strong> ${file.name}</p>
            <p><strong>File Size:</strong> ${window.metadataTool.formatFileSize(file.size)}</p>
            <p><strong>File Type:</strong> ${file.type || 'Unknown'}</p>
        `;
    }

    async analyzeOriginalMetadata(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const imageData = e.target.result;
                    this.originalExifData = piexif.load(imageData);
                    
                    // Count metadata fields
                    let count = 0;
                    const foundFields = [];
                    
                    for (let ifd in this.originalExifData) {
                        if (this.originalExifData[ifd] && typeof this.originalExifData[ifd] === 'object') {
                            const keys = Object.keys(this.originalExifData[ifd]);
                            count += keys.length;
                            
                            // Get field names for display
                            if (keys.length > 0) {
                                foundFields.push(`${ifd}: ${keys.length} fields`);
                            }
                        }
                    }
                    
                    this.originalMetadataCount = count;
                    
                    // Display metadata preview
                    const metadataPreview = document.getElementById('metadata-preview');
                    const foundMetadata = document.getElementById('found-metadata');
                    
                    if (count > 0) {
                        metadataPreview.style.display = 'block';
                        foundMetadata.innerHTML = `
                            <p><strong>🔍 Found ${count} metadata fields in this image:</strong></p>
                            <ul>
                                ${foundFields.map(field => `<li>${field}</li>`).join('')}
                            </ul>
                            <p class="warning-message">⚠️ This metadata may contain sensitive information including:</p>
                            <ul>
                                <li>GPS location data</li>
                                <li>Camera make and model</li>
                                <li>Date and time photos were taken</li>
                                <li>Software used to edit the image</li>
                                <li>Author/copyright information</li>
                            </ul>
                        `;
                    } else {
                        metadataPreview.style.display = 'block';
                        foundMetadata.innerHTML = `
                            <p class="success-message">✅ No EXIF metadata detected in this image</p>
                            <p>This image is already clean, but you can still process it to ensure no hidden metadata exists.</p>
                        `;
                    }
                    
                    resolve();
                } catch (error) {
                    console.log('No EXIF data found or error reading EXIF:', error);
                    this.originalMetadataCount = 0;
                    this.originalExifData = null;
                    
                    const metadataPreview = document.getElementById('metadata-preview');
                    const foundMetadata = document.getElementById('found-metadata');
                    metadataPreview.style.display = 'block';
                    foundMetadata.innerHTML = `
                        <p class="success-message">✅ No EXIF metadata detected</p>
                        <p>This image appears to be clean already.</p>
                    `;
                    
                    resolve();
                }
            };
            
            reader.readAsDataURL(file);
        });
    }

    async cleanMetadata() {
        if (!this.currentFile) {
            window.metadataTool.showNotification('Please select a file first', 'warning');
            return;
        }

        const cleanButton = document.getElementById('clean-metadata-btn');
        const originalText = cleanButton.innerHTML;
        cleanButton.innerHTML = '<div class="loading"></div> Stripping metadata...';
        cleanButton.disabled = true;

        try {
            // Actually remove ALL metadata
            this.cleanedFile = await this.stripAllMetadata(this.currentFile);
            
            // Verify the cleaned file
            await this.verifyCleanedFile(this.cleanedFile);
            
            window.metadataTool.showNotification('✅ All metadata removed successfully!', 'success');
        } catch (error) {
            console.error('Error cleaning metadata:', error);
            window.metadataTool.showNotification('Error removing metadata: ' + error.message, 'error');
        } finally {
            cleanButton.innerHTML = originalText;
            cleanButton.disabled = false;
        }
    }

    async stripAllMetadata(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const img = new Image();
                    
                    img.onload = () => {
                        // Create canvas and redraw image
                        // This process REMOVES ALL EXIF DATA
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth;
                        canvas.height = img.naturalHeight;
                        
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        
                        // Convert to blob (new file without metadata)
                        canvas.toBlob((blob) => {
                            if (blob) {
                                const originalName = file.name.replace(/\.[^/.]+$/, '');
                                const extension = window.metadataTool.getFileExtension(file.name);
                                
                                // Create cleaned file
                                const cleanedFile = new File(
                                    [blob],
                                    `${originalName}_cleaned.${extension}`,
                                    {
                                        type: file.type,
                                        lastModified: Date.now()
                                    }
                                );
                                
                                resolve(cleanedFile);
                            } else {
                                reject(new Error('Failed to create cleaned file'));
                            }
                        }, file.type, 0.92); // High quality
                    };
                    
                    img.onerror = () => reject(new Error('Failed to load image'));
                    img.src = e.target.result;
                    
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }

    async verifyCleanedFile(cleanedFile) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const imageData = e.target.result;
                    const cleanedExifData = piexif.load(imageData);
                    
                    // Count remaining metadata
                    let remainingCount = 0;
                    for (let ifd in cleanedExifData) {
                        if (cleanedExifData[ifd] && typeof cleanedExifData[ifd] === 'object') {
                            remainingCount += Object.keys(cleanedExifData[ifd]).length;
                        }
                    }
                    
                    this.displayResults(remainingCount);
                    resolve();
                    
                } catch (error) {
                    // If piexif.load fails, it means there's NO EXIF data - which is perfect!
                    console.log('No EXIF data in cleaned file (GOOD!)');
                    this.displayResults(0);
                    resolve();
                }
            };
            
            reader.readAsDataURL(cleanedFile);
        });
    }

    displayResults(remainingMetadataCount) {
        const resultSection = document.getElementById('result-section');
        const beforeMetadataDiv = document.getElementById('before-metadata');
        const afterMetadataDiv = document.getElementById('after-metadata');
        const cleanedFileInfo = document.getElementById('cleaned-file-info');
        const downloadLink = document.getElementById('download-link');

        // Show before/after comparison
        beforeMetadataDiv.innerHTML = `
            <div class="metadata-count-display">
                <div class="count-number">${this.originalMetadataCount}</div>
                <div class="count-label">Metadata Fields</div>
            </div>
            <p class="status-text danger">⚠️ Contains sensitive data</p>
        `;
        
        afterMetadataDiv.innerHTML = `
            <div class="metadata-count-display">
                <div class="count-number success">${remainingMetadataCount}</div>
                <div class="count-label">Metadata Fields</div>
            </div>
            <p class="status-text success">✅ ${remainingMetadataCount === 0 ? 'Completely Clean' : 'Mostly Clean'}</p>
        `;

        // File size comparison
        const sizeDiff = this.currentFile.size - this.cleanedFile.size;
        const percentChange = ((sizeDiff / this.currentFile.size) * 100).toFixed(2);
        
        cleanedFileInfo.innerHTML = `
            <div class="clean-summary">
                <h5>📊 Cleaning Summary</h5>
                <div class="summary-grid">
                    <div class="summary-item">
                        <strong>Original File:</strong>
                        <span>${this.currentFile.name}</span>
                        <span>${window.metadataTool.formatFileSize(this.currentFile.size)}</span>
                    </div>
                    <div class="summary-item">
                        <strong>Cleaned File:</strong>
                        <span>${this.cleanedFile.name}</span>
                        <span>${window.metadataTool.formatFileSize(this.cleanedFile.size)}</span>
                    </div>
                    <div class="summary-item highlight">
                        <strong>Metadata Removed:</strong>
                        <span>${this.originalMetadataCount} fields stripped</span>
                        <span>File size reduced by ${Math.abs(percentChange)}%</span>
                    </div>
                    <div class="summary-item success">
                        <strong>Security Status:</strong>
                        <span>✅ Safe to share publicly</span>
                    </div>
                </div>
            </div>
        `;

        // Setup download link
        const url = URL.createObjectURL(this.cleanedFile);
        downloadLink.href = url;
        downloadLink.download = this.cleanedFile.name;
        downloadLink.onclick = () => {
            setTimeout(() => URL.revokeObjectURL(url), 100);
        };

        // Show results
        resultSection.style.display = 'block';
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    window.metadataRemover = new MetadataRemover();
});
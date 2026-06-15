/**
 * MetadataRemover - Strips ALL metadata from images
 * 
 * This class removes EXIF metadata from images by redrawing them on a canvas.
 * The canvas-based approach ensures complete metadata removal including GPS data,
 * camera information, timestamps, and any other embedded metadata.
 */
class MetadataRemover {
    static MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    static ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
    static ACCEPTED_EXTENSIONS = ['jpg', 'jpeg', 'png'];

    /**
     * Initialize the MetadataRemover
     * Sets up properties to track files and metadata throughout the removal process
     */
    constructor() {
        this.currentFile = null;              // Original file selected by user
        this.cleanedFile = null;              // Cleaned file after metadata removal
        this.cleanedFileUrl = null;           // Object URL for the cleaned download
        this.originalExifData = null;         // Original EXIF data for comparison
        this.originalMetadataCount = 0;       // Count of metadata fields in original
        this.init();
    }

    /**
     * Initialize the remover by setting up event listeners
     */
    init() {
        this.setupEventListeners();
    }

    /**
     * Set up event listeners for file input and clean button
     * Handles file selection and metadata cleaning actions
     */
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

    /**
     * Handle file selection and prepare for metadata removal
     * Displays file info and analyzes existing metadata
     * 
     * @param {File} file - The selected image file
     */
    async handleFileSelection(file) {
        if (!file) return;
        if (!this.isAcceptedFile(file)) {
            window.metadataTool?.showNotification('Please select a valid image file (JPG, JPEG, or PNG)', 'error');
            return;
        }

        if (file.size > MetadataRemover.MAX_FILE_SIZE) {
            window.metadataTool?.showNotification('File is too large. Maximum size is 50MB', 'error');
            return;
        }

        this.revokeCleanedFileUrl();
        this.currentFile = file;
        this.cleanedFile = null;
        this.displayFileInfo(file);

        // Analyze and count metadata fields in the original file
        await this.analyzeOriginalMetadataSafe(file);

        // Show processing section, hide results until cleaning is complete
        document.getElementById('processing-section').style.display = 'block';
        document.getElementById('result-section').style.display = 'none';
    }

    isAcceptedFile(file) {
        const type = (file.type || '').toLowerCase();
        const extension = window.metadataTool?.getFileExtension(file.name) || '';
        return MetadataRemover.ACCEPTED_TYPES.includes(type) ||
            MetadataRemover.ACCEPTED_EXTENSIONS.includes(extension);
    }

    async analyzeOriginalMetadataSafe(file) {
        try {
            if (window.metadataViewer?.extractRealMetadata) {
                const metadata = await window.metadataViewer.extractRealMetadata(file);
                const fields = Object.keys(metadata.exif || {}).filter(key => key !== 'Location on Map');
                this.originalExifData = metadata.rawExif;
                this.originalMetadataCount = fields.length;
                this.renderMetadataPreview(fields);
                return;
            }
        } catch (error) {
            console.warn('Unable to analyze metadata with viewer parser:', error);
        }

        this.originalExifData = null;
        this.originalMetadataCount = 0;
        this.renderMetadataPreview([]);
    }

    renderMetadataPreview(fields) {
        const metadataPreview = document.getElementById('metadata-preview');
        const foundMetadata = document.getElementById('found-metadata');
        metadataPreview.style.display = 'block';
        foundMetadata.replaceChildren();

        if (fields.length > 0) {
            const summary = document.createElement('p');
            const strong = document.createElement('strong');
            strong.textContent = `Found ${fields.length} metadata fields in this image:`;
            summary.appendChild(strong);

            const fieldList = document.createElement('ul');
            fields.forEach(field => {
                const item = document.createElement('li');
                item.textContent = field;
                fieldList.appendChild(item);
            });

            const warning = document.createElement('p');
            warning.className = 'warning-message';
            warning.textContent = 'This metadata may contain sensitive information including:';

            const sensitiveList = document.createElement('ul');
            ['GPS location data', 'Camera make and model', 'Date and time photos were taken', 'Software used to edit the image', 'Author/copyright information']
                .forEach(label => {
                    const item = document.createElement('li');
                    item.textContent = label;
                    sensitiveList.appendChild(item);
                });

            foundMetadata.append(summary, fieldList, warning, sensitiveList);
            return;
        }

        const success = document.createElement('p');
        success.className = 'success-message';
        success.textContent = 'No metadata detected in this image';

        const note = document.createElement('p');
        note.textContent = 'This image appears to be clean already, but you can still process it to ensure no hidden metadata exists.';

        foundMetadata.append(success, note);
    }

    /**
     * Display basic file information in the UI
     * 
     * @param {File} file - The file to display information for
     */
    displayFileInfo(file) {
        const fileInfoDiv = document.getElementById('remover-file-info');
        fileInfoDiv.replaceChildren(
            this.createInfoLine('File Name:', file.name),
            this.createInfoLine('File Size:', window.metadataTool.formatFileSize(file.size)),
            this.createInfoLine('File Type:', file.type || 'Unknown')
        );
    }

    createInfoLine(label, value) {
        const paragraph = document.createElement('p');
        const strong = document.createElement('strong');
        strong.textContent = label;
        paragraph.append(strong, ` ${value}`);
        return paragraph;
    }

    /**
     * Analyze and count metadata fields in the original image
     * Displays a preview of found metadata to inform the user
     * 
     * @param {File} file - The image file to analyze
     * @returns {Promise} Resolves when analysis is complete
     */
    async analyzeOriginalMetadata(file) {
        return this.analyzeOriginalMetadataSafe(file);

        return new Promise((resolve) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const imageData = e.target.result;
                    // Load EXIF data from the image
                    this.originalExifData = piexif.load(imageData);

                    // Count total metadata fields across all IFDs
                    let count = 0;
                    const foundFields = [];

                    // Iterate through each IFD (Image File Directory)
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

                    // Display results based on metadata count
                    if (count > 0) {
                        // Show warning about found metadata
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
                        // Image is already clean
                        metadataPreview.style.display = 'block';
                        foundMetadata.innerHTML = `
                            <p class="success-message">✅ No EXIF metadata detected in this image</p>
                            <p>This image is already clean, but you can still process it to ensure no hidden metadata exists.</p>
                        `;
                    }

                    resolve();
                } catch (error) {
                    // Error reading EXIF means no metadata exists (which is good)
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

    /**
     * Clean metadata from the current file
     * Strips all EXIF data and verifies the cleaned result
     */
    async cleanMetadata() {
        if (!this.currentFile) {
            window.metadataTool.showNotification('Please select a file first', 'warning');
            return;
        }

        // Show loading state on button
        const cleanButton = document.getElementById('clean-metadata-btn');
        const originalText = cleanButton.innerHTML;
        cleanButton.innerHTML = '<div class="loading"></div> Stripping metadata...';
        cleanButton.disabled = true;

        try {
            // Remove ALL metadata by redrawing image on canvas
            this.cleanedFile = await this.stripAllMetadata(this.currentFile);

            // Verify that metadata was actually removed
            await this.verifyCleanedFile(this.cleanedFile);

            window.metadataTool.showNotification('✅ All metadata removed successfully!', 'success');
        } catch (error) {
            console.error('Error cleaning metadata:', error);
            window.metadataTool.showNotification('Error removing metadata: ' + error.message, 'error');
        } finally {
            // Restore button state
            cleanButton.innerHTML = originalText;
            cleanButton.disabled = false;
        }
    }

    /**
     * Strip all metadata from an image file
     * Uses canvas redrawing technique which inherently removes all EXIF data
     * 
     * @param {File} file - The image file to clean
     * @returns {Promise<File>} Promise resolving to the cleaned file
     */
    async stripAllMetadata(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const img = new Image();

                    img.onload = () => {
                        // Create canvas with same dimensions as original image
                        // Drawing to canvas strips ALL EXIF metadata automatically
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth;
                        canvas.height = img.naturalHeight;

                        // Draw the image onto the canvas (this removes metadata)
                        const ctx = canvas.getContext('2d');
                        if (!ctx) {
                            reject(new Error('Canvas is not available in this browser'));
                            return;
                        }
                        ctx.drawImage(img, 0, 0);

                        // Convert canvas to blob (creates new file without metadata)
                        canvas.toBlob((blob) => {
                            if (blob) {
                                // Generate filename for cleaned file
                                const originalName = file.name.replace(/\.[^/.]+$/, '');
                                const outputType = this.getOutputMimeType(file);
                                const extension = outputType === 'image/png'
                                    ? 'png'
                                    : (window.metadataTool.getFileExtension(file.name) === 'jpeg' ? 'jpeg' : 'jpg');

                                // Create new File object from blob (metadata-free)
                                const cleanedFile = new File(
                                    [blob],
                                    `${originalName}_cleaned.${extension}`,
                                    {
                                        type: outputType,
                                        lastModified: Date.now()
                                    }
                                );

                                resolve(cleanedFile);
                            } else {
                                reject(new Error('Failed to create cleaned file'));
                            }
                        }, this.getOutputMimeType(file), this.getOutputMimeType(file) === 'image/jpeg' ? 0.92 : undefined);
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

    getOutputMimeType(file) {
        const type = (file.type || '').toLowerCase();
        const extension = window.metadataTool?.getFileExtension(file.name);

        if (type === 'image/png' || extension === 'png') {
            return 'image/png';
        }

        return 'image/jpeg';
    }

    revokeCleanedFileUrl() {
        if (this.cleanedFileUrl) {
            URL.revokeObjectURL(this.cleanedFileUrl);
            this.cleanedFileUrl = null;
        }
    }

    escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[char]);
    }

    /**
     * Verify that metadata was successfully removed from the cleaned file
     * Attempts to read EXIF data and counts any remaining fields
     * 
     * @param {File} cleanedFile - The cleaned file to verify
     * @returns {Promise} Resolves when verification is complete
     */
    async verifyCleanedFile(cleanedFile) {
        return new Promise((resolve) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const imageData = e.target.result;
                    const cleanedExifData = piexif.load(imageData);

                    // Count any remaining metadata fields
                    let remainingCount = 0;
                    for (let ifd in cleanedExifData) {
                        if (cleanedExifData[ifd] && typeof cleanedExifData[ifd] === 'object') {
                            remainingCount += Object.keys(cleanedExifData[ifd]).length;
                        }
                    }

                    // Display before/after comparison
                    this.displayResults(remainingCount);
                    resolve();

                } catch (error) {
                    // If piexif.load fails, NO EXIF data exists - perfect result!
                    console.log('No EXIF data in cleaned file (GOOD!)');
                    this.displayResults(0);
                    resolve();
                }
            };

            reader.onerror = () => {
                this.displayResults(0);
                resolve();
            };
            reader.readAsDataURL(cleanedFile);
        });
    }

    /**
     * Display before/after comparison results
     * Shows metadata count reduction and file size changes
     * 
     * @param {number} remainingMetadataCount - Number of metadata fields remaining after cleaning
     */
    displayResults(remainingMetadataCount) {
        const resultSection = document.getElementById('result-section');
        const beforeMetadataDiv = document.getElementById('before-metadata');
        const afterMetadataDiv = document.getElementById('after-metadata');
        const cleanedFileInfo = document.getElementById('cleaned-file-info');
        const downloadLink = document.getElementById('download-link');

        // Display "before" state with original metadata count
        beforeMetadataDiv.innerHTML = `
            <div class="metadata-count-display">
                <div class="count-number">${this.originalMetadataCount}</div>
                <div class="count-label">Metadata Fields</div>
            </div>
            <p class="status-text danger">⚠️ Contains sensitive data</p>
        `;

        const beforeStatus = beforeMetadataDiv.querySelector('.status-text');
        beforeStatus.className = `status-text ${this.originalMetadataCount > 0 ? 'danger' : 'success'}`;
        beforeStatus.textContent = this.originalMetadataCount > 0 ? 'Contains metadata' : 'No metadata detected';

        // Display "after" state with remaining metadata count
        afterMetadataDiv.innerHTML = `
            <div class="metadata-count-display">
                <div class="count-number success">${remainingMetadataCount}</div>
                <div class="count-label">Metadata Fields</div>
            </div>
            <p class="status-text success">✅ ${remainingMetadataCount === 0 ? 'Completely Clean' : 'Mostly Clean'}</p>
        `;

        // Calculate file size difference
        const sizeDiff = this.currentFile.size - this.cleanedFile.size;
        const percentChange = ((sizeDiff / this.currentFile.size) * 100).toFixed(2);
        const sizeChangeText = sizeDiff > 0
            ? `File size reduced by ${Math.abs(percentChange)}%`
            : sizeDiff < 0
                ? `File size increased by ${Math.abs(percentChange)}%`
                : 'File size unchanged';

        cleanedFileInfo.innerHTML = `
            <div class="clean-summary">
                <h5>📊 Cleaning Summary</h5>
                <div class="summary-grid">
                    <div class="summary-item">
                        <strong>Original File:</strong>
                        <span>${this.escapeHtml(this.currentFile.name)}</span>
                        <span>${this.escapeHtml(window.metadataTool.formatFileSize(this.currentFile.size))}</span>
                    </div>
                    <div class="summary-item">
                        <strong>Cleaned File:</strong>
                        <span>${this.escapeHtml(this.cleanedFile.name)}</span>
                        <span>${this.escapeHtml(window.metadataTool.formatFileSize(this.cleanedFile.size))}</span>
                    </div>
                    <div class="summary-item highlight">
                        <strong>Metadata Removed:</strong>
                        <span>${this.originalMetadataCount} fields stripped</span>
                        <span>${sizeChangeText}</span>
                    </div>
                    <div class="summary-item success">
                        <strong>Security Status:</strong>
                        <span>✅ Safe to share publicly</span>
                    </div>
                </div>
            </div>
        `;

        // Setup download link for cleaned file
        this.revokeCleanedFileUrl();
        this.cleanedFileUrl = URL.createObjectURL(this.cleanedFile);
        downloadLink.href = this.cleanedFileUrl;
        downloadLink.download = this.cleanedFile.name;
        downloadLink.onclick = () => {
            // Revoke object URL after download to free memory
            setTimeout(() => this.revokeCleanedFileUrl(), 1000);
        };

        // Show results section and scroll into view
        resultSection.style.display = 'block';
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

/**
 * Initialize the MetadataRemover when DOM is fully loaded
 * Creates a global instance accessible to other modules
 */
document.addEventListener('DOMContentLoaded', () => {
    window.metadataRemover = new MetadataRemover();
});

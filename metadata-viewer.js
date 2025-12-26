/**
 * MetadataViewer - Extracts and displays EXIF metadata from image files
 * 
 * This class handles reading real EXIF data from images using the piexifjs library.
 * It displays comprehensive metadata including camera information, GPS coordinates,
 * date/time information, and other embedded data.
 */
class MetadataViewer {
    // Configuration constants
    static MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    static ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
    static DEBUG = false; // Set to true for debugging

    /**
     * Initialize the MetadataViewer
     * Sets up properties to track the current file and image being viewed
     */
    constructor() {
        this.currentFile = null;        // Currently selected file
        this.currentImage = null;       // Loaded image element
        this.currentImageUrl = null;    // Object URL for current image
        this.currentMetadata = null;    // Stored metadata for export
        this.init();
    }

    /**
     * Initialize the viewer by setting up event listeners
     */
    init() {
        this.setupEventListeners();
    }

    /**
     * Set up event listeners for file input and export button
     * Listens for file selection changes to trigger metadata extraction
     */
    setupEventListeners() {
        const fileInput = document.getElementById('viewer-file-input');
        fileInput.addEventListener('change', (e) => {
            this.handleFileSelection(e.target.files[0]);
        });

        // Export button event listener
        const exportBtn = document.getElementById('export-metadata-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportMetadataAsJSON();
            });
        }
    }

    /**
     * Handle file selection and initiate metadata extraction
     * 
     * @param {File} file - The selected image file
     */
    async handleFileSelection(file) {
        if (!file) return;

        // Validate file type
        if (!MetadataViewer.ACCEPTED_TYPES.includes(file.type.toLowerCase())) {
            window.metadataTool?.showNotification(
                'Please select a valid image file (JPG, JPEG, or PNG)',
                'error'
            );
            return;
        }

        // Validate file size
        if (file.size > MetadataViewer.MAX_FILE_SIZE) {
            window.metadataTool?.showNotification(
                'File is too large. Maximum size is 50MB',
                'error'
            );
            return;
        }

        // Revoke previous object URLs to prevent memory leaks
        if (this.currentImageUrl) {
            URL.revokeObjectURL(this.currentImageUrl);
        }

        this.currentFile = file;

        try {
            // Display basic file information and preview
            await this.displayFileInfo(file);
            // Extract EXIF metadata from the image
            const metadata = await this.extractRealMetadata(file);
            this.currentMetadata = metadata;
            // Display the extracted metadata in a table
            this.displayMetadata(metadata);
        } catch (error) {
            console.error('Error extracting metadata:', error);
            window.metadataTool?.showNotification('Error extracting metadata from file', 'error');
        }
    }

    /**
     * Display basic file information and image preview
     * Uses createObjectURL for better performance than FileReader
     * 
     * @param {File} file - The image file to display
     * @returns {Promise} Resolves when image is loaded and displayed
     */
    async displayFileInfo(file) {
        return new Promise((resolve) => {
            // Display basic file properties
            document.getElementById('file-name').textContent = file.name;
            document.getElementById('file-size').textContent = window.metadataTool.formatFileSize(file.size);
            document.getElementById('file-type').textContent = file.type || 'Unknown';

            // Display file preview
            const filePreview = document.getElementById('file-preview');
            filePreview.innerHTML = '';

            const img = document.createElement('img');
            this.currentImageUrl = URL.createObjectURL(file); // Faster than FileReader
            img.src = this.currentImageUrl;

            img.onload = () => {
                this.currentImage = img;
                // Display image dimensions
                document.getElementById('file-dimensions').textContent =
                    `${img.naturalWidth} x ${img.naturalHeight} pixels`;
                filePreview.appendChild(img);

                // Show metadata display section
                document.getElementById('metadata-display').style.display = 'block';
                resolve();
            };

            img.onerror = () => {
                URL.revokeObjectURL(this.currentImageUrl);
                window.metadataTool?.showNotification('Failed to load image preview', 'error');
                resolve();
            };
        });
    }

    /**
     * Extract EXIF metadata from the image file
     * Uses the piexifjs library to parse embedded EXIF data
     * 
     * @param {File} file - The image file to extract metadata from
     * @returns {Promise<Object>} Object containing basic and EXIF metadata
     */
    async extractRealMetadata(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const imageData = e.target.result;

                    // Extract EXIF data using piexifjs library
                    const exifObj = piexif.load(imageData);

                    // Debug logging (only if DEBUG is enabled)
                    if (MetadataViewer.DEBUG && exifObj.GPS) {
                        console.log('GPS EXIF Data:', exifObj.GPS);
                        console.log('GPS Latitude (tag 2):', exifObj.GPS[2]);
                        console.log('GPS Longitude (tag 4):', exifObj.GPS[4]);
                    }

                    const metadata = {
                        basic: this.getBasicMetadata(file),
                        exif: this.parseExifData(exifObj),
                        rawExif: exifObj // Store raw EXIF for export
                    };

                    resolve(metadata);
                } catch (error) {
                    console.error('Error parsing EXIF:', error);

                    const errorMessage = error.message.includes('JPEG')
                        ? 'This image format may not contain EXIF data'
                        : 'Unable to read metadata from this file';

                    window.metadataTool?.showNotification(errorMessage, 'warning');

                    // If no EXIF data exists or parsing fails, return basic metadata only
                    resolve({
                        basic: this.getBasicMetadata(file),
                        exif: {},
                        rawExif: null
                    });
                }
            };

            reader.readAsDataURL(file);
        });
    }

    /**
     * Get basic file metadata (non-EXIF data)
     * 
     * @param {File} file - The file to extract basic metadata from
     * @returns {Object} Object containing basic file properties
     */
    getBasicMetadata(file) {
        return {
            'File Name': file.name,
            'File Size': window.metadataTool.formatFileSize(file.size),
            'MIME Type': file.type || 'Unknown',
            'Last Modified': new Date(file.lastModified).toLocaleString()
        };
    }

    /**
     * Parse EXIF data object into human-readable metadata
     * Maps EXIF tag numbers to descriptive names and formats values
     * 
     * @param {Object} exifObj - EXIF object from piexifjs
     * @returns {Object} Parsed metadata with human-readable keys and values
     */
    parseExifData(exifObj) {
        const metadata = {};

        // EXIF tag names mapping - converts numeric tags to readable names
        const exifTags = {
            // Image IFD
            '0th': {
                '270': 'Image Description',
                '271': 'Camera Make',
                '272': 'Camera Model',
                '274': 'Orientation',
                '282': 'X Resolution',
                '283': 'Y Resolution',
                '296': 'Resolution Unit',
                '305': 'Software',
                '306': 'Date/Time',
                '315': 'Artist/Author',
                '33432': 'Copyright'
            },
            // EXIF IFD
            'Exif': {
                '33434': 'Exposure Time',
                '33437': 'F-Number',
                '34850': 'Exposure Program',
                '34855': 'ISO Speed',
                '36864': 'EXIF Version',
                '36867': 'Date/Time Original',
                '36868': 'Date/Time Digitized',
                '37377': 'Shutter Speed (APEX)',
                '37378': 'Aperture',
                '37380': 'Exposure Bias',
                '37381': 'Max Aperture',
                '37383': 'Metering Mode',
                '37385': 'Flash',
                '37386': 'Focal Length',
                '37520': 'Subsec Time',
                '37521': 'Subsec Time Original',
                '37522': 'Subsec Time Digitized',
                '40960': 'FlashPix Version',
                '40961': 'Color Space',
                '40962': 'Pixel X Dimension',
                '40963': 'Pixel Y Dimension',
                '41486': 'Focal Plane X Resolution',
                '41487': 'Focal Plane Y Resolution',
                '41495': 'Sensing Method',
                '41728': 'File Source',
                '41729': 'Scene Type',
                '41985': 'Custom Rendered',
                '41986': 'Exposure Mode',
                '41987': 'White Balance',
                '41988': 'Digital Zoom Ratio',
                '41989': 'Focal Length (35mm)',
                '41990': 'Scene Capture Type',
                '41991': 'Gain Control',
                '41992': 'Contrast',
                '41993': 'Saturation',
                '41994': 'Sharpness',
                '42016': 'Image Unique ID'
            },
            // GPS IFD
            'GPS': {
                '0': 'GPS Version',
                '1': 'GPS Latitude Ref',
                '2': 'GPS Latitude',
                '3': 'GPS Longitude Ref',
                '4': 'GPS Longitude',
                '5': 'GPS Altitude Ref',
                '6': 'GPS Altitude',
                '7': 'GPS Timestamp',
                '18': 'GPS Map Datum',
                '29': 'GPS Date'
            }
        };

        // Store GPS coordinates for map link generation
        let gpsLat = null, gpsLon = null, gpsLatRef = null, gpsLonRef = null;

        // Parse each IFD (Image File Directory) section
        for (let ifd in exifTags) {
            if (exifObj[ifd]) {
                for (let tag in exifObj[ifd]) {
                    // Get human-readable tag name or use generic name
                    const tagName = exifTags[ifd][tag] || `${ifd} Tag ${tag}`;
                    let value = exifObj[ifd][tag];

                    // Store GPS data for later processing
                    if (ifd === 'GPS') {
                        if (tag === '2') gpsLat = value;
                        if (tag === '4') gpsLon = value;
                        if (tag === '1') gpsLatRef = value;
                        if (tag === '3') gpsLonRef = value;
                    }

                    // Format the value based on its type
                    if (Array.isArray(value)) {
                        if (ifd === 'GPS' && (tag === '2' || tag === '4')) {
                            // Format GPS coordinates (latitude/longitude) specially
                            value = this.formatGPSCoordinate(value);
                        } else {
                            // Join array values with commas
                            value = value.join(', ');
                        }
                    } else if (typeof value === 'object') {
                        // Convert complex objects to JSON string
                        value = JSON.stringify(value);
                    }

                    // Only include non-empty values
                    if (value !== undefined && value !== null && value !== '') {
                        metadata[tagName] = value;
                    }
                }
            }
        }

        // Add GPS map link if coordinates are available
        if (gpsLat && gpsLon) {
            const mapLink = this.addGPSMapLink(gpsLat, gpsLon, gpsLatRef, gpsLonRef);
            if (mapLink) {
                metadata['📍 Location on Map'] = mapLink;
            }
        }

        return metadata;
    }

    /**
     * Convert rational number to decimal
     * @param {Array} rational - [numerator, denominator]
     * @returns {number} Decimal value
     */
    convertRational(rational) {
        if (!Array.isArray(rational) || rational.length !== 2) return 0;
        return rational[1] !== 0 ? rational[0] / rational[1] : 0;
    }

    /**
     * Sanitize number (handle NaN and Infinity)
     * @param {number} num - Number to sanitize
     * @returns {number} Sanitized number
     */
    sanitizeNumber(num) {
        return isNaN(num) || !isFinite(num) ? 0 : num;
    }

    /**
     * Format GPS coordinates from EXIF format to degrees/minutes/seconds with decimal
     * EXIF stores GPS as arrays of rational numbers [degrees, minutes, seconds]
     * 
     * @param {Array} coord - GPS coordinate array from EXIF
     * @returns {string} Formatted coordinate string (e.g., "40° 26' 46.30\" (40.446389°)")
     * @example
     * formatGPSCoordinate([[40,1], [26,1], [4630,100]]) // "40° 26' 46.30" (40.446389°)"
     */
    formatGPSCoordinate(coord) {
        if (!Array.isArray(coord) || coord.length !== 3) return coord;

        let degrees, minutes, seconds;

        // Check if values are already numbers (simplified format common on some mobile browsers)
        if (typeof coord[0] === 'number') {
            degrees = coord[0];
            minutes = coord[1];
            seconds = coord[2];
        } else {
            // Convert rational arrays [[n,d], [n,d], [n,d]]
            degrees = this.convertRational(coord[0]);
            minutes = this.convertRational(coord[1]);
            seconds = this.convertRational(coord[2]);
        }

        // Validate and sanitize
        degrees = this.sanitizeNumber(degrees);
        minutes = this.sanitizeNumber(minutes);
        seconds = this.sanitizeNumber(seconds);

        // Convert to decimal degrees for easier usage
        const decimal = degrees + (minutes / 60) + (seconds / 3600);

        return `${degrees}° ${minutes}' ${seconds.toFixed(2)}" (${decimal.toFixed(6)}°)`;
    }

    /**
     * Convert GPS coordinates to decimal and create a map link
     * @param {Array} latitude - GPS latitude array
     * @param {Array} longitude - GPS longitude array  
     * @param {string} latRef - 'N' or 'S'
     * @param {string} lonRef - 'E' or 'W'
     * @returns {string|null} HTML link to Google Maps or null
     */
    addGPSMapLink(latitude, longitude, latRef, lonRef) {
        const lat = this.convertGPSToDecimal(latitude, latRef);
        const lon = this.convertGPSToDecimal(longitude, lonRef);

        if (lat !== null && lon !== null) {
            return `<a href="https://www.google.com/maps?q=${lat},${lon}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: none;">
                View on map (${lat.toFixed(6)}, ${lon.toFixed(6)})
            </a>`;
        }
        return null;
    }

    /**
     * Convert GPS coordinate to decimal degrees
     * @param {Array} coord - GPS coordinate array
     * @param {string} ref - Reference (N/S for latitude, E/W for longitude)
     * @returns {number|null} Decimal degrees or null
     */
    convertGPSToDecimal(coord, ref) {
        if (!Array.isArray(coord) || coord.length !== 3) return null;

        let degrees, minutes, seconds;
        if (typeof coord[0] === 'number') {
            degrees = coord[0];
            minutes = coord[1];
            seconds = coord[2];
        } else {
            degrees = this.convertRational(coord[0]);
            minutes = this.convertRational(coord[1]);
            seconds = this.convertRational(coord[2]);
        }

        let decimal = degrees + (minutes / 60) + (seconds / 3600);

        // Apply hemisphere (negative for South and West)
        if (ref === 'S' || ref === 'W') {
            decimal *= -1;
        }

        return decimal;
    }

    /**
     * Export current metadata as JSON file
     */
    exportMetadataAsJSON() {
        if (!this.currentMetadata || !this.currentFile) {
            window.metadataTool?.showNotification('No metadata to export', 'warning');
            return;
        }

        const exportData = {
            fileName: this.currentFile.name,
            fileSize: this.currentFile.size,
            extractedAt: new Date().toISOString(),
            basicInfo: this.currentMetadata.basic,
            exifData: this.currentMetadata.exif
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.currentFile.name.replace(/\.[^/.]+$/, '')}-metadata.json`;
        a.click();
        URL.revokeObjectURL(url);

        window.metadataTool?.showNotification('Metadata exported successfully', 'success');
    }

    /**
     * Display extracted metadata in a table format
     * Shows both basic file information and EXIF data if available
     * 
     * @param {Object} metadata - Object containing basic and exif metadata
     */
    displayMetadata(metadata) {
        const tbody = document.getElementById('metadata-tbody');
        tbody.innerHTML = '';

        // Display basic metadata section
        this.addMetadataRows(tbody, 'Basic File Information', metadata.basic, false);

        // Display EXIF data if available, otherwise show "no metadata" message
        if (Object.keys(metadata.exif).length > 0) {
            this.addMetadataRows(tbody, 'EXIF Metadata (Sensitive Data)', metadata.exif, true);

            // Check if GPS data is missing (common on mobile uploads due to privacy stripping)
            const hasGPS = Object.keys(metadata.exif).some(key => key.startsWith('GPS'));
            if (!hasGPS) {
                const warningRow = document.createElement('tr');
                warningRow.innerHTML = `
                    <td colspan="2" style="background-color: #fffbeb; color: #92400e; padding: 1rem; border-left: 4px solid #f59e0b;">
                        <div style="display: flex; gap: 10px; align-items: flex-start;">
                            <i class="fas fa-location-slash" style="margin-top: 3px;"></i>
                            <div>
                                <strong>Location data not found</strong><br>
                                <small>
                                    If you took this photo on a mobile device, the browser or OS likely stripped the GPS location 
                                    during upload to protect your privacy. This is a standard security feature on iOS and Android.
                                </small>
                            </div>
                        </div>
                    </td>
                `;
                tbody.appendChild(warningRow);
            }
        } else {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="2" style="text-align: center; padding: 2rem;">
                    <div style="color: var(--secondary);">
                        <strong>✅ No EXIF metadata found</strong><br>
                        <small>This image has no embedded metadata</small>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        }
    }

    /**
     * Add metadata rows to the table
     * Creates a section header and individual rows for each metadata field
     * 
     * @param {HTMLElement} tbody - Table body element to append rows to
     * @param {string} sectionTitle - Title for this metadata section
     * @param {Object} metadata - Metadata key-value pairs to display
     * @param {boolean} checkSensitive - Whether to check for sensitive data (unused)
     */
    addMetadataRows(tbody, sectionTitle, metadata, checkSensitive = false) {
        // Add section header row
        const headerRow = document.createElement('tr');
        headerRow.innerHTML = `
            <td colspan="2" style="background: var(--light); font-weight: bold; padding: 1rem;">
                ${sectionTitle}
            </td>
        `;
        tbody.appendChild(headerRow);

        // Add individual metadata rows
        Object.entries(metadata).forEach(([key, value]) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="font-weight: 600;">${key}</td>
                <td>${value}</td>
            `;

            tbody.appendChild(row);
        });
    }
}

/**
 * Initialize the MetadataViewer when DOM is fully loaded
 * Creates a global instance accessible to other modules
 */
document.addEventListener('DOMContentLoaded', () => {
    window.metadataViewer = new MetadataViewer();
});
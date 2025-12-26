/**
 * MetadataViewer - Extracts and displays EXIF metadata from image files
 * 
 * This class handles reading real EXIF data from images using the piexifjs library.
 * It displays comprehensive metadata including camera information, GPS coordinates,
 * date/time information, and other embedded data.
 */
class MetadataViewer {
    /**
     * Initialize the MetadataViewer
     * Sets up properties to track the current file and image being viewed
     */
    constructor() {
        this.currentFile = null;        // Currently selected file
        this.currentImage = null;       // Loaded image element
        this.init();
    }

    /**
     * Initialize the viewer by setting up event listeners
     */
    init() {
        this.setupEventListeners();
    }

    /**
     * Set up event listeners for file input
     * Listens for file selection changes to trigger metadata extraction
     */
    setupEventListeners() {
        const fileInput = document.getElementById('viewer-file-input');
        fileInput.addEventListener('change', (e) => {
            this.handleFileSelection(e.target.files[0]);
        });
    }

    /**
     * Handle file selection and initiate metadata extraction
     * 
     * @param {File} file - The selected image file
     */
    async handleFileSelection(file) {
        if (!file) return;

        this.currentFile = file;

        try {
            // Display basic file information and preview
            await this.displayFileInfo(file);
            // Extract EXIF metadata from the image
            const metadata = await this.extractRealMetadata(file);
            // Display the extracted metadata in a table
            this.displayMetadata(metadata);
        } catch (error) {
            console.error('Error extracting metadata:', error);
            window.metadataTool.showNotification('Error extracting metadata from file', 'error');
        }
    }

    /**
     * Display basic file information and image preview
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
            const reader = new FileReader();

            reader.onload = (e) => {
                img.src = e.target.result;
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
            };

            // Read file as data URL for preview
            reader.readAsDataURL(file);
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

                    const metadata = {
                        basic: this.getBasicMetadata(file),
                        exif: this.parseExifData(exifObj)
                    };

                    resolve(metadata);
                } catch (error) {
                    console.error('Error parsing EXIF:', error);
                    // If no EXIF data exists or parsing fails, return basic metadata only
                    resolve({
                        basic: this.getBasicMetadata(file),
                        exif: {}
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
                '37377': 'Shutter Speed',
                '37378': 'Aperture',
                '37380': 'Exposure Bias',
                '37381': 'Max Aperture',
                '37383': 'Metering Mode',
                '37385': 'Flash',
                '37386': 'Focal Length',
                '40960': 'FlashPix Version',
                '40961': 'Color Space',
                '40962': 'Pixel X Dimension',
                '40963': 'Pixel Y Dimension',
                '41486': 'Focal Plane X Resolution',
                '41487': 'Focal Plane Y Resolution',
                '41495': 'Sensing Method',
                '41728': 'File Source',
                '41729': 'Scene Type'
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

        // Parse each IFD (Image File Directory) section
        for (let ifd in exifTags) {
            if (exifObj[ifd]) {
                for (let tag in exifObj[ifd]) {
                    // Get human-readable tag name or use generic name
                    const tagName = exifTags[ifd][tag] || `${ifd} Tag ${tag}`;
                    let value = exifObj[ifd][tag];

                    // Format the value based on its type
                    if (Array.isArray(value)) {
                        if (ifd === 'GPS' && (tag === '2' || tag === '4')) {
                            // Format GPS coordinates (latitude/longitude) specially
                            // DEBUG: Append raw value to see what is happening
                            const formatted = this.formatGPSCoordinate(value);
                            value = `${formatted} <br><div style="font-size:10px; color:#666; font-family:monospace; margin-top:4px;">Raw: ${JSON.stringify(value)}</div>`;
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

        return metadata;
    }

    /**
     * Format GPS coordinates from EXIF format to degrees/minutes/seconds
     * EXIF stores GPS as arrays of rational numbers [degrees, minutes, seconds]
     * 
     * @param {Array} coord - GPS coordinate array from EXIF
     * @returns {string} Formatted coordinate string (e.g., "40° 26' 46.30\"")
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
            // Assume rational arrays [[n,d], [n,d], [n,d]]
            // Add safety check for division by zero to prevent NaN
            degrees = coord[0][1] !== 0 ? coord[0][0] / coord[0][1] : 0;
            minutes = coord[1][1] !== 0 ? coord[1][0] / coord[1][1] : 0;
            seconds = coord[2][1] !== 0 ? coord[2][0] / coord[2][1] : 0;
        }

        // Handle any remaining NaNs gracefully
        if (isNaN(degrees)) degrees = 0;
        if (isNaN(minutes)) minutes = 0;
        if (isNaN(seconds)) seconds = 0;

        return `${degrees}° ${minutes}' ${seconds.toFixed(2)}"`;
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
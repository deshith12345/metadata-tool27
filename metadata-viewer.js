// Metadata Viewer - Reads REAL EXIF data from images
class MetadataViewer {
    constructor() {
        this.currentFile = null;
        this.currentImage = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        const fileInput = document.getElementById('viewer-file-input');
        fileInput.addEventListener('change', (e) => {
            this.handleFileSelection(e.target.files[0]);
        });
    }

    async handleFileSelection(file) {
        if (!file) return;

        this.currentFile = file;
        
        try {
            await this.displayFileInfo(file);
            const metadata = await this.extractRealMetadata(file);
            this.displayMetadata(metadata);
        } catch (error) {
            console.error('Error extracting metadata:', error);
            window.metadataTool.showNotification('Error extracting metadata from file', 'error');
        }
    }

    async displayFileInfo(file) {
        return new Promise((resolve) => {
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
                    document.getElementById('file-dimensions').textContent = 
                        `${img.naturalWidth} x ${img.naturalHeight} pixels`;
                    filePreview.appendChild(img);
                    
                    // Show metadata display section
                    document.getElementById('metadata-display').style.display = 'block';
                    resolve();
                };
            };
            
            reader.readAsDataURL(file);
        });
    }

    async extractRealMetadata(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const imageData = e.target.result;
                    
                    // Extract EXIF data using piexifjs
                    const exifObj = piexif.load(imageData);
                    
                    const metadata = {
                        basic: this.getBasicMetadata(file),
                        exif: this.parseExifData(exifObj)
                    };
                    
                    resolve(metadata);
                } catch (error) {
                    console.error('Error parsing EXIF:', error);
                    // If no EXIF data, return basic metadata only
                    resolve({
                        basic: this.getBasicMetadata(file),
                        exif: {}
                    });
                }
            };
            
            reader.readAsDataURL(file);
        });
    }

    getBasicMetadata(file) {
        return {
            'File Name': file.name,
            'File Size': window.metadataTool.formatFileSize(file.size),
            'MIME Type': file.type || 'Unknown',
            'Last Modified': new Date(file.lastModified).toLocaleString()
        };
    }

    parseExifData(exifObj) {
        const metadata = {};
        
        // EXIF tag names mapping
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

        // Parse each IFD
        for (let ifd in exifTags) {
            if (exifObj[ifd]) {
                for (let tag in exifObj[ifd]) {
                    const tagName = exifTags[ifd][tag] || `${ifd} Tag ${tag}`;
                    let value = exifObj[ifd][tag];
                    
                    // Format the value
                    if (Array.isArray(value)) {
                        if (ifd === 'GPS' && (tag === '2' || tag === '4')) {
                            // Format GPS coordinates
                            value = this.formatGPSCoordinate(value);
                        } else {
                            value = value.join(', ');
                        }
                    } else if (typeof value === 'object') {
                        value = JSON.stringify(value);
                    }
                    
                    if (value !== undefined && value !== null && value !== '') {
                        metadata[tagName] = value;
                    }
                }
            }
        }
        
        return metadata;
    }

    formatGPSCoordinate(coord) {
        if (!Array.isArray(coord) || coord.length !== 3) return coord;
        
        const degrees = coord[0][0] / coord[0][1];
        const minutes = coord[1][0] / coord[1][1];
        const seconds = coord[2][0] / coord[2][1];
        
        return `${degrees}° ${minutes}' ${seconds.toFixed(2)}"`;
    }

    displayMetadata(metadata) {
        const tbody = document.getElementById('metadata-tbody');
        tbody.innerHTML = '';

        // Display basic metadata
        this.addMetadataRows(tbody, 'Basic File Information', metadata.basic, false);
        
        // Display EXIF data if available
        if (Object.keys(metadata.exif).length > 0) {
            this.addMetadataRows(tbody, 'EXIF Metadata (Sensitive Data)', metadata.exif, true);
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

    addMetadataRows(tbody, sectionTitle, metadata, checkSensitive = false) {
        // Add section header
        const headerRow = document.createElement('tr');
        headerRow.innerHTML = `
            <td colspan="2" style="background: var(--light); font-weight: bold; padding: 1rem;">
                ${sectionTitle}
            </td>
        `;
        tbody.appendChild(headerRow);

        // Add metadata rows
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

// Initialize Metadata Viewer when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.metadataViewer = new MetadataViewer();
});
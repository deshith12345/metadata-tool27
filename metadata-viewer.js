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
    static ACCEPTED_EXTENSIONS = ['jpg', 'jpeg', 'png'];
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
        this.selectionId = 0;            // Guards against stale async updates
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
     * Validate selected image by MIME type or extension.
     * Some desktop browsers leave file.type empty for local files.
     *
     * @param {File} file - Selected file
     * @returns {boolean} Whether the file is supported
     */
    isAcceptedFile(file) {
        const type = (file.type || '').toLowerCase();
        const extension = window.metadataTool?.getFileExtension(file.name) || '';
        return MetadataViewer.ACCEPTED_TYPES.includes(type) ||
            MetadataViewer.ACCEPTED_EXTENSIONS.includes(extension);
    }

    /**
     * Handle file selection and initiate metadata extraction
     * 
     * @param {File} file - The selected image file
     */
    async handleFileSelection(file) {
        if (!file) return;

        // Validate file type
        if (!this.isAcceptedFile(file)) {
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
        const selectionId = ++this.selectionId;

        try {
            // Display basic file information and preview
            await this.displayFileInfo(file);
            if (selectionId !== this.selectionId) return;
            // Extract EXIF metadata from the image
            const metadata = await this.extractRealMetadata(file);
            if (selectionId !== this.selectionId) return;
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
        const [imageData, arrayBuffer] = await Promise.all([
            this.readFileAsDataURL(file),
            this.readFileAsArrayBuffer(file)
        ]);

        let rawExif = null;
        let piexifMetadata = {};
        let parseError = null;

        if (typeof piexif !== 'undefined' && piexif?.load) {
            try {
                rawExif = piexif.load(imageData);

                // Debug logging (only if DEBUG is enabled)
                if (MetadataViewer.DEBUG && rawExif.GPS) {
                    console.log('GPS EXIF Data:', rawExif.GPS);
                    console.log('GPS Latitude (tag 2):', rawExif.GPS[2]);
                    console.log('GPS Longitude (tag 4):', rawExif.GPS[4]);
                }

                piexifMetadata = this.parseExifData(rawExif);
            } catch (error) {
                parseError = error;
                console.warn('piexif could not parse metadata, using fallback parser:', error);
            }
        }

        const fallbackMetadata = this.extractBinaryMetadata(arrayBuffer);
        const exif = this.mergeMetadata(piexifMetadata, fallbackMetadata);

        if (Object.keys(exif).length === 0 && parseError) {
            const errorMessage = parseError.message?.includes('JPEG')
                ? 'This image format may not contain readable EXIF data'
                : 'Unable to read metadata from this file';
            window.metadataTool?.showNotification(errorMessage, 'warning');
        }

        return {
            basic: this.getBasicMetadata(file),
            exif,
            rawExif
        };
    }

    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.onerror = () => reject(new Error('Failed to read image file'));
            reader.readAsDataURL(file);
        });
    }

    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.onerror = () => reject(new Error('Failed to read image file'));
            reader.readAsArrayBuffer(file);
        });
    }

    mergeMetadata(primary, fallback) {
        const merged = { ...primary };

        Object.entries(fallback).forEach(([key, value]) => {
            if (merged[key] === undefined || merged[key] === null || merged[key] === '') {
                merged[key] = value;
            }
        });

        return merged;
    }

    extractBinaryMetadata(arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        let metadata = {};

        if (this.isJpeg(bytes)) {
            metadata = this.mergeMetadata(metadata, this.extractJpegMetadata(bytes));
        }

        if (this.isPng(bytes)) {
            metadata = this.mergeMetadata(metadata, this.extractPngMetadata(bytes));
        }

        metadata = this.mergeMetadata(metadata, this.parseTextGpsMetadata(this.decodeText(bytes)));
        return metadata;
    }

    isJpeg(bytes) {
        return bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
    }

    isPng(bytes) {
        const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        return signature.every((value, index) => bytes[index] === value);
    }

    extractJpegMetadata(bytes) {
        let metadata = {};
        let offset = 2;

        while (offset + 4 < bytes.length) {
            if (bytes[offset] !== 0xff) break;

            while (bytes[offset] === 0xff) offset++;
            const marker = bytes[offset++];

            if (marker === 0xda || marker === 0xd9) break;
            if (marker >= 0xd0 && marker <= 0xd7) continue;
            if (offset + 2 > bytes.length) break;

            const length = (bytes[offset] << 8) | bytes[offset + 1];
            const dataStart = offset + 2;
            const dataEnd = offset + length;

            if (length < 2 || dataEnd > bytes.length) break;

            if (marker === 0xe1) {
                const header = this.readAscii(bytes, dataStart, Math.min(dataStart + 6, dataEnd));

                if (header === 'Exif\0\0') {
                    metadata = this.mergeMetadata(metadata, this.parseTiffMetadata(bytes, dataStart + 6, dataEnd));
                } else {
                    metadata = this.mergeMetadata(metadata, this.parseTextGpsMetadata(this.decodeText(bytes, dataStart, dataEnd)));
                }
            }

            offset = dataEnd;
        }

        return metadata;
    }

    extractPngMetadata(bytes) {
        let metadata = {};
        let offset = 8;

        while (offset + 12 <= bytes.length) {
            const length = this.readUint32BE(bytes, offset);
            const type = this.readAscii(bytes, offset + 4, offset + 8);
            const dataStart = offset + 8;
            const dataEnd = dataStart + length;

            if (dataEnd + 4 > bytes.length) break;

            if (type === 'eXIf') {
                metadata = this.mergeMetadata(metadata, this.parseTiffMetadata(bytes, dataStart, dataEnd));
            }

            if (type === 'tEXt' || type === 'iTXt') {
                metadata = this.mergeMetadata(metadata, this.parseTextGpsMetadata(this.decodeText(bytes, dataStart, dataEnd)));
            }

            offset = dataEnd + 4;
        }

        return metadata;
    }

    parseTiffMetadata(bytes, tiffStart, tiffEnd) {
        if (tiffStart + 8 > tiffEnd) return {};

        const littleEndian = bytes[tiffStart] === 0x49 && bytes[tiffStart + 1] === 0x49;
        const bigEndian = bytes[tiffStart] === 0x4d && bytes[tiffStart + 1] === 0x4d;
        if (!littleEndian && !bigEndian) return {};

        const readUint16 = (pos) => littleEndian
            ? bytes[pos] | (bytes[pos + 1] << 8)
            : (bytes[pos] << 8) | bytes[pos + 1];

        const readUint32 = (pos) => littleEndian
            ? (bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24)) >>> 0
            : ((bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]) >>> 0;

        if (readUint16(tiffStart + 2) !== 42) return {};

        const typeSizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
        const metadata = {};
        const tiffTagNames = {
            271: 'Camera Make',
            272: 'Camera Model',
            274: 'Orientation',
            305: 'Software',
            306: 'Date/Time'
        };
        const exifTagNames = {
            33434: 'Exposure Time',
            33437: 'F-Number',
            34855: 'ISO Speed',
            36867: 'Date/Time Original',
            36868: 'Date/Time Digitized',
            37386: 'Focal Length'
        };
        const gpsTagNames = {
            1: 'GPS Latitude Ref',
            2: 'GPS Latitude',
            3: 'GPS Longitude Ref',
            4: 'GPS Longitude',
            5: 'GPS Altitude Ref',
            6: 'GPS Altitude',
            7: 'GPS Timestamp',
            18: 'GPS Map Datum',
            29: 'GPS Date'
        };

        const readValue = (entryOffset) => {
            const type = readUint16(entryOffset + 2);
            const count = readUint32(entryOffset + 4);
            const typeSize = typeSizes[type];
            if (!typeSize) return null;

            const byteCount = typeSize * count;
            const valueOffset = byteCount <= 4 ? entryOffset + 8 : tiffStart + readUint32(entryOffset + 8);
            if (valueOffset < tiffStart || valueOffset + byteCount > tiffEnd) return null;

            if (type === 2) {
                return this.readAscii(bytes, valueOffset, valueOffset + count).replace(/\0+$/, '');
            }

            if (type === 3) {
                const values = Array.from({ length: count }, (_, index) => readUint16(valueOffset + index * 2));
                return count === 1 ? values[0] : values;
            }

            if (type === 4) {
                const values = Array.from({ length: count }, (_, index) => readUint32(valueOffset + index * 4));
                return count === 1 ? values[0] : values;
            }

            if (type === 5) {
                return Array.from({ length: count }, (_, index) => [
                    readUint32(valueOffset + index * 8),
                    readUint32(valueOffset + index * 8 + 4)
                ]);
            }

            if (type === 1 || type === 7) {
                const values = Array.from(bytes.slice(valueOffset, valueOffset + count));
                return count === 1 ? values[0] : values;
            }

            return null;
        };

        const parseIfd = (ifdOffset) => {
            const absoluteOffset = tiffStart + ifdOffset;
            if (absoluteOffset < tiffStart || absoluteOffset + 2 > tiffEnd) return [];

            const count = readUint16(absoluteOffset);
            const entries = [];

            for (let index = 0; index < count; index++) {
                const entryOffset = absoluteOffset + 2 + index * 12;
                if (entryOffset + 12 > tiffEnd) break;
                entries.push({
                    tag: readUint16(entryOffset),
                    value: readValue(entryOffset)
                });
            }

            return entries;
        };

        const addKnownTags = (entries, names) => {
            entries.forEach(entry => {
                const name = names[entry.tag];
                if (name && entry.value !== null && entry.value !== '') {
                    metadata[name] = this.formatTiffValue(entry.value);
                }
            });
        };

        const ifd0 = parseIfd(readUint32(tiffStart + 4));
        addKnownTags(ifd0, tiffTagNames);

        const exifPointer = this.firstNumber(ifd0.find(entry => entry.tag === 34665)?.value);
        if (exifPointer) {
            addKnownTags(parseIfd(exifPointer), exifTagNames);
        }

        const gpsPointer = this.firstNumber(ifd0.find(entry => entry.tag === 34853)?.value);
        if (gpsPointer) {
            const gpsEntries = parseIfd(gpsPointer);
            let gpsLat = null, gpsLon = null, gpsLatRef = null, gpsLonRef = null;

            gpsEntries.forEach(entry => {
                if (entry.tag === 1) gpsLatRef = entry.value;
                if (entry.tag === 2) gpsLat = entry.value;
                if (entry.tag === 3) gpsLonRef = entry.value;
                if (entry.tag === 4) gpsLon = entry.value;

                const name = gpsTagNames[entry.tag];
                if (!name || entry.value === null || entry.value === '') return;

                if (entry.tag === 2 || entry.tag === 4) {
                    metadata[name] = this.formatGPSCoordinate(entry.value);
                } else {
                    metadata[name] = this.formatTiffValue(entry.value);
                }
            });

            this.addGpsDecimalMetadata(metadata, gpsLat, gpsLon, gpsLatRef, gpsLonRef);
        }

        return metadata;
    }

    addGpsDecimalMetadata(metadata, gpsLat, gpsLon, gpsLatRef, gpsLonRef) {
        if (!gpsLat || !gpsLon) return;

        const latDecimal = this.convertGPSToDecimal(gpsLat, gpsLatRef);
        const lonDecimal = this.convertGPSToDecimal(gpsLon, gpsLonRef);

        if (!this.hasUsableGPSCoordinatePair(latDecimal, lonDecimal)) {
            this.removeCoordinateMetadata(metadata);
            metadata['GPS Location Status'] = this.getGPSPlaceholderMessage();
            return;
        }

        metadata['GPS Decimal Latitude'] = latDecimal.toFixed(6);
        metadata['GPS Decimal Longitude'] = lonDecimal.toFixed(6);
        metadata['Location on Map'] = this.createMapLink(latDecimal, lonDecimal);
    }

    parseTextGpsMetadata(text) {
        if (!text) return {};

        const latitude = this.parseTextCoordinate(
            this.findGpsTextValue(text, 'GPSLatitude'),
            this.findGpsTextValue(text, 'GPSLatitudeRef')
        );
        const longitude = this.parseTextCoordinate(
            this.findGpsTextValue(text, 'GPSLongitude'),
            this.findGpsTextValue(text, 'GPSLongitudeRef')
        );

        if (!latitude || !longitude) return {};
        if (!this.hasUsableGPSCoordinatePair(latitude.decimal, longitude.decimal)) {
            return {
                'GPS Location Status': this.getGPSPlaceholderMessage()
            };
        }

        return {
            'GPS Latitude': latitude.display,
            'GPS Longitude': longitude.display,
            'GPS Decimal Latitude': latitude.decimal.toFixed(6),
            'GPS Decimal Longitude': longitude.decimal.toFixed(6),
            'Location on Map': this.createMapLink(latitude.decimal, longitude.decimal)
        };
    }

    findGpsTextValue(text, fieldName) {
        const attrPattern = new RegExp(`${fieldName}\\s*=\\s*["']([^"']+)["']`, 'i');
        const attrMatch = text.match(attrPattern);
        if (attrMatch) return attrMatch[1];

        const elementPattern = new RegExp(`<[^>]*${fieldName}[^>]*>([^<]+)<`, 'i');
        const elementMatch = text.match(elementPattern);
        if (elementMatch) return elementMatch[1];

        const loosePattern = new RegExp(`${fieldName}[^0-9NSEW+.-]{0,40}([NSEW+-]?\\d[\\d.,\\s'"]*[NSEW]?)`, 'i');
        const looseMatch = text.match(loosePattern);
        return looseMatch ? looseMatch[1] : null;
    }

    parseTextCoordinate(value, explicitRef) {
        if (!value) return null;

        const raw = String(value).trim();
        const ref = this.normalizeGPSRef(explicitRef || raw.match(/[NSEW]\s*$/i)?.[0] || raw.match(/^\s*([NSEW])/i)?.[1]);
        const cleaned = raw
            .replace(/[NSEW]/gi, '')
            .replace(/[°º'"]/g, ',')
            .trim();
        const parts = cleaned
            .split(/[,\s]+/)
            .map(part => Number.parseFloat(part))
            .filter(value => Number.isFinite(value));

        if (parts.length === 0) return null;

        let decimal = Math.abs(parts[0]);
        if (parts.length > 1) decimal += Math.abs(parts[1]) / 60;
        if (parts.length > 2) decimal += Math.abs(parts[2]) / 3600;

        if (parts[0] < 0 || ref === 'S' || ref === 'W') {
            decimal *= -1;
        }

        return {
            decimal,
            display: `${decimal.toFixed(6)}°`
        };
    }

    formatTiffValue(value) {
        if (Array.isArray(value)) {
            if (Array.isArray(value[0])) {
                return value.map(rational => this.convertRational(rational).toFixed(4)).join(', ');
            }
            return value.join(', ');
        }

        return String(value);
    }

    firstNumber(value) {
        if (Array.isArray(value)) return value[0];
        return value;
    }

    readUint32BE(bytes, offset) {
        return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
    }

    readAscii(bytes, start, end) {
        return Array.from(bytes.slice(start, end), byte => String.fromCharCode(byte)).join('');
    }

    decodeText(bytes, start = 0, end = bytes.length) {
        try {
            return new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(start, end));
        } catch (error) {
            return this.readAscii(bytes, start, end);
        }
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
                '37500': 'MakerNote',
                '37510': 'User Comment',
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

                    value = this.formatExifDisplayValue(ifd, tag, value);

                    // Only include non-empty values
                    if (value !== undefined && value !== null && value !== '') {
                        metadata[tagName] = value;
                    }
                }
            }
        }

        // Add GPS map link if coordinates are available
        if (gpsLat && gpsLon) {
            const latDecimal = this.convertGPSToDecimal(gpsLat, gpsLatRef);
            const lonDecimal = this.convertGPSToDecimal(gpsLon, gpsLonRef);

            if (this.hasUsableGPSCoordinatePair(latDecimal, lonDecimal)) {
                metadata['GPS Decimal Latitude'] = latDecimal.toFixed(6);
                metadata['GPS Decimal Longitude'] = lonDecimal.toFixed(6);
                metadata['Location on Map'] = this.createMapLink(latDecimal, lonDecimal);
            } else {
                this.removeCoordinateMetadata(metadata);
                metadata['GPS Location Status'] = this.getGPSPlaceholderMessage();
            }
        }

        Object.keys(metadata).forEach(key => {
            if (key !== 'Location on Map' && key.includes('Location on Map')) {
                delete metadata[key];
            }
        });

        return metadata;
    }

    formatExifDisplayValue(ifd, tag, value) {
        const tagNumber = Number(tag);

        if (tagNumber === 37500) {
            return this.summarizeBinaryValue('MakerNote', value);
        }

        if (Array.isArray(value)) {
            if (ifd === 'GPS' && (tag === '2' || tag === '4')) {
                return this.formatGPSCoordinate(value);
            }

            if (this.looksLikeByteArray(value) && value.length > 48) {
                return this.summarizeBinaryValue('Binary EXIF', value);
            }

            return value.map(item => Array.isArray(item) ? item.join('/') : String(item)).join(', ');
        }

        if (typeof value === 'string') {
            if (this.looksLikeBinaryString(value) || value.length > 500) {
                return this.summarizeBinaryValue('EXIF text/binary', value);
            }

            return value;
        }

        if (value && typeof value === 'object') {
            return JSON.stringify(value);
        }

        return value;
    }

    summarizeBinaryValue(label, value) {
        const size = typeof value === 'string' ? value.length : Array.isArray(value) ? value.length : 0;
        const unit = typeof value === 'string' ? 'characters' : 'bytes';
        return `${label} data hidden from preview (${size} ${unit}). Export JSON to inspect the raw value.`;
    }

    looksLikeByteArray(value) {
        return Array.isArray(value) && value.every(item => Number.isInteger(item) && item >= 0 && item <= 255);
    }

    looksLikeBinaryString(value) {
        if (!value) return false;

        let suspicious = 0;
        for (let index = 0; index < value.length; index++) {
            const code = value.charCodeAt(index);
            const allowedWhitespace = code === 9 || code === 10 || code === 13;
            if ((!allowedWhitespace && code < 32) || code === 65533) {
                suspicious++;
            }
        }

        return suspicious / value.length > 0.08;
    }

    removeCoordinateMetadata(metadata) {
        delete metadata['GPS Latitude'];
        delete metadata['GPS Longitude'];
        delete metadata['GPS Decimal Latitude'];
        delete metadata['GPS Decimal Longitude'];
        delete metadata['Location on Map'];
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
            degrees = this.convertRationalStrict(coord[0]);
            minutes = this.convertRationalStrict(coord[1]);
            seconds = this.convertRationalStrict(coord[2]);
        }

        if (![degrees, minutes, seconds].every(Number.isFinite)) {
            return 'GPS coordinates are not embedded';
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
     * @returns {Object|null} Link descriptor for Google Maps or null
     */
    addGPSMapLink(latitude, longitude, latRef, lonRef) {
        const lat = this.convertGPSToDecimal(latitude, latRef);
        const lon = this.convertGPSToDecimal(longitude, lonRef);

        if (this.hasUsableGPSCoordinatePair(lat, lon)) {
            return this.createMapLink(lat, lon);
        }
        return null;
    }

    createMapLink(lat, lon) {
        return {
            type: 'link',
            href: `https://www.google.com/maps?q=${lat},${lon}`,
            text: `View on map (${lat.toFixed(6)}, ${lon.toFixed(6)})`
        };
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
            degrees = this.convertRationalStrict(coord[0]);
            minutes = this.convertRationalStrict(coord[1]);
            seconds = this.convertRationalStrict(coord[2]);
        }

        if (![degrees, minutes, seconds].every(Number.isFinite)) {
            return null;
        }

        let decimal = degrees + (minutes / 60) + (seconds / 3600);
        const normalizedRef = this.normalizeGPSRef(ref);

        // Apply hemisphere (negative for South and West)
        if (normalizedRef === 'S' || normalizedRef === 'W') {
            decimal *= -1;
        }

        return Number.isFinite(decimal) ? decimal : null;
    }

    hasUsableGPSCoordinatePair(lat, lon) {
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
        return !(Math.abs(lat) < 0.000001 && Math.abs(lon) < 0.000001);
    }

    getGPSPlaceholderMessage() {
        return 'GPS coordinate tags are present, but latitude/longitude are zero placeholders. This image file does not contain usable location coordinates.';
    }

    normalizeGPSRef(ref) {
        if (Array.isArray(ref)) {
            return ref
                .map(value => typeof value === 'number' ? String.fromCharCode(value) : String(value))
                .join('')
                .trim()
                .toUpperCase();
        }

        return String(ref || '').trim().toUpperCase();
    }

    convertRationalStrict(rational) {
        if (!Array.isArray(rational) || rational.length !== 2) return null;

        const numerator = Number(rational[0]);
        const denominator = Number(rational[1]);

        if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
            return null;
        }

        return numerator / denominator;
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
        setTimeout(() => URL.revokeObjectURL(url), 1000);

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
        const headerCell = document.createElement('td');
        headerCell.colSpan = 2;
        headerCell.style.background = 'var(--light)';
        headerCell.style.fontWeight = 'bold';
        headerCell.style.padding = '1rem';
        headerCell.textContent = sectionTitle;
        headerRow.appendChild(headerCell);
        tbody.appendChild(headerRow);

        // Add individual metadata rows
        Object.entries(metadata).forEach(([key, value]) => {
            const row = document.createElement('tr');

            const keyCell = document.createElement('td');
            keyCell.style.fontWeight = '600';
            keyCell.textContent = key;

            const valueCell = document.createElement('td');
            this.appendMetadataValue(valueCell, value);

            row.append(keyCell, valueCell);

            tbody.appendChild(row);
        });
    }

    appendMetadataValue(cell, value) {
        if (value && typeof value === 'object' && value.type === 'link') {
            const link = document.createElement('a');
            link.href = value.href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.style.color = '#2563eb';
            link.style.textDecoration = 'none';
            link.textContent = value.text;
            cell.appendChild(link);
            return;
        }

        if (Array.isArray(value)) {
            cell.textContent = value.join(', ');
            return;
        }

        if (value && typeof value === 'object') {
            cell.textContent = JSON.stringify(value);
            return;
        }

        cell.textContent = String(value);
    }
}

/**
 * Initialize the MetadataViewer when DOM is fully loaded
 * Creates a global instance accessible to other modules
 */
document.addEventListener('DOMContentLoaded', () => {
    window.metadataViewer = new MetadataViewer();
});

/**
 * SteganographyTool - Hides and reveals UTF-8 text in image pixels.
 *
 * Messages are written into the least significant bits of RGB channels and
 * exported as PNG so the hidden payload survives browser download.
 */
class SteganographyTool {
    static ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
    static ACCEPTED_EXTENSIONS = ['jpg', 'jpeg', 'png'];
    static MAGIC = [0x4d, 0x53, 0x54, 0x47]; // MSTG
    static HEADER_SIZE = 8;

    constructor() {
        this.encodeFile = null;
        this.decodeFile = null;
        this.stegoUrl = null;
        this.encoder = new TextEncoder();
        this.decoder = new TextDecoder();
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        const encodeInput = document.getElementById('stego-encode-file-input');
        const decodeInput = document.getElementById('stego-decode-file-input');
        const messageInput = document.getElementById('stego-message-input');
        const encodeButton = document.getElementById('stego-encode-btn');
        const decodeButton = document.getElementById('stego-decode-btn');

        encodeInput.addEventListener('change', (event) => {
            this.handleEncodeFileSelection(event.target.files[0]);
        });

        decodeInput.addEventListener('change', (event) => {
            this.handleDecodeFileSelection(event.target.files[0]);
        });

        messageInput.addEventListener('input', () => {
            this.updateCapacityDisplay();
        });

        encodeButton.addEventListener('click', () => {
            this.encodeMessage();
        });

        decodeButton.addEventListener('click', () => {
            this.decodeMessage();
        });
    }

    handleEncodeFileSelection(file) {
        if (!file || !this.validateFile(file)) return;

        this.encodeFile = file;
        this.clearStegoUrl();
        this.renderFileInfo('stego-encode-file-info', file);
        document.getElementById('stego-encode-result').style.display = 'none';
        this.updateCapacityDisplay();
    }

    handleDecodeFileSelection(file) {
        if (!file || !this.validateFile(file)) return;

        this.decodeFile = file;
        this.renderFileInfo('stego-decode-file-info', file);
        document.getElementById('stego-decode-result').style.display = 'none';
    }

    validateFile(file) {
        const type = (file.type || '').toLowerCase();
        const extension = window.metadataTool?.getFileExtension(file.name) || '';
        const isAcceptedType = SteganographyTool.ACCEPTED_TYPES.includes(type);
        const isAcceptedExtension = SteganographyTool.ACCEPTED_EXTENSIONS.includes(extension);

        if (!isAcceptedType && !isAcceptedExtension) {
            window.metadataTool?.showNotification('Please select a JPG or PNG image', 'error');
            return false;
        }

        return true;
    }

    renderFileInfo(targetId, file) {
        const target = document.getElementById(targetId);
        target.textContent = `${file.name} - ${window.metadataTool.formatFileSize(file.size)}`;
    }

    async updateCapacityDisplay() {
        const capacity = document.getElementById('stego-capacity');
        const message = document.getElementById('stego-message-input').value;
        const messageBytes = this.encoder.encode(message).length;

        if (!this.encodeFile) {
            capacity.textContent = `${messageBytes} bytes typed. Choose an image to calculate capacity.`;
            return;
        }

        try {
            const image = await this.loadImage(this.encodeFile);
            const maxBytes = this.getCapacityBytes(image.width, image.height);
            capacity.textContent = `${messageBytes} of ${maxBytes} bytes used.`;
        } catch (error) {
            capacity.textContent = 'Unable to calculate image capacity.';
        }
    }

    async encodeMessage() {
        if (!this.encodeFile) {
            window.metadataTool?.showNotification('Choose a cover image first', 'warning');
            return;
        }

        const message = document.getElementById('stego-message-input').value;
        if (!message) {
            window.metadataTool?.showNotification('Type a message to hide', 'warning');
            return;
        }

        const button = document.getElementById('stego-encode-btn');
        const originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<div class="loading"></div> Creating image...';

        try {
            const payload = this.encoder.encode(message);
            const image = await this.loadImage(this.encodeFile);
            const maxBytes = this.getCapacityBytes(image.width, image.height);

            if (payload.length > maxBytes) {
                throw new Error(`Message is too large for this image. Maximum is ${maxBytes} bytes.`);
            }

            const canvas = this.drawImageToCanvas(image);
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const encodedBytes = this.createPayload(payload);

            this.writeBytesToPixels(imageData.data, encodedBytes);
            ctx.putImageData(imageData, 0, 0);

            const blob = await this.canvasToBlob(canvas);
            const fileName = `${this.encodeFile.name.replace(/\.[^/.]+$/, '')}_stego.png`;

            this.clearStegoUrl();
            this.stegoUrl = URL.createObjectURL(blob);

            const downloadLink = document.getElementById('stego-download-link');
            downloadLink.href = this.stegoUrl;
            downloadLink.download = fileName;

            const summary = document.getElementById('stego-encode-summary');
            summary.textContent = `Hidden ${payload.length} bytes in ${fileName}.`;

            document.getElementById('stego-encode-result').style.display = 'block';
            window.metadataTool?.showNotification('Stego image created successfully', 'success');
        } catch (error) {
            window.metadataTool?.showNotification(error.message, 'error');
        } finally {
            button.disabled = false;
            button.innerHTML = originalText;
        }
    }

    async decodeMessage() {
        if (!this.decodeFile) {
            window.metadataTool?.showNotification('Choose a stego image first', 'warning');
            return;
        }

        const button = document.getElementById('stego-decode-btn');
        const originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<div class="loading"></div> Revealing...';

        try {
            const image = await this.loadImage(this.decodeFile);
            const canvas = this.drawImageToCanvas(image);
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const message = this.readMessageFromPixels(imageData.data);

            document.getElementById('stego-revealed-message').textContent = message;
            document.getElementById('stego-decode-result').style.display = 'block';
            window.metadataTool?.showNotification('Hidden message revealed', 'success');
        } catch (error) {
            document.getElementById('stego-decode-result').style.display = 'none';
            window.metadataTool?.showNotification(error.message, 'error');
        } finally {
            button.disabled = false;
            button.innerHTML = originalText;
        }
    }

    loadImage(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const image = new Image();

            image.onload = () => {
                URL.revokeObjectURL(url);
                resolve(image);
            };

            image.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load image'));
            };

            image.src = url;
        });
    }

    drawImageToCanvas(image) {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
            throw new Error('Canvas is not available in this browser');
        }

        ctx.drawImage(image, 0, 0);
        return canvas;
    }

    canvasToBlob(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Failed to create stego image'));
                }
            }, 'image/png');
        });
    }

    getCapacityBytes(width, height) {
        const usableBits = width * height * 3;
        return Math.max(0, Math.floor(usableBits / 8) - SteganographyTool.HEADER_SIZE);
    }

    createPayload(messageBytes) {
        const payload = new Uint8Array(SteganographyTool.HEADER_SIZE + messageBytes.length);
        payload.set(SteganographyTool.MAGIC, 0);
        payload[4] = (messageBytes.length >>> 24) & 0xff;
        payload[5] = (messageBytes.length >>> 16) & 0xff;
        payload[6] = (messageBytes.length >>> 8) & 0xff;
        payload[7] = messageBytes.length & 0xff;
        payload.set(messageBytes, SteganographyTool.HEADER_SIZE);
        return payload;
    }

    writeBytesToPixels(pixelData, bytes) {
        let bitIndex = 0;
        const totalBits = bytes.length * 8;

        for (let i = 0; i < pixelData.length && bitIndex < totalBits; i += 4) {
            for (let channel = 0; channel < 3 && bitIndex < totalBits; channel++) {
                const byte = bytes[Math.floor(bitIndex / 8)];
                const bit = (byte >> (7 - (bitIndex % 8))) & 1;
                pixelData[i + channel] = (pixelData[i + channel] & 0xfe) | bit;
                bitIndex++;
            }
        }
    }

    readMessageFromPixels(pixelData) {
        const header = this.readBytesFromPixels(pixelData, SteganographyTool.HEADER_SIZE, 0);

        for (let i = 0; i < SteganographyTool.MAGIC.length; i++) {
            if (header[i] !== SteganographyTool.MAGIC[i]) {
                throw new Error('No hidden message created by this tool was found');
            }
        }

        const length = (
            (header[4] << 24) |
            (header[5] << 16) |
            (header[6] << 8) |
            header[7]
        ) >>> 0;

        const maxBytes = Math.floor((pixelData.length / 4 * 3) / 8) - SteganographyTool.HEADER_SIZE;
        if (length > maxBytes) {
            throw new Error('Hidden message length is invalid or the image was changed');
        }

        const messageBytes = this.readBytesFromPixels(pixelData, length, SteganographyTool.HEADER_SIZE);
        return this.decoder.decode(messageBytes);
    }

    readBytesFromPixels(pixelData, byteCount, byteOffset) {
        const bytes = new Uint8Array(byteCount);
        const startBit = byteOffset * 8;
        const endBit = startBit + byteCount * 8;
        let streamBit = 0;
        let outputBit = 0;

        for (let i = 0; i < pixelData.length && streamBit < endBit; i += 4) {
            for (let channel = 0; channel < 3 && streamBit < endBit; channel++) {
                if (streamBit >= startBit) {
                    const byteIndex = Math.floor(outputBit / 8);
                    bytes[byteIndex] = (bytes[byteIndex] << 1) | (pixelData[i + channel] & 1);
                    outputBit++;
                }
                streamBit++;
            }
        }

        return bytes;
    }

    clearStegoUrl() {
        if (this.stegoUrl) {
            URL.revokeObjectURL(this.stegoUrl);
            this.stegoUrl = null;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.steganographyTool = new SteganographyTool();
});

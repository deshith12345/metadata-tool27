/**
 * MetadataTool - Main application controller for the Image Metadata Tool
 * 
 * This class manages the core functionality of the metadata viewer and remover application.
 * It handles tab navigation, drag-and-drop file uploads, notifications, and utility functions
 * used throughout the application.
 */
class MetadataTool {
    /**
     * Initialize the MetadataTool application
     * Sets up all event listeners and UI interactions
     */
    constructor() {
        this.init();
    }

    /**
     * Initialize all application components
     * Called automatically during construction
     */
    init() {
        this.setupTabSwitching();
        this.setupDragAndDrop();
        this.setupThemeToggle();
    }

    /**
     * Set up tab switching functionality
     * Allows users to switch between "View Metadata" and "Remove Metadata" tabs
     * Updates active states for both buttons and content panels
     */
    setupTabSwitching() {
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                // Remove active class from all tabs and content
                document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                // Add active class to clicked tab and corresponding content
                btn.classList.add('active');
                document.getElementById(tab).classList.add('active');
            });
        });
    }

    /**
     * Set up drag-and-drop functionality for file upload areas
     * Enables users to drag image files directly onto upload zones
     * Handles visual feedback (drag-over state) and file transfer to input elements
     */
    setupDragAndDrop() {
        // Define upload areas for both viewer and remover tabs
        const areas = [
            { area: 'viewer-upload-area', input: 'viewer-file-input' },
            { area: 'remover-upload-area', input: 'remover-file-input' },
            { area: 'stego-encode-upload-area', input: 'stego-encode-file-input' },
            { area: 'stego-decode-upload-area', input: 'stego-decode-file-input' }
        ];

        areas.forEach(({ area, input }) => {
            const el = document.getElementById(area);
            const inputEl = document.getElementById(input);

            if (!el || !inputEl) {
                return;
            }

            // Prevent default browser behavior for all drag events
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
                el.addEventListener(ev, e => {
                    e.preventDefault();
                    e.stopPropagation();
                });
            });

            // Add visual feedback when dragging over the area
            ['dragenter', 'dragover'].forEach(ev => {
                el.addEventListener(ev, () => el.classList.add('drag-over'));
            });

            // Remove visual feedback when leaving or dropping
            ['dragleave', 'drop'].forEach(ev => {
                el.addEventListener(ev, () => el.classList.remove('drag-over'));
            });

            // Handle the actual file drop
            el.addEventListener('drop', e => {
                const file = e.dataTransfer.files[0];
                if (file) {
                    this.handleDroppedFile(input, inputEl, file);
                }
            });
        });
    }

    /**
     * Process a file dropped onto an upload area.
     * Some browsers do not expose the DataTransfer constructor, so fall back to
     * calling the owning module directly when assigning FileList is unavailable.
     *
     * @param {string} inputId - ID of the target file input
     * @param {HTMLInputElement} inputEl - Target file input element
     * @param {File} file - Dropped file
     */
    handleDroppedFile(inputId, inputEl, file) {
        try {
            if (typeof DataTransfer === 'function') {
                const dt = new DataTransfer();
                dt.items.add(file);
                inputEl.files = dt.files;
                inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                return;
            }
        } catch (error) {
            console.warn('Falling back to direct drop handling:', error);
        }

        if (inputId === 'viewer-file-input' && window.metadataViewer) {
            window.metadataViewer.handleFileSelection(file);
            return;
        }

        if (inputId === 'remover-file-input' && window.metadataRemover) {
            window.metadataRemover.handleFileSelection(file);
            return;
        }

        if (inputId === 'stego-encode-file-input' && window.steganographyTool) {
            window.steganographyTool.handleEncodeFileSelection(file);
            return;
        }

        if (inputId === 'stego-decode-file-input' && window.steganographyTool) {
            window.steganographyTool.handleDecodeFileSelection(file);
        }
    }

    /**
     * Set up theme toggle functionality
     * Placeholder for future dark/light theme switching feature
     */
    setupThemeToggle() {
        // Theme toggle functionality can be added here if needed
    }

    /**
     * Format file size from bytes to human-readable format
     * 
     * @param {number} bytes - File size in bytes
     * @returns {string} Formatted file size (e.g., "2.5 MB", "1.2 KB")
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
        return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
    }

    /**
     * Extract file extension from filename
     * Uses bitwise operation for efficient extraction
     * 
     * @param {string} filename - Full filename with extension
     * @returns {string} Lowercase file extension (e.g., "jpg", "png")
     */
    getFileExtension(filename) {
        return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
    }

    /**
     * Display a notification message to the user
     * Automatically disappears after 4 seconds with slide-out animation
     * 
     * @param {string} message - Message to display
     * @param {string} type - Notification type: 'info', 'success', 'error', or 'warning'
     */
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;

        // Select appropriate icon based on notification type
        let icon = 'info-circle';
        if (type === 'success') icon = 'check-circle';
        if (type === 'error') icon = 'exclamation-circle';
        if (type === 'warning') icon = 'exclamation-triangle';

        const iconEl = document.createElement('i');
        iconEl.className = `fas fa-${icon}`;

        const messageEl = document.createElement('span');
        messageEl.textContent = message;

        notification.append(iconEl, messageEl);

        document.body.appendChild(notification);

        // Auto-remove notification after 4 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.4s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 400);
        }, 4000);
    }
}

/**
 * Inject CSS animations for notification slide-in/out effects
 * These animations are used by the showNotification method
 */
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

/**
 * Initialize the application when DOM is fully loaded
 * Creates a global instance accessible to other modules
 */
document.addEventListener('DOMContentLoaded', () => {
    window.metadataTool = new MetadataTool();
});

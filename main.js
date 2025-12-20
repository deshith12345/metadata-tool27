class MetadataTool {
    constructor() { 
        this.init(); 
    }
    
    init() {
        this.setupTabSwitching();
        this.setupDragAndDrop();
        this.setupThemeToggle();
    }
    
    setupTabSwitching() {
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(tab).classList.add('active');
            });
        });
    }
    
    setupDragAndDrop() {
        const areas = [
            { area: 'viewer-upload-area', input: 'viewer-file-input' },
            { area: 'remover-upload-area', input: 'remover-file-input' }
        ];
        
        areas.forEach(({area, input}) => {
            const el = document.getElementById(area);
            ['dragenter','dragover','dragleave','drop'].forEach(ev => {
                el.addEventListener(ev, e => { 
                    e.preventDefault(); 
                    e.stopPropagation(); 
                });
            });
            
            ['dragenter','dragover'].forEach(ev => {
                el.addEventListener(ev, () => el.classList.add('drag-over'));
            });
            
            ['dragleave','drop'].forEach(ev => {
                el.addEventListener(ev, () => el.classList.remove('drag-over'));
            });
            
            el.addEventListener('drop', e => {
                const file = e.dataTransfer.files[0];
                if (file) {
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    document.getElementById(input).files = dt.files;
                    document.getElementById(input).dispatchEvent(new Event('change'));
                }
            });
        });
    }
    
    setupThemeToggle() {
        // Theme toggle functionality can be added here if needed
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
    }
    
    getFileExtension(filename) {
        return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        
        // Add appropriate icon based on type
        let icon = 'info-circle';
        if (type === 'success') icon = 'check-circle';
        if (type === 'error') icon = 'exclamation-circle';
        if (type === 'warning') icon = 'exclamation-triangle';
        
        notification.innerHTML = `
            <i class="fas fa-${icon}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(notification);
        
        // Remove notification after 4 seconds
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

// Add keyframe animations to document
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

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.metadataTool = new MetadataTool();
});
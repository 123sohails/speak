class Speaky {
    constructor() {
        this.isRecording = false;
        this.recognition = null;
        this.transcriptText = '';
        this.startTime = null;
        this.timer = null;
        this.autoPunctuation = false;
        this.voiceCommands = false;
        this.aipower = false;
        this.isMobile = this.detectMobile();
        this.mobileTimeout = null;
        this.recognitionState = 'stopped'; // 'stopped', 'starting', 'listening', 'processing'
        this.lastActivityTime = Date.now();
        this.silenceTimeout = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        
        // Initialize voice command processor
        this.voiceProcessor = new VoiceCommandProcessor({
            voiceCommands: this.voiceCommands,
            autoPunctuation: this.autoPunctuation,
            smartFormatting: true
        });
        
        this.initElements();
        this.initSpeechRecognition();
        this.initEvents();
        this.loadSettings();
    }
    
    detectMobile() {
        const userAgent = navigator.userAgent.toLowerCase();
        const mobileKeywords = ['android', 'webos', 'iphone', 'ipad', 'ipod', 'blackberry', 'iemobile', 'opera mini'];
        const isMobileUA = mobileKeywords.some(keyword => userAgent.includes(keyword));
        const isTouchDevice = navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /macintell/.test(navigator.platform.toLowerCase());
        
        return isMobileUA || isTouchDevice;
    }

    initElements() {
        // Core elements
        this.micButton = document.getElementById('micBtn');
        this.micIcon = document.getElementById('micIcon');
        this.status = document.getElementById('status');
        this.language = document.getElementById('language');
        this.transcription = document.getElementById('transcription');
        
        // Control buttons
        this.copyBtn = document.getElementById('copyBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.saveBtn = document.getElementById('saveBtn');
        
        // Stats display
        this.wordCount = document.getElementById('wordCount');
        this.charCount = document.getElementById('charCount');
        this.timeCount = document.getElementById('timeCount');
        
        // Feature toggles
        this.voiceCommandsBtn = document.getElementById('voiceCommandsBtn');
        this.autoPunctuationBtn = document.getElementById('autoPunctuationBtn');
        this.aipowerBtn = document.getElementById('aipowerBtn');
        
        // Export and share buttons
        this.exportDocBtn = document.getElementById('exportDocBtn');
        this.exportPdfBtn = document.getElementById('exportPdfBtn');
        this.shareWhatsAppBtn = document.getElementById('shareWhatsAppBtn');
        this.shareTelegramBtn = document.getElementById('shareTelegramBtn');
        this.shareDiscordBtn = document.getElementById('shareDiscordBtn');
        this.shareEmailBtn = document.getElementById('shareEmailBtn');
        
        // Validate essential elements exist
        const essentialElements = ['micButton', 'transcription', 'status'];
        const missingElements = essentialElements.filter(elem => !this[elem]);
        if (missingElements.length > 0) {
            console.error('Missing essential elements:', missingElements);
            this.showNotification('Application initialization failed - missing UI elements', 'error');
            return;
        }
        
        this.setupEditableTranscription();
    }
    
    setupEditableTranscription() {
        if (!this.transcription) return;
        
        this.transcription.addEventListener('input', () => {
            this.transcriptText = this.transcription.textContent || '';
            this.updateStats();
            this.saveToLocalStorage();
        });
        
        this.transcription.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text/plain');
            document.execCommand('insertText', false, text);
        });
        
        this.transcription.addEventListener('focus', () => {
            if (this.transcription.textContent.trim() === '') {
                this.transcription.innerHTML = '';
            }
        });
        
        this.transcription.addEventListener('blur', () => {
            if (this.transcription.textContent.trim() === '') {
                this.showPlaceholder();
            }
        });

        // Auto-save functionality
        let autoSaveTimeout;
        this.transcription.addEventListener('input', () => {
            clearTimeout(autoSaveTimeout);
            autoSaveTimeout = setTimeout(() => {
                this.autoSave();
            }, 2000); // Auto-save after 2 seconds of inactivity
        });
    }
    
    showPlaceholder() {
        if (!this.transcription) return;
        
        this.transcription.innerHTML = `
            <div class="placeholder">
                <i class="fas fa-comment-dots"></i>
                <p>Your transcribed text will appear here</p>
                <small>Click the microphone and start speaking, or click here to edit manually</small>
            </div>
        `;
    }
    
    async initSpeechRecognition() {
        // Check browser compatibility
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            const message = this.isMobile ? 
                'Speech recognition requires Chrome, Safari, or Edge browser' : 
                'Speech recognition not supported. Please use Chrome, Edge, or Safari';
            this.showNotification(message, 'error');
            this.disableMicButton();
            return false;
        }

        // Check for HTTPS on mobile
        if (this.isMobile && location.protocol !== 'https:' && location.hostname !== 'localhost') {
            this.showNotification('Speech recognition requires HTTPS on mobile devices', 'error');
            this.disableMicButton();
            return false;
        }
        
        try {
            // Request microphone permission
            await this.requestMicrophonePermission();
            
            // Initialize recognition
            this.recognition = new SpeechRecognition();
            this.configureRecognition();
            this.setupRecognitionHandlers();
            
            this.showNotification('Speech recognition ready!', 'success');
            return true;
            
        } catch (error) {
            console.error('Speech recognition initialization failed:', error);
            this.showNotification(this.getMicrophoneErrorMessage(error), 'error');
            this.disableMicButton();
            return false;
        }
    }
    
    async requestMicrophonePermission() {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: this.isMobile ? 16000 : 44100
            }
        });
        
        // Release the stream immediately after permission check
        stream.getTracks().forEach(track => track.stop());
    }
    
    configureRecognition() {
        if (!this.recognition) return;
        
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = this.language?.value || 'en-US';
        this.recognition.maxAlternatives = this.isMobile ? 3 : 1;
        
        // Mobile-specific optimizations
        if (this.isMobile) {
            this.recognition.serviceURI = null; // Use default service
        }
    }
    
    setupRecognitionHandlers() {
        if (!this.recognition) return;
        
        this.recognition.onstart = () => {
            console.log('Speech recognition started');
            this.recognitionState = 'listening';
            this.updateStatus('Listening...');
            this.startTimer();
            this.reconnectAttempts = 0;
            
            // Set mobile timeout
            if (this.isMobile) {
                this.setMobileTimeout();
            }
        };
        
        this.recognition.onresult = (event) => {
            this.handleRecognitionResult(event);
        };
        
        this.recognition.onerror = (event) => {
            this.handleRecognitionError(event);
        };
        
        this.recognition.onend = () => {
            this.handleRecognitionEnd();
        };
        
        this.recognition.onsoundstart = () => {
            this.updateStatus('Sound detected...');
            this.lastActivityTime = Date.now();
        };
        
        this.recognition.onsoundend = () => {
            this.updateStatus('Processing...');
            this.recognitionState = 'processing';
        };
        
        this.recognition.onspeechstart = () => {
            this.updateStatus('Speech detected...');
            this.lastActivityTime = Date.now();
        };
    }
    
    setMobileTimeout() {
        if (this.mobileTimeout) {
            clearTimeout(this.mobileTimeout);
        }
        
        this.mobileTimeout = setTimeout(() => {
            if (this.isRecording && this.recognition) {
                console.log('Mobile timeout reached, restarting recognition');
                this.restartRecognition();
            }
        }, 30000); // 30 second timeout
    }
    
    clearMobileTimeout() {
        if (this.mobileTimeout) {
            clearTimeout(this.mobileTimeout);
            this.mobileTimeout = null;
        }
    }
    
    handleRecognitionResult(event) {
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const transcript = result[0].transcript;
            
            if (result.isFinal) {
                finalTranscript += transcript + ' ';
            } else {
                interimTranscript += transcript;
            }
        }
        
        this.updateTranscript(finalTranscript, interimTranscript);
        this.lastActivityTime = Date.now();
    }
    
    handleRecognitionError(event) {
        console.error('Speech recognition error:', event.error, event);
        this.clearMobileTimeout();
        
        const errorMessage = this.getRecognitionErrorMessage(event.error);
        
        // Handle specific error types
        switch (event.error) {
            case 'no-speech':
                // Don't show error for no-speech, just restart
                if (this.isRecording) {
                    setTimeout(() => this.restartRecognition(), 1000);
                    return;
                }
                break;
            case 'aborted':
                // Ignore aborted errors as they're usually intentional
                return;
            case 'not-allowed':
                this.disableMicButton();
                break;
        }
        
        this.showNotification(errorMessage, 'error');
        
        // Attempt to restart for recoverable errors
        if (this.isRecording && this.isRecoverableError(event.error)) {
            this.scheduleRestart();
        } else {
            this.stopRecording();
        }
    }
    
    handleRecognitionEnd() {
        console.log('Speech recognition ended');
        this.clearMobileTimeout();
        
        if (this.isRecording && this.recognitionState !== 'stopping') {
            this.scheduleRestart();
        }
    }
    
    scheduleRestart() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.showNotification('Max reconnection attempts reached. Please restart manually.', 'error');
            this.stopRecording();
            return;
        }
        
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 5000); // Exponential backoff
        this.reconnectAttempts++;
        
        setTimeout(() => {
            if (this.isRecording) {
                this.restartRecognition();
            }
        }, delay);
    }
    
    async restartRecognition() {
        if (!this.recognition || !this.isRecording) return;
        
        try {
            this.recognitionState = 'starting';
            this.updateStatus('Reconnecting...');
            this.recognition.start();
            
            if (this.isMobile) {
                this.setMobileTimeout();
            }
        } catch (error) {
            console.error('Failed to restart recognition:', error);
            this.scheduleRestart();
        }
    }
    
    initEvents() {
        // Core functionality
        this.micButton?.addEventListener('click', () => this.toggleRecording());
        this.copyBtn?.addEventListener('click', () => this.copyText());
        this.clearBtn?.addEventListener('click', () => this.clearText());
        this.saveBtn?.addEventListener('click', () => this.saveText());
        
        // Language change
        this.language?.addEventListener('change', () => {
            if (this.recognition) {
                this.recognition.lang = this.language.value;
                this.saveSettings();
            }
        });
        
        // Feature toggles
        this.voiceCommandsBtn?.addEventListener('click', () => this.toggleVoiceCommands());
        this.autoPunctuationBtn?.addEventListener('click', () => this.toggleAutoPunctuation());
        this.aipowerBtn?.addEventListener('click', () => this.toggleAIPower());
        
        // Export and share
        this.exportDocBtn?.addEventListener('click', () => this.exportAsDoc());
        this.exportPdfBtn?.addEventListener('click', () => this.exportAsPdf());
        this.shareWhatsAppBtn?.addEventListener('click', () => this.shareToWhatsApp());
        this.shareTelegramBtn?.addEventListener('click', () => this.shareToTelegram());
        this.shareDiscordBtn?.addEventListener('click', () => this.shareToDiscord());
        this.shareEmailBtn?.addEventListener('click', () => this.shareViaEmail());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
        
        // Page visibility handling
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isRecording) {
                // Pause recognition when page is hidden to save resources
                this.pauseRecording();
            } else if (!document.hidden && this.isRecording) {
                // Resume recognition when page becomes visible
                this.resumeRecording();
            }
        });
        
        // Window beforeunload
        window.addEventListener('beforeunload', () => {
            this.saveSettings();
            this.autoSave();
        });
    }
    
    handleKeyboardShortcuts(e) {
        // Ctrl+Shift+S: Toggle recording
        if (e.ctrlKey && e.shiftKey && e.key === 'S') {
            e.preventDefault();
            this.toggleRecording();
        }
        // Ctrl+S: Save
        else if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            this.saveText();
        }
        // Ctrl+C: Copy (when no text selected)
        else if (e.ctrlKey && e.key === 'c' && !window.getSelection().toString()) {
            e.preventDefault();
            this.copyText();
        }
        // Ctrl+D: Clear
        else if (e.ctrlKey && e.key === 'd') {
            e.preventDefault();
            this.clearText();
        }
        // Escape: Stop recording
        else if (e.key === 'Escape' && this.isRecording) {
            e.preventDefault();
            this.stopRecording();
        }
    }
    
    async toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }
    
    async startRecording() {
        if (this.isRecording) return;
        
        // Initialize recognition if not already done
        if (!this.recognition) {
            const initialized = await this.initSpeechRecognition();
            if (!initialized) return;
        }
        
        this.isRecording = true;
        this.recognitionState = 'starting';
        this.updateUIForRecording(true);
        this.updateStatus('Starting...');
        
        try {
            // Small delay to ensure UI updates
            await new Promise(resolve => setTimeout(resolve, 50));
            
            this.recognition.start();
            
            if (this.isMobile) {
                this.setMobileTimeout();
            }
            
        } catch (error) {
            console.error('Failed to start recording:', error);
            this.showNotification('Failed to start recording: ' + error.message, 'error');
            this.stopRecording();
        }
    }
    
    stopRecording() {
        this.isRecording = false;
        this.recognitionState = 'stopping';
        this.updateUIForRecording(false);
        this.updateStatus('Stopped');
        this.stopTimer();
        this.clearMobileTimeout();
        
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (error) {
                console.error('Error stopping recognition:', error);
            }
        }
        
        // Auto-save when stopping
        this.autoSave();
    }
    
    pauseRecording() {
        if (!this.isRecording) return;
        
        this.recognitionState = 'paused';
        this.updateStatus('Paused');
        
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (error) {
                console.error('Error pausing recognition:', error);
            }
        }
    }
    
    resumeRecording() {
        if (!this.isRecording || this.recognitionState !== 'paused') return;
        
        this.restartRecognition();
    }
    
    updateUIForRecording(isRecording) {
        if (!this.micButton || !this.micIcon) return;
        
        if (isRecording) {
            this.micButton.classList.add('recording');
            this.micIcon.className = 'fas fa-stop';
        } else {
            this.micButton.classList.remove('recording');
            this.micIcon.className = 'fas fa-microphone';
        }
    }
    
    updateStatus(message) {
        if (this.status) {
            this.status.textContent = message;
            if (message.includes('Listening') || message.includes('detected')) {
                this.status.classList.add('recording');
            } else {
                this.status.classList.remove('recording');
            }
        }
    }
    
    updateTranscript(finalText, interimText = '') {
        if (!this.transcription) return;
        
        try {
            if (finalText.trim()) {
                // Process text through voice commands and punctuation
                let processedText = this.voiceProcessor.processVoiceCommands(finalText);
                processedText = this.voiceProcessor.applyAutoPunctuation(processedText);
                
                this.transcriptText += processedText;
                
                // Apply AI correction if enabled
                if (this.aipower) {
                    this.queueAICorrection();
                }
            }
            
            // Update display
            this.updateTranscriptDisplay(interimText);
            this.updateStats();
            
        } catch (error) {
            console.error('Error updating transcript:', error);
        }
    }
    
    updateTranscriptDisplay(interimText = '') {
        if (!this.transcription) return;
        
        let displayText = this.transcriptText;
        if (interimText.trim()) {
            displayText += `<span class="interim">${interimText}</span>`;
        }
        
        if (displayText.trim()) {
            // Remove placeholder if present
            const placeholder = this.transcription.querySelector('.placeholder');
            if (placeholder) {
                placeholder.remove();
            }
            
            // Convert newlines to br tags for display
            displayText = displayText.replace(/\n/g, '<br>');
            this.transcription.innerHTML = displayText;
            
            // Auto-scroll to bottom
            this.transcription.scrollTop = this.transcription.scrollHeight;
        } else if (document.activeElement !== this.transcription) {
            this.showPlaceholder();
        }
    }
    
    // AI correction with debouncing
    queueAICorrection() {
        if (this.aiCorrectionTimeout) {
            clearTimeout(this.aiCorrectionTimeout);
        }
        
        this.aiCorrectionTimeout = setTimeout(() => {
            this.correctWithAI();
        }, 2000); // Wait 2 seconds after last input
    }
    
    async correctWithAI() {
        if (!this.transcriptText.trim()) return;
        
        try {
            this.updateStatus('AI correcting...');
            
            const response = await fetch('/.netlify/functions/ai-correct', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: this.transcriptText,
                    preset: 'standard',
                    options: {
                        preserveFormatting: true
                    }
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.corrected_text && data.corrected_text !== this.transcriptText) {
                this.transcriptText = data.corrected_text;
                this.updateTranscriptDisplay();
                this.showNotification('Text corrected by AI', 'success');
            }
            
        } catch (error) {
            console.error('AI correction failed:', error);
            this.showNotification('AI correction unavailable', 'warning');
        } finally {
            if (!this.isRecording) {
                this.updateStatus('Ready');
            }
        }
    }
    
    // Utility methods
    async copyText() {
        const text = this.getTranscriptText();
        if (!text.trim()) {
            this.showNotification('No text to copy', 'warning');
            return;
        }
        
        try {
            await navigator.clipboard.writeText(text.trim());
            this.showNotification('Text copied to clipboard!', 'success');
        } catch (error) {
            this.fallbackCopyText(text.trim());
        }
    }
    
    fallbackCopyText(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            document.execCommand('copy');
            this.showNotification('Text copied to clipboard!', 'success');
        } catch (error) {
            this.showNotification('Failed to copy text', 'error');
        }
        
        document.body.removeChild(textArea);
    }
    
    clearText() {
        this.transcriptText = '';
        this.showPlaceholder();
        this.timeCount && (this.timeCount.textContent = '00:00');
        this.updateStats();
        this.showNotification('Text cleared', 'success');
        this.saveToLocalStorage();
    }
    
    getTranscriptText() {
        return this.transcription?.textContent || this.transcriptText || '';
    }
    
    // Feature toggles
    toggleVoiceCommands() {
        this.voiceCommands = !this.voiceCommands;
        this.voiceProcessor.voiceCommands = this.voiceCommands;
        this.updateButtonState(this.voiceCommandsBtn, this.voiceCommands);
        this.showNotification(
            `Voice commands ${this.voiceCommands ? 'enabled' : 'disabled'}`,
            this.voiceCommands ? 'success' : 'warning'
        );
        this.saveSettings();
    }
    
    toggleAutoPunctuation() {
        this.autoPunctuation = !this.autoPunctuation;
        this.voiceProcessor.autoPunctuation = this.autoPunctuation;
        this.updateButtonState(this.autoPunctuationBtn, this.autoPunctuation);
        this.showNotification(
            `Auto-punctuation ${this.autoPunctuation ? 'enabled' : 'disabled'}`,
            this.autoPunctuation ? 'success' : 'warning'
        );
        this.saveSettings();
    }
    
    toggleAIPower() {
        this.aipower = !this.aipower;
        this.updateButtonState(this.aipowerBtn, this.aipower);
        this.showNotification(
            `AI correction ${this.aipower ? 'enabled' : 'disabled'}`,
            this.aipower ? 'success' : 'warning'
        );
        this.saveSettings();
        
        if (this.aipower && this.transcriptText.trim()) {
            this.correctWithAI();
        }
    }
    
    updateButtonState(button, isActive) {
        if (!button) return;
        
        button.style.background = isActive ? '#10a37f' : '#2f2f2f';
        button.style.color = isActive ? 'white' : '#ececf1';
    }
    
    // Export and sharing methods
    saveText() {
        const text = this.getTranscriptText();
        if (!text.trim()) {
            this.showNotification('No text to save', 'warning');
            return;
        }
        
        this.downloadFile(text.trim(), 'text/plain', 'txt');
        this.showNotification('Text saved as TXT file!', 'success');
    }
    
    exportAsDoc() {
        const text = this.getTranscriptText();
        if (!text.trim()) {
            this.showNotification('No text to export', 'warning');
            return;
        }
        
        const htmlContent = this.generateDocumentHTML(text);
        this.downloadFile(htmlContent, 'application/msword', 'doc');
        this.showNotification('Exported as DOC file!', 'success');
    }
    
    exportAsPdf() {
        const text = this.getTranscriptText();
        if (!text.trim()) {
            this.showNotification('No text to export', 'warning');
            return;
        }
        
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(this.generatePrintHTML(text));
            printWindow.document.close();
            this.showNotification('Opening PDF print dialog...', 'success');
        } else {
            this.showNotification('Please allow popups for PDF export', 'error');
        }
    }
    
    // Sharing methods
    shareToWhatsApp() {
        const text = this.getTranscriptText();
        if (!text.trim()) {
            this.showNotification('No text to share', 'warning');
            return;
        }
        
        const encodedText = encodeURIComponent(`Speaky Transcript:\n\n${text.trim()}`);
        window.open(`https://wa.me/?text=${encodedText}`, '_blank');
        this.showNotification('Opening WhatsApp...', 'success');
    }
    
    shareToTelegram() {
        const text = this.getTranscriptText();
        if (!text.trim()) {
            this.showNotification('No text to share', 'warning');
            return;
        }
        
        const encodedText = encodeURIComponent(`Speaky Transcript:\n\n${text.trim()}`);
        window.open(`https://t.me/share/url?text=${encodedText}`, '_blank');
        this.showNotification('Opening Telegram...', 'success');
    }
    
    shareToDiscord() {
        const text = this.getTranscriptText();
        if (!text.trim()) {
            this.showNotification('No text to share', 'warning');
            return;
        }
        
        this.copyText();
        this.showNotification('Text copied! Paste it in Discord.', 'success');
    }
    
    shareViaEmail() {
        const text = this.getTranscriptText();
        if (!text.trim()) {
            this.showNotification('No text to share', 'warning');
            return;
        }
        
        const subject = encodeURIComponent('Speaky Transcript');
        const body = encodeURIComponent(`Here's my speech-to-text transcript from Speaky:\n\n${text.trim()}`);
        window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
        this.showNotification('Opening email client...', 'success');
    }
    
    // Helper methods
    generateDocumentHTML(text) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Speaky Transcript</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; margin: 40px; }
                    h1 { color: #10a37f; margin-bottom: 20px; }
                    .meta { color: #666; font-size: 12px; margin-bottom: 30px; }
                    .content { white-space: pre-wrap; }
                </style>
            </head>
            <body>
                <h1>Speaky Transcript</h1>
                <div class="content">${text.replace(/\n/g, '<br>')}</div>
                <script>
                    window.onload = function() {
                        window.print();
                        setTimeout(() => window.close(), 1000);
                    }
                </script>
            </body>
            </html>
        `;
    }
    
    downloadFile(content, mimeType, extension) {
        try {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `speaky-transcript-${new Date().toISOString().split('T')[0]}.${extension}`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download failed:', error);
            this.showNotification('Download failed', 'error');
        }
    }
    
    // Statistics and timer
    updateStats() {
        const text = this.getTranscriptText();
        const words = text.trim() ? text.trim().split(/\s+/).filter(word => word.length > 0).length : 0;
        const chars = text.length;
        
        if (this.wordCount) this.wordCount.textContent = words;
        if (this.charCount) this.charCount.textContent = chars;
    }
    
    startTimer() {
        if (this.timer) return; // Prevent multiple timers
        
        this.startTime = Date.now();
        this.timer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            if (this.timeCount) {
                this.timeCount.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }
    
    stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    
    // Settings persistence
    saveSettings() {
        const settings = {
            language: this.language?.value || 'en-US',
            voiceCommands: this.voiceCommands,
            autoPunctuation: this.autoPunctuation,
            aipower: this.aipower,
            lastSaved: Date.now()
        };
        
        try {
            localStorage.setItem('speaky-settings', JSON.stringify(settings));
        } catch (error) {
            console.warn('Failed to save settings:', error);
        }
    }
    
    loadSettings() {
        try {
            const saved = localStorage.getItem('speaky-settings');
            if (saved) {
                const settings = JSON.parse(saved);
                
                // Apply language setting
                if (this.language && settings.language) {
                    this.language.value = settings.language;
                }
                
                // Apply feature settings
                if (settings.voiceCommands !== undefined) {
                    this.voiceCommands = settings.voiceCommands;
                    this.updateButtonState(this.voiceCommandsBtn, this.voiceCommands);
                }
                
                if (settings.autoPunctuation !== undefined) {
                    this.autoPunctuation = settings.autoPunctuation;
                    this.updateButtonState(this.autoPunctuationBtn, this.autoPunctuation);
                }
                
                if (settings.aipower !== undefined) {
                    this.aipower = settings.aipower;
                    this.updateButtonState(this.aipowerBtn, this.aipower);
                }
                
                // Update voice processor settings
                if (this.voiceProcessor) {
                    this.voiceProcessor.voiceCommands = this.voiceCommands;
                    this.voiceProcessor.autoPunctuation = this.autoPunctuation;
                }
            }
        } catch (error) {
            console.warn('Failed to load settings:', error);
        }
        
        // Load auto-saved transcript
        this.loadFromLocalStorage();
    }
    
    // Auto-save functionality
    autoSave() {
        const text = this.getTranscriptText();
        if (text.trim()) {
            try {
                const autoSave = {
                    text: text,
                    timestamp: Date.now(),
                    wordCount: text.trim().split(/\s+/).length,
                    charCount: text.length
                };
                localStorage.setItem('speaky-autosave', JSON.stringify(autoSave));
            } catch (error) {
                console.warn('Auto-save failed:', error);
            }
        }
    }
    
    saveToLocalStorage() {
        this.autoSave();
    }
    
    loadFromLocalStorage() {
        try {
            const autoSave = localStorage.getItem('speaky-autosave');
            if (autoSave) {
                const data = JSON.parse(autoSave);
                // Only restore if it's recent (within 24 hours)
                if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
                    this.transcriptText = data.text || '';
                    if (this.transcriptText.trim()) {
                        this.updateTranscriptDisplay();
                        this.updateStats();
                        this.showNotification('Previous session restored', 'success');
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to restore previous session:', error);
        }
    }
    
    // Error handling utilities
    isRecoverableError(errorType) {
        const recoverableErrors = ['network', 'service-not-allowed', 'no-speech'];
        return recoverableErrors.includes(errorType);
    }
    
    getRecognitionErrorMessage(errorType) {
        const errorMessages = {
            'not-allowed': 'Microphone access denied. Please enable microphone permissions.',
            'no-speech': 'No speech detected. Try speaking closer to the microphone.',
            'aborted': 'Speech recognition was stopped.',
            'audio-capture': 'No microphone found. Please check your device settings.',
            'network': 'Network error. Please check your internet connection.',
            'service-not-allowed': 'Speech service not allowed. Please refresh the page.',
            'bad-grammar': 'Grammar error in speech recognition.',
            'language-not-supported': 'Selected language is not supported.'
        };
        
        return errorMessages[errorType] || `Speech recognition error: ${errorType}`;
    }
    
    getMicrophoneErrorMessage(error) {
        if (error.name === 'NotAllowedError') {
            return 'Microphone access denied. Please allow access and refresh the page.';
        } else if (error.name === 'NotFoundError') {
            return 'No microphone found. Please check your device settings.';
        } else if (error.name === 'NotSupportedError') {
            return 'Your browser doesn\'t support speech recognition.';
        } else if (error.name === 'NotReadableError') {
            return 'Microphone is being used by another application.';
        }
        return `Microphone error: ${error.message}`;
    }
    
    disableMicButton() {
        if (this.micButton) {
            this.micButton.disabled = true;
            this.micButton.style.opacity = '0.5';
            this.micButton.title = 'Speech recognition not available';
        }
        this.updateStatus('Speech recognition unavailable');
    }
    
    // Notification system
    showNotification(message, type = 'success') {
        // Remove existing notifications
        const existing = document.querySelectorAll('.speaky-notification');
        existing.forEach(notification => notification.remove());
        
        const notification = document.createElement('div');
        notification.className = `speaky-notification notification-${type}`;
        notification.textContent = message;
        
        // Add styles
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '12px 20px',
            borderRadius: '8px',
            color: 'white',
            fontWeight: '500',
            fontSize: '14px',
            zIndex: '10000',
            maxWidth: '300px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            transform: 'translateX(100%)',
            transition: 'all 0.3s ease',
            cursor: 'pointer'
        });
        
        // Set background color based on type
        const colors = {
            success: '#10a37f',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };
        notification.style.backgroundColor = colors[type] || colors.info;
        
        document.body.appendChild(notification);
        
        // Animate in
        requestAnimationFrame(() => {
            notification.style.transform = 'translateX(0)';
        });
        
        // Click to dismiss
        notification.addEventListener('click', () => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 300);
        });
        
        // Auto dismiss
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 300);
            }
        }, type === 'error' ? 5000 : 3000);
    }
    
    // Cleanup method
    destroy() {
        // Stop recording
        this.stopRecording();
        
        // Clear timers
        this.stopTimer();
        this.clearMobileTimeout();
        if (this.aiCorrectionTimeout) {
            clearTimeout(this.aiCorrectionTimeout);
        }
        
        // Save settings
        this.saveSettings();
        this.autoSave();
        
        // Clean up recognition
        if (this.recognition) {
            this.recognition.onstart = null;
            this.recognition.onend = null;
            this.recognition.onerror = null;
            this.recognition.onresult = null;
            this.recognition = null;
        }
        
        console.log('Speaky instance destroyed');
    }
}

// Voice Command Processor (from your enhanced version)
class VoiceCommandProcessor {
    constructor(options = {}) {
        this.voiceCommands = options.voiceCommands !== false;
        this.autoPunctuation = options.autoPunctuation !== false;
        this.smartFormatting = options.smartFormatting !== false;
        this.customCommands = options.customCommands || {};
        this.transcriptText = '';
        this.commandHistory = [];
        this.undoStack = [];
        this.maxUndoSteps = 20;
        
        this.abbreviations = [
            'e.g.', 'i.e.', 'Mr.', 'Mrs.', 'Dr.', 'Ms.', 'Prof.', 'Jr.', 'Sr.',
            'vs.', 'etc.', 'Inc.', 'Corp.', 'Ltd.', 'Co.', 'Ave.', 'St.', 'Rd.',
            'Ph.D.', 'M.D.', 'B.A.', 'M.A.', 'U.S.', 'U.K.', 'a.m.', 'p.m.',
            'Jan.', 'Feb.', 'Mar.', 'Apr.', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'
        ];

        this.numberWords = {
            'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
            'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
            'ten': '10', 'eleven': '11', 'twelve': '12', 'thirteen': '13',
            'fourteen': '14', 'fifteen': '15', 'sixteen': '16', 'seventeen': '17',
            'eighteen': '18', 'nineteen': '19', 'twenty': '20', 'thirty': '30',
            'forty': '40', 'fifty': '50', 'sixty': '60', 'seventy': '70',
            'eighty': '80', 'ninety': '90', 'hundred': '100', 'thousand': '1000'
        };
    }

    processVoiceCommands(text) {
        if (!this.voiceCommands) return text;
        
        const commands = {
            'period': '.', 'full stop': '.', 'comma': ',', 'question mark': '?',
            'exclamation mark': '!', 'colon': ':', 'semicolon': ';', 'dash': '-',
            'new line': '\n', 'new paragraph': '\n\n', 'quote': '"'
        };
        
        let processedText = text;
        for (const [command, replacement] of Object.entries(commands)) {
            const regex = new RegExp(`\\b${this.escapeRegex(command)}\\b`, 'gi');
            processedText = processedText.replace(regex, replacement);
        }
        
        return processedText;
    }

    applyAutoPunctuation(text) {
        if (!this.autoPunctuation) return text;

        text = text.replace(/\bi\b/g, 'I');
        text = text.replace(/\s+/g, ' ').trim();
        text = text.replace(/^(\s*["'(\[]*\s*)(\w)/, (match, p1, p2) => p1 + p2.toUpperCase());
        
        if (!text.match(/[.!?]$/)) {
            if (text.match(/\b(what|how|when|where|who|why|which|whose)\b/i)) {
                text += '?';
            } else {
                text += '.';
            }
        }
        
        return text;
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\                <div class');
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.speaky = new Speaky();
})
    

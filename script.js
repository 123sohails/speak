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
        
        this.initElements();
        this.initSpeechRecognition();
        this.initEvents();
    }
    
    detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               (navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /MacIntel/.test(navigator.platform));
    }

    initElements() {
        this.micButton = document.getElementById('micBtn');
        this.micIcon = document.getElementById('micIcon');
        this.status = document.getElementById('status');
        this.language = document.getElementById('language');
        this.transcription = document.getElementById('transcription');
        this.copyBtn = document.getElementById('copyBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.saveBtn = document.getElementById('saveBtn');
        this.wordCount = document.getElementById('wordCount');
        this.charCount = document.getElementById('charCount');
        this.timeCount = document.getElementById('timeCount');
        this.voiceCommandsBtn = document.getElementById('voiceCommandsBtn');
        this.autoPunctuationBtn = document.getElementById('autoPunctuationBtn');
        this.aipowerBtn=document.getElementById('aipowerBtn');
       
        
        // Export and share buttons
        this.exportDocBtn = document.getElementById('exportDocBtn');
        this.exportPdfBtn = document.getElementById('exportPdfBtn');
        this.shareWhatsAppBtn = document.getElementById('shareWhatsAppBtn');
        this.shareTelegramBtn = document.getElementById('shareTelegramBtn');
        this.shareDiscordBtn = document.getElementById('shareDiscordBtn');
        this.shareEmailBtn = document.getElementById('shareEmailBtn');
        
        this.setupEditableTranscription();
    }
    
    setupEditableTranscription() {
        this.transcription.addEventListener('input', () => {
            this.transcriptText = this.transcription.textContent || '';
            this.updateStats();
        });
        
        this.transcription.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
        });
        
        this.transcription.addEventListener('focus', () => {
            if (this.transcription.textContent.trim() === '') {
                this.transcription.innerHTML = '';
            }
        });
        
        this.transcription.addEventListener('blur', () => {
            if (this.transcription.textContent.trim() === '') {
                this.transcription.innerHTML = `
                    <div class="placeholder">
                        <i class="fas fa-comment-dots"></i>
                        <p>Your transcribed text will appear here</p>
                        <small>Click the microphone and start speaking, or click here to edit manually</small>
                    </div>
                `;
            }
        });
    }
    
    async initSpeechRecognition() {
        // Chrome-specific check for mobile
        const isChromeMobile = /Chrome\/[0-9]+\./i.test(navigator.userAgent) && 
                             /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // Check for speech recognition support with mobile-specific handling
        const hasWebkitSR = 'webkitSpeechRecognition' in window;
        const hasSR = 'SpeechRecognition' in window;
        
        if (!hasWebkitSR && !hasSR) {
            const message = isChromeMobile ? 
                'Please update Chrome to the latest version for best results.' : 
                'Speech recognition not supported in this browser. Use Chrome, Edge, or Safari.';
            this.showNotification(message, 'error');
            return;
        }

        // Mobile-specific: Check if we're in a secure context
        if (this.isMobile && !window.isSecureContext) {
            this.showNotification('Speech recognition requires HTTPS on mobile devices', 'error');
            return;
        }
        
        // Mobile-specific: Add touch event listener for better mobile support
        if (this.isMobile) {
            document.body.addEventListener('touchstart', this.handleTouchStart.bind(this), { once: true });
            
            // On mobile, we'll request permissions when the user taps the mic button
            // rather than during initialization
            return;
        }

        // Request microphone permission with mobile-specific handling
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    // Mobile-specific: Use lower sample rate for better compatibility
                    sampleRate: this.isMobile ? 16000 : 44100
                }
            });
            
            // Important: Stop the stream immediately after permission check
            stream.getTracks().forEach(track => track.stop());
            
            this.showNotification('Microphone access granted!', 'success');
        } catch (error) {
            console.error('Microphone access error:', error);
            const message = this.isMobile ? 
                'Please allow microphone access in your browser settings and refresh the page. Make sure you\'re using HTTPS.' : 
                'Please allow microphone access to use speech recognition';
            this.showNotification(message, 'error');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        // Mobile-optimized settings
        this.recognition.continuous = !this.isMobile; // Disable continuous on mobile for better stability
        this.recognition.interimResults = true;
        this.recognition.lang = this.language.value;
        this.recognition.maxAlternatives = 1;
        
        // Mobile-specific settings
        if (this.isMobile) {
            this.recognition.grammars = null; // Disable grammars on mobile
            this.recognition.continuous = true; // Enable continuous for Chrome mobile
            this.recognition.interimResults = true;
            this.mobileTimeout = null;
            
            // Chrome mobile specific settings
            if (/Chrome\/[0-9]+\./i.test(navigator.userAgent)) {
                this.recognition.maxAlternatives = 5; // More alternatives for better results
                this.recognition.interimResults = true;
            }
        }
            
        this.recognition.onstart = () => {
            console.log('Speech recognition started');
            this.startTimer();
            
            // Mobile-specific: Set a timeout to prevent hanging
            if (this.isMobile) {
                this.mobileTimeout = setTimeout(() => {
                    if (this.isRecording) {
                        console.log('Mobile timeout reached, restarting recognition');
                        this.recognition.stop();
                    }
                }, 30000); // 30 second timeout
            }
        };
        
        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                const confidence = event.results[i][0].confidence;
                
                if (event.results[i].isFinal) {
                    finalTranscript += transcript + ' ';
                } else {
                    interimTranscript += transcript;
                }
            }
            
            this.updateTranscript(finalTranscript, interimTranscript);
        };
        
        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            
            // Clear mobile timeout on error
            if (this.isMobile && this.mobileTimeout) {
                clearTimeout(this.mobileTimeout);
                this.mobileTimeout = null;
            }
            
            let errorMessage = `Error: ${event.error}`;
            
            // Mobile-specific error handling
            if (this.isMobile) {
                switch (event.error) {
                    case 'not-allowed':
                        errorMessage = 'Microphone access denied. Please enable in browser settings.';
                        break;
                    case 'no-speech':
                        errorMessage = 'No speech detected. Try speaking closer to the microphone.';
                        // Don't stop recording for no-speech on mobile, just restart
                        setTimeout(() => {
                            if (this.isRecording) {
                                try {
                                    this.recognition.start();
                                } catch (e) {
                                    console.error('Failed to restart after no-speech:', e);
                                }
                            }
                        }, 1000);
                        return; // Don't call stopRecording for no-speech
                    case 'network':
                        errorMessage = 'Network error. Check your internet connection and try again.';
                        break;
                    case 'audio-capture':
                        errorMessage = 'Microphone not available. Check if another app is using it.';
                        break;
                    case 'service-not-allowed':
                        errorMessage = 'Speech service not allowed. Try refreshing the page.';
                        break;
                    case 'aborted':
                        // Don't show error for aborted on mobile, it's often intentional
                        return;
                }
            }
            
            this.showNotification(errorMessage, 'error');
            this.stopRecording();
        };
        
        this.recognition.onend = () => {
            
            // Clear mobile timeout
            if (this.isMobile && this.mobileTimeout) {
                clearTimeout(this.mobileTimeout);
                this.mobileTimeout = null;
            }
            
            if (this.isRecording) {
                // Mobile-specific restart logic with exponential backoff
                const restartDelay = this.isMobile ? 1000 : 100;
                setTimeout(() => {
                    if (this.isRecording) {
                        try {
                            this.recognition.start();
                        } catch (error) {
                            console.error('Failed to restart recognition:', error);
                            // On mobile, try one more time after a longer delay
                            if (this.isMobile) {
                                setTimeout(() => {
                                    if (this.isRecording) {
                                        try {
                                            this.recognition.start();
                                        } catch (e) {
                                            console.error('Final restart attempt failed:', e);
                                            this.stopRecording();
                                        }
                                    }
                                }, 2000);
                            } else {
                                this.stopRecording();
                            }
                        }
                    }
                }, restartDelay);
            }
        };
    }
    
    initEvents() {
        this.micButton.addEventListener('click', () => this.toggleRecording());
        this.copyBtn.addEventListener('click', () => this.copyText());
        this.clearBtn.addEventListener('click', () => this.clearText());
        this.saveBtn.addEventListener('click', () => this.saveText());
        
        
        this.language.addEventListener('change', () => {
            if (this.recognition) this.recognition.lang = this.language.value;
        });
        
        this.voiceCommandsBtn.addEventListener('click', () => this.toggleVoiceCommands());
        this.autoPunctuationBtn.addEventListener('click', () => this.toggleAutoPunctuation());
        this.aipowerBtn.addEventListener('click', () => this.toggleaipower());
        
        // Export and share event listeners
        this.exportDocBtn.addEventListener('click', () => this.exportAsDoc());
        this.exportPdfBtn.addEventListener('click', () => this.exportAsPdf());
        this.shareWhatsAppBtn.addEventListener('click', () => this.shareToWhatsApp());
        this.shareTelegramBtn.addEventListener('click', () => this.shareToTelegram());
        this.shareDiscordBtn.addEventListener('click', () => this.shareToDiscord());
        this.shareEmailBtn.addEventListener('click', () => this.shareViaEmail());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'S') {
                e.preventDefault();
                this.toggleRecording();
            }
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveText();
            }
            if (e.ctrlKey && e.key === 'c' && !window.getSelection().toString()) {
                e.preventDefault();
                this.copyText();
            }
        });
    }
    
    toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }
    // ...inside your Speaky class...
async correctGrammarWithAI() {
    const text = this.getTranscriptText();
    if (!text.trim()) {
        this.showNotification('No text to correct', 'warning');
        return;
    }

    this.showNotification('Correcting grammar with AI...', 'success');

    try {
        const response = await fetch('/ai-correct', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        const data = await response.json();
        this.transcription.innerText = data.corrected_text || text;
        this.showNotification('Text corrected!', 'success');
        this.updateStats();
    } catch (error) {
        this.showNotification('AI correction failed', 'error');
    }
}

    
    // Mobile-specific touch start handler
    handleTouchStart() {
        // This is needed to ensure audio context is resumed after user interaction
        if (this.isMobile && typeof AudioContext !== 'undefined') {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }
        }
    }
    
    async startRecording() {
        // Prevent multiple starts
        if (this.isRecording) {
            console.log('Recording already in progress');
            return;
        }
        
        // Show recording state immediately
        this.isRecording = true;
        this.micButton.classList.add('recording');
        this.micIcon.className = 'fas fa-stop';
        this.status.textContent = 'Initializing...';
        this.status.classList.add('recording');
        
        // Add a small delay to ensure UI updates
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // On mobile, we need to initialize recognition when the user taps the button
        if (this.isMobile) {
            try {
                // First, request microphone permission
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                // Stop all tracks to release the microphone immediately after permission
                stream.getTracks().forEach(track => track.stop());
                
                // Initialize recognition after getting permission
                if (!this.recognition) {
                    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                    if (!SpeechRecognition) {
                        throw new Error('Speech recognition not supported');
                    }
                    
                    this.recognition = new SpeechRecognition();
                    this.recognition.continuous = true;
                    this.recognition.interimResults = true;
                    this.recognition.lang = this.language.value;
                    
                    // Track if recognition is running
                    this.recognition.isRunning = false;
                    
                    // Set up event handlers
                    this.recognition.onresult = (event) => {
                        let interimTranscript = '';
                        let finalTranscript = '';
                        
                        for (let i = event.resultIndex; i < event.results.length; i++) {
                            const transcript = event.results[i][0].transcript;
                            if (event.results[i].isFinal) {
                                finalTranscript += transcript + ' ';
                            } else {
                                interimTranscript += transcript;
                            }
                        }
                        
                        this.updateTranscript(finalTranscript, interimTranscript);
                        this.status.textContent = 'Listening...';
                    };
                    
                    this.recognition.onerror = (event) => {
                        console.error('Speech recognition error:', event.error);
                        let errorMessage = `Error: ${event.error}`;
                        
                        switch (event.error) {
                            case 'not-allowed':
                                errorMessage = 'Microphone access denied. Please enable in browser settings.';
                                break;
                            case 'no-speech':
                                errorMessage = 'No speech detected. Try speaking closer to the microphone.';
                                return; // Don't show error for no-speech
                            case 'audio-capture':
                                errorMessage = 'No microphone found. Please check your device settings.';
                                break;
                        }
                        
                        this.showNotification(errorMessage, 'error');
                        this.stopRecording();
                    };
                    
                    this.recognition.onstart = () => {
                        this.recognition.isRunning = true;
                        console.log('Speech recognition started');
                    };
                    
                    this.recognition.onend = () => {
                        this.recognition.isRunning = false;
                        if (this.isRecording) {
                            setTimeout(() => {
                                if (this.isRecording && this.recognition) {
                                    try {
                                        if (!this.recognition.isRunning) {
                                            this.recognition.start();
                                            this.recognition.isRunning = true;
                                        }
                                    } catch (e) {
                                        console.error('Failed to restart recognition:', e);
                                        this.stopRecording();
                                    }
                                }
                            }, 100);
                        }
                    };
                }
                
                // Start recognition after a small delay to ensure everything is ready
                await new Promise(resolve => setTimeout(resolve, 100));
                this.status.textContent = 'Listening...';
                
                // Check if recognition is not already running
                if (this.recognition && !this.recognition.isRunning) {
                    this.recognition.start();
                    this.recognition.isRunning = true;
                }
                return; // Exit early for mobile
                
            } catch (error) {
                console.error('Mobile recording error:', error);
                this.showNotification('Failed to access microphone. ' + (error.message || ''), 'error');
                this.stopRecording();
                return;
            }
        }
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            // Stop all tracks to release the microphone
            stream.getTracks().forEach(track => track.stop());
            
            // Small delay to ensure permission is fully granted
            await new Promise(resolve => setTimeout(resolve, 100));
            
            this.status.textContent = 'Listening...';
            
            // Check if recognition is not already running
            if (this.recognition && !this.recognition.isRunning) {
                this.recognition.start();
                this.recognition.isRunning = true;
            }
        } catch (error) {
            console.error('Microphone access error:', error);
            this.showNotification('Microphone access denied. Please allow access to use speech recognition.', 'error');
            this.stopRecording();
        }
    }

    // Force UI update on mobile
    forceMobileUpdate() {
        if (!this.isMobile) return;
        
        // Force a reflow and update
        const container = this.transcription;
        container.style.display = 'none';
        container.offsetHeight; // Trigger reflow
        container.style.display = 'block';
    }
    
    stopRecording() {
        this.isRecording = false;
        this.micButton.classList.remove('recording');
        this.micIcon.className = 'fas fa-microphone';
        this.status.textContent = 'Click to start recording';
        this.status.classList.remove('recording');
        this.stopTimer();
        
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (e) {
                console.log('Error stopping recognition:', e);
            }
        }
    }

    updateTranscript(finalText, interimText) {
        console.log('updateTranscript called with:', {finalText, interimText});
        
        try {
            if (finalText) {
                let processedText = this.processVoiceCommands(finalText);
                processedText = this.applyAutoPunctuation(processedText);
                
                // Chrome mobile sometimes sends empty final results, filter them out
                if (processedText.trim() === '' && this.isMobile) {
                    console.log('Skipping empty final text on mobile');
                    return;
                }
                
                this.transcriptText += processedText;
                console.log('Updated transcriptText:', this.transcriptText);
                
                // Force UI update on mobile
                if (this.isMobile) {
                    this.forceMobileUpdate();
                }
            }
            
            let displayText = this.transcriptText;
            if (interimText) {
                displayText += `<span class="interim">${interimText}</span>`;
            }
            
            if (displayText.trim()) {
                const placeholder = this.transcription.querySelector('.placeholder');
                if (placeholder) {
                    placeholder.remove();
                }
                
                displayText = displayText.replace(/\n/g, '<br>');
                
                // Mobile-specific DOM update with forced reflow
                if (this.isMobile) {
                    this.transcription.style.display = 'none';
                    this.transcription.innerHTML = displayText;
                    this.transcription.offsetHeight; // Force reflow
                    this.transcription.style.display = 'block';
                    
                    // Ensure contenteditable is properly set
                    this.transcription.setAttribute('contenteditable', 'true');
                } else {
                    this.transcription.innerHTML = displayText;
                }
            } else if (document.activeElement !== this.transcription) {
                this.transcription.innerHTML = `
                    <div class="placeholder">
                        <i class="fas fa-comment-dots"></i>
                        <p>Your transcribed text will appear here</p>
                        <small>Click the microphone and start speaking, or click here to edit manually</small>
                    </div>
                `;
            }
            
            this.updateStats();
            
            // Auto-scroll to bottom for better mobile UX
            if (this.isMobile) {
                // Use requestAnimationFrame for smoother scrolling on mobile
                requestAnimationFrame(() => {
                    this.transcription.scrollTop = this.transcription.scrollHeight;
                });
            } else {
                this.transcription.scrollTop = this.transcription.scrollHeight;
            }
        } catch (error) {
            console.error('Error in updateTranscript:', error);
        }
    }
    
    processVoiceCommands(text) {
        if (!this.voiceCommands) return text;
        
        const commands = {
            'new line': '\n',
            'new paragraph': '\n\n',
            'period': '.',
            'full stop': '.',
            'comma': ',',
            'question mark': '?',
            'exclamation mark': '!',
            'colon': ':',
            'semicolon': ';',
            'dash': '-',
            'quote': '"',
            'open parenthesis': '(',
            'close parenthesis': ')',
            'delete that': () => {
                const words = this.transcriptText.trim().split(' ');
                words.pop();
                this.transcriptText = words.join(' ') + ' ';
                return '';
            }
        };
        
        let processedText = text;
        for (const [command, replacement] of Object.entries(commands)) {
            const regex = new RegExp(`\\b${command}\\b`, 'gi');
            if (typeof replacement === 'function') {
                if (regex.test(processedText)) {
                    replacement();
                    processedText = processedText.replace(regex, '');
                }
            } else {
                processedText = processedText.replace(regex, replacement);
            }
        }
        
        return processedText;
    }
    
    applyAutoPunctuation(text) {
        if (!this.autoPunctuation) return text;
        
        text = text.replace(/\bi\b/g, 'I');
        text = text.replace(/^(\w)/, (match) => match.toUpperCase());
        text = text.replace(/(\. )(\w)/g, (match, p1, p2) => p1 + p2.toUpperCase());
        
        if (!text.match(/[.!?]$/)) {
            text += '.';
        }
        
        return text;
    }
    
    async copyText() {
        const text = this.getTranscriptText();
        if (text.trim()) {
            try {
                await navigator.clipboard.writeText(text.trim());
                this.showNotification('Text copied to clipboard!', 'success');
            } catch (err) {
                this.fallbackCopyText(text.trim());
            }
        } else {
            this.showNotification('No text to copy', 'error');
        }
    }
    
    fallbackCopyText(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            this.showNotification('Text copied to clipboard!', 'success');
        } catch (err) {
            this.showNotification('Failed to copy text', 'error');
        }
        document.body.removeChild(textArea);
    }
    
    getTranscriptText() {
        return this.transcription.textContent || this.transcriptText || '';
    }
    
    clearText() {
        this.transcriptText = '';
        this.transcription.innerHTML = `
            <div class="placeholder">
                <i class="fas fa-comment-dots"></i>
                <p>Your transcribed text will appear here</p>
                <small>Click the microphone and start speaking, or click here to edit manually</small>
            </div>
        `;
        this.timeCount.textContent = '00:00';
        this.showNotification('Text cleared', 'success');
        this.updateStats();
    }
    
    saveText() {
        const text = this.getTranscriptText();
        if (text.trim()) {
            this.downloadFile(text.trim(), 'text/plain', 'txt');
            this.showNotification('Text saved as TXT file!', 'success');
        } else {
            this.showNotification('No text to save', 'error');
        }
    }
    
    exportAsDoc() {
        const text = this.getTranscriptText();
        if (text.trim()) {
            const htmlContent = `
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
                    <div class="meta">Generated on ${new Date().toLocaleString()}</div>
                    <div class="content">${text.replace(/\n/g, '<br>')}</div>
                </body>
                </html>
            `;
            this.downloadFile(htmlContent, 'application/msword', 'doc');
            this.showNotification('Exported as DOC file!', 'success');
        } else {
            this.showNotification('No text to export', 'error');
        }
    }
    
    exportAsPdf() {
        const text = this.getTranscriptText();
        if (text.trim()) {
            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Speaky Transcript</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; }
                        h1 { color: #333; margin-bottom: 20px; }
                        .meta { color: #666; font-size: 12px; margin-bottom: 30px; }
                        .content { white-space: pre-wrap; margin-top: 20px; }
                        @media print { 
                            body { margin: 0; }
                            @page { margin: 1in; }
                        }
                    </style>
                </head>
                <body>
                    <h1>Speaky Transcript</h1>
                    <div class="meta">Generated on ${new Date().toLocaleString()}</div>
                    <div class="content">${text.replace(/\n/g, '<br>')}</div>
                    <script>
                        window.onload = function() {
                            window.print();
                            setTimeout(() => window.close(), 1000);
                        }
                    </script>
                </body>
                </html>
            `);
            printWindow.document.close();
            this.showNotification('Opening PDF print dialog...', 'success');
        } else {
            this.showNotification('No text to export', 'error');
        }
    }
    
    shareToWhatsApp() {
        const text = this.getTranscriptText();
        if (text.trim()) {
            const encodedText = encodeURIComponent(`Speaky Transcript:\n\n${text.trim()}`);
            window.open(`https://wa.me/?text=${encodedText}`, '_blank');
            this.showNotification('Opening WhatsApp...', 'success');
        } else {
            this.showNotification('No text to share', 'error');
        }
    }
    
    shareToTelegram() {
        const text = this.getTranscriptText();
        if (text.trim()) {
            const encodedText = encodeURIComponent(`Speaky Transcript:\n\n${text.trim()}`);
            window.open(`https://t.me/share/url?text=${encodedText}`, '_blank');
            this.showNotification('Opening Telegram...', 'success');
        } else {
            this.showNotification('No text to share', 'error');
        }
    }
    
    shareToDiscord() {
        const text = this.getTranscriptText();
        if (text.trim()) {
            this.copyText();
            this.showNotification('Text copied! Paste it in Discord.', 'success');
        } else {
            this.showNotification('No text to share', 'error');
        }
    }
    
    shareViaEmail() {
        const text = this.getTranscriptText();
        if (text.trim()) {
            const subject = encodeURIComponent('Speaky Transcript');
            const body = encodeURIComponent(`Here's my speech-to-text transcript from Speaky:\n\n${text.trim()}`);
            window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
            this.showNotification('Opening email client...', 'success');
        } else {
            this.showNotification('No text to share', 'error');
        }
    }
    
    toggleVoiceCommands() {
        this.voiceCommands = !this.voiceCommands;
        this.voiceCommandsBtn.style.background = this.voiceCommands ? '#10a37f' : '#2f2f2f';
        this.voiceCommandsBtn.style.color = this.voiceCommands ? 'white' : '#ececf1';
        this.showNotification(
            `Voice commands ${this.voiceCommands ? 'enabled' : 'disabled'}`, 
            this.voiceCommands ? 'success' : 'warning'
        );
    }
    
    toggleAutoPunctuation() {
        this.autoPunctuation = !this.autoPunctuation;
        this.autoPunctuationBtn.style.background = this.autoPunctuation ? '#10a37f' : '#2f2f2f';
        this.autoPunctuationBtn.style.color = this.autoPunctuation ? 'white' : '#ececf1';
        this.showNotification(
            `Auto-punctuation ${this.autoPunctuation ? 'enabled' : 'disabled'}`, 
            this.autoPunctuation ? 'success' : 'warning'
        );
    }
    // ...in your toggleaipower() method, call this when enabling AI power...
toggleaipower() {
    this.aipower = !this.aipower;
    this.aipowerBtn.style.background = this.aipower ? '#10a37f' : '#2f2f2f';
    this.aipowerBtn.style.color = this.aipower ? 'white' : '#ececf1';
    this.showNotification(
        `AI-Powered ${this.aipower ? 'enabled' : 'disabled'}`, 
        this.aipower ? 'success' : 'warning'
    );
    if (this.aipower) {
        this.correctGrammarWithAI();
    }
}
    
    downloadFile(content, mimeType, extension) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `speaky-transcript-${new Date().toISOString().split('T')[0]}.${extension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    updateStats() {
        const text = this.getTranscriptText();
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        const chars = text.length;
        
        this.wordCount.textContent = words;
        this.charCount.textContent = chars;
    }
    
    startTimer() {
        this.startTime = Date.now();
        this.timer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            this.timeCount.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }
    
    stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    
    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new Speaky();
    // ...inside your Speaky class...



    
});
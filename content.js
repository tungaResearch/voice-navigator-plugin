// Enhanced Voice Navigator Content Script with Compact Floating Popup
class VoiceNavigator {
  constructor() {
    this.isListening = false;
    this.lastHighlightedElement = null;
    this.commandHistory = [];
    this.floatingPopup = null;
    this.recognition = null;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.continuousListening = false;  // Track continuous listening state
    this.shouldStopListening = false;  // Flag to stop continuous listening
    this.isMinimized = false;
    this.init();
  }

  init() {
    // Clean up any existing popups from previous page loads
    this.cleanupExistingPopups();
    
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'toggleFloatingPopup') {
        this.toggleFloatingPopup();
      } else if (message.command) {
        this.handleCommand(message.command);
      }
      sendResponse({ success: true });
    });

    // Add visual feedback styles
    this.addStyles();
    
    // Load popup state and create floating popup if enabled
    this.loadPopupState();
    
    // Save state before page unload/redirect and cleanup
    window.addEventListener('beforeunload', () => {
      this.cleanup();
    });
    
    // Handle page visibility changes for better cross-domain persistence
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // Clean up any duplicate popups when page becomes visible
        this.cleanupExistingPopups();
        
        if (this.continuousListening && !this.isListening) {
          // Page became visible and we should be listening - restart
          setTimeout(() => {
            if (this.continuousListening && !this.isListening) {
              this.startListening();
            }
          }, 500);
        }
      } else if (document.visibilityState === 'hidden') {
        // Page is being hidden, cleanup microphone
        this.cleanup();
      }
    });
    
    console.log('Enhanced Voice Navigator initialized');
  }

  cleanupExistingPopups() {
    // Remove any existing voice navigator popups
    const existingPopups = document.querySelectorAll('#voice-nav-floating-popup');
    existingPopups.forEach(popup => popup.remove());
  }

  cleanup() {
    // Stop speech recognition and save state
    if (this.recognition && this.isListening) {
      this.recognition.stop();
    }
    
    // Save current state
    if (this.continuousListening || this.isListening) {
      this.savePopupState(true, null, true);
    }
  }

  async loadPopupState() {
    try {
      const result = await chrome.storage.local.get([
        'floatingPopupEnabled', 
        'popupPosition', 
        'continuousListening',
        'isListening',
        'isMinimized'
      ]);
      
      // Restore floating popup if enabled
      if (result.floatingPopupEnabled !== false) { // Default to enabled
        this.isMinimized = result.isMinimized || false;
        this.createFloatingPopup(result.popupPosition);
        
        // Restore continuous listening state
        if (result.continuousListening) {
          this.continuousListening = true;
          
          // If was listening before redirect, restart listening
          if (result.isListening) {
            setTimeout(() => {
              this.startListening();
            }, 1000); // Small delay to ensure popup is ready
          }
        }
      }
    } catch (error) {
      console.log('Storage not available, creating default popup');
      this.createFloatingPopup();
    }
  }

  async savePopupState(enabled, position = null, saveListeningState = false) {
    try {
      const data = { floatingPopupEnabled: enabled };
      if (position) {
        data.popupPosition = position;
      }
      if (saveListeningState) {
        data.continuousListening = this.continuousListening;
        data.isListening = this.isListening;
      }
      data.isMinimized = this.isMinimized;
      await chrome.storage.local.set(data);
    } catch (error) {
      console.log('Could not save popup state:', error);
    }
  }

  createFloatingPopup(position = null) {
    if (this.floatingPopup) {
      this.floatingPopup.remove();
    }

    // Create compact floating popup container
    this.floatingPopup = document.createElement('div');
    this.floatingPopup.id = 'voice-nav-floating-popup';
    this.floatingPopup.className = 'voice-nav-floating-popup';
    
    // Set position
    const defaultPosition = { x: 20, y: 20 };
    const popupPosition = position || defaultPosition;
    
    // Compact size - much smaller than before
    const compactWidth = this.isMinimized ? '60px' : '200px';
    
    this.floatingPopup.style.cssText = `
      position: fixed;
      top: ${popupPosition.y}px;
      left: ${popupPosition.x}px;
      width: ${compactWidth};
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 10000;
      user-select: none;
      transition: all 0.3s ease;
      font-size: 12px;
    `;

    // Create compact popup content
    this.floatingPopup.innerHTML = `
      <div class="voice-nav-header" style="
        padding: 8px 10px;
        cursor: move;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: ${this.isMinimized ? 'none' : '1px solid rgba(255, 255, 255, 0.1)'};
      ">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 14px;">🎤</span>
          ${!this.isMinimized ? '<span style="font-size: 12px; font-weight: 600;">Voice</span>' : ''}
        </div>
        <div style="display: flex; gap: 4px;">
          <button id="voice-nav-minimize" style="
            background: rgba(255, 255, 255, 0.2);
            border: none;
            border-radius: 3px;
            color: white;
            width: 20px;
            height: 20px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            line-height: 1;
          " title="${this.isMinimized ? 'Expand' : 'Minimize'}">${this.isMinimized ? '+' : '−'}</button>
          <button id="voice-nav-close" style="
            background: rgba(255, 255, 255, 0.2);
            border: none;
            border-radius: 3px;
            color: white;
            width: 20px;
            height: 20px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            line-height: 1;
          " title="Close">×</button>
        </div>
      </div>
      <div id="voice-nav-content" style="padding: 8px; display: ${this.isMinimized ? 'none' : 'block'};">
        <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px;">
          <button id="voice-nav-start-btn" style="
            padding: 8px 10px;
            border: none;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            background: rgba(255, 255, 255, 0.2);
            color: white;
            backdrop-filter: blur(10px);
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
          " title="Start/Stop Voice Recognition">
            <span style="font-size: 12px;">🎤</span>
            <span id="voice-nav-btn-text">Start</span>
          </button>
          <div style="display: flex; gap: 4px;">
            <button id="voice-nav-help-btn" style="
              padding: 6px 8px;
              border: none;
              border-radius: 4px;
              font-size: 10px;
              cursor: pointer;
              background: rgba(255, 255, 255, 0.1);
              color: white;
              transition: all 0.2s ease;
              flex: 1;
            " title="Show/Hide Commands">
              <span>❓</span>
            </button>
            <button id="voice-nav-scroll-up" style="
              padding: 6px 8px;
              border: none;
              border-radius: 4px;
              font-size: 10px;
              cursor: pointer;
              background: rgba(255, 255, 255, 0.1);
              color: white;
              transition: all 0.2s ease;
              flex: 1;
            " title="Scroll Up">
              <span>↑</span>
            </button>
            <button id="voice-nav-scroll-down" style="
              padding: 6px 8px;
              border: none;
              border-radius: 4px;
              font-size: 10px;
              cursor: pointer;
              background: rgba(255, 255, 255, 0.1);
              color: white;
              transition: all 0.2s ease;
              flex: 1;
            " title="Scroll Down">
              <span>↓</span>
            </button>
          </div>
        </div>
        <div id="voice-nav-status" style="
          background: rgba(255, 255, 255, 0.1);
          padding: 6px 8px;
          border-radius: 4px;
          font-size: 10px;
          line-height: 1.3;
          min-height: 16px;
          backdrop-filter: blur(10px);
          margin-bottom: 6px;
          text-align: center;
        ">
          Ready
        </div>
        <div id="voice-nav-commands" style="
          background: rgba(255, 255, 255, 0.1);
          padding: 8px;
          border-radius: 4px;
          backdrop-filter: blur(10px);
          display: none;
          max-height: 120px;
          overflow-y: auto;
        ">
          <div style="font-size: 10px; line-height: 1.4;">
            <div style="margin-bottom: 4px; font-weight: 600;">Quick Commands:</div>
            <div style="opacity: 0.9;">• "scroll up/down"</div>
            <div style="opacity: 0.9;">• "click [text]"</div>
            <div style="opacity: 0.9;">• "type [text] into [field]"</div>
            <div style="opacity: 0.9;">• "go to [link]"</div>
            <div style="opacity: 0.9;">• "stop listening"</div>
          </div>
        </div>
      </div>
    `;

    // Add to page
    document.body.appendChild(this.floatingPopup);

    // Setup event listeners
    this.setupFloatingPopupEvents();
    
    // Setup speech recognition
    this.setupSpeechRecognition();
  }

  setupFloatingPopupEvents() {
    const header = this.floatingPopup.querySelector('.voice-nav-header');
    const startBtn = this.floatingPopup.querySelector('#voice-nav-start-btn');
    const helpBtn = this.floatingPopup.querySelector('#voice-nav-help-btn');
    const scrollUpBtn = this.floatingPopup.querySelector('#voice-nav-scroll-up');
    const scrollDownBtn = this.floatingPopup.querySelector('#voice-nav-scroll-down');
    const minimizeBtn = this.floatingPopup.querySelector('#voice-nav-minimize');
    const closeBtn = this.floatingPopup.querySelector('#voice-nav-close');
    const content = this.floatingPopup.querySelector('#voice-nav-content');
    const commands = this.floatingPopup.querySelector('#voice-nav-commands');

    // Drag functionality
    header.addEventListener('mousedown', (e) => this.startDrag(e));
    header.addEventListener('touchstart', (e) => this.startDrag(e.touches[0]), { passive: false });

    // Voice control buttons
    startBtn.addEventListener('click', () => {
      if (this.isListening || this.continuousListening) {
        // Stop continuous listening
        this.shouldStopListening = true;
        this.continuousListening = false;
        if (this.recognition) {
          this.recognition.stop();
        }
      } else {
        // Start listening
        this.startListening();
      }
    });

    // Quick action buttons
    helpBtn.addEventListener('click', () => {
      const isVisible = commands.style.display !== 'none';
      commands.style.display = isVisible ? 'none' : 'block';
    });

    scrollUpBtn.addEventListener('click', () => {
      window.scrollBy({ top: -300, behavior: 'smooth' });
      this.showStatus('↑', 'success');
    });

    scrollDownBtn.addEventListener('click', () => {
      window.scrollBy({ top: 300, behavior: 'smooth' });
      this.showStatus('↓', 'success');
    });

    // Minimize/maximize
    minimizeBtn.addEventListener('click', () => {
      this.isMinimized = !this.isMinimized;
      content.style.display = this.isMinimized ? 'none' : 'block';
      minimizeBtn.textContent = this.isMinimized ? '+' : '−';
      minimizeBtn.title = this.isMinimized ? 'Expand' : 'Minimize';
      this.floatingPopup.style.width = this.isMinimized ? '60px' : '200px';
      
      // Update header border
      header.style.borderBottom = this.isMinimized ? 'none' : '1px solid rgba(255, 255, 255, 0.1)';
      
      // Hide voice text when minimized
      const voiceText = header.querySelector('span:last-child');
      if (voiceText && voiceText.textContent === 'Voice') {
        voiceText.style.display = this.isMinimized ? 'none' : 'inline';
      }
      
      // Save minimized state
      this.savePopupState(true, null, false);
    });

    // Close popup
    closeBtn.addEventListener('click', () => {
      this.toggleFloatingPopup();
    });

    // Hover effects for desktop
    const buttons = [startBtn, helpBtn, scrollUpBtn, scrollDownBtn, minimizeBtn, closeBtn];
    buttons.forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(255, 255, 255, 0.3)';
        btn.style.transform = 'scale(1.05)';
      });
      
      btn.addEventListener('mouseleave', () => {
        btn.style.background = btn === startBtn ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)';
        btn.style.transform = 'scale(1)';
      });

      // Touch feedback for mobile
      btn.addEventListener('touchstart', () => {
        btn.style.transform = 'scale(0.95)';
      });
      
      btn.addEventListener('touchend', () => {
        btn.style.transform = 'scale(1)';
      });
    });

    // Prevent text selection during drag
    header.addEventListener('selectstart', (e) => e.preventDefault());
    header.addEventListener('dragstart', (e) => e.preventDefault());
  }

  startDrag(e) {
    this.isDragging = true;
    const rect = this.floatingPopup.getBoundingClientRect();
    this.dragOffset = {
      x: (e.clientX || e.pageX) - rect.left,
      y: (e.clientY || e.pageY) - rect.top
    };

    // Add global event listeners
    document.addEventListener('mousemove', this.handleDrag.bind(this));
    document.addEventListener('mouseup', this.stopDrag.bind(this));
    document.addEventListener('touchmove', this.handleTouchDrag.bind(this), { passive: false });
    document.addEventListener('touchend', this.stopDrag.bind(this));

    // Visual feedback
    this.floatingPopup.style.cursor = 'grabbing';
    this.floatingPopup.style.transform = 'scale(1.02)';
    
    e.preventDefault();
  }

  handleDrag(e) {
    if (!this.isDragging) return;
    
    const x = e.clientX - this.dragOffset.x;
    const y = e.clientY - this.dragOffset.y;
    
    this.updatePopupPosition(x, y);
  }

  handleTouchDrag(e) {
    if (!this.isDragging) return;
    
    const touch = e.touches[0];
    const x = touch.clientX - this.dragOffset.x;
    const y = touch.clientY - this.dragOffset.y;
    
    this.updatePopupPosition(x, y);
    e.preventDefault();
  }

  updatePopupPosition(x, y) {
    // Keep popup within viewport bounds
    const maxX = window.innerWidth - this.floatingPopup.offsetWidth;
    const maxY = window.innerHeight - this.floatingPopup.offsetHeight;
    
    let boundedX = Math.max(0, Math.min(x, maxX));
    let boundedY = Math.max(0, Math.min(y, maxY));
    
    // Snap to edges if close (within 15px for compact popup)
    const snapDistance = 15;
    
    if (boundedX < snapDistance) {
      boundedX = 0;
      this.showSnapFeedback();
    } else if (boundedX > maxX - snapDistance) {
      boundedX = maxX;
      this.showSnapFeedback();
    }
    
    if (boundedY < snapDistance) {
      boundedY = 0;
      this.showSnapFeedback();
    } else if (boundedY > maxY - snapDistance) {
      boundedY = maxY;
      this.showSnapFeedback();
    }
    
    this.floatingPopup.style.left = boundedX + 'px';
    this.floatingPopup.style.top = boundedY + 'px';
  }

  showSnapFeedback() {
    // Add visual feedback for snapping
    this.floatingPopup.style.boxShadow = '0 4px 20px rgba(66, 133, 244, 0.5)';
    setTimeout(() => {
      this.floatingPopup.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
    }, 200);
  }

  stopDrag() {
    if (!this.isDragging) return;
    
    this.isDragging = false;
    
    // Remove global event listeners
    document.removeEventListener('mousemove', this.handleDrag.bind(this));
    document.removeEventListener('mouseup', this.stopDrag.bind(this));
    document.removeEventListener('touchmove', this.handleTouchDrag.bind(this));
    document.removeEventListener('touchend', this.stopDrag.bind(this));

    // Reset visual feedback
    this.floatingPopup.style.cursor = '';
    this.floatingPopup.style.transform = 'scale(1)';
    
    // Save position
    const rect = this.floatingPopup.getBoundingClientRect();
    this.savePopupState(true, { x: rect.left, y: rect.top });
  }

  toggleFloatingPopup() {
    if (this.floatingPopup) {
      // Cleanup before removing
      this.cleanup();
      this.floatingPopup.remove();
      this.floatingPopup = null;
      this.savePopupState(false);
    } else {
      this.createFloatingPopup();
      this.savePopupState(true);
    }
  }

  setupSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      this.showStatus("❌ Not supported", "error");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    
    // Configure recognition for continuous listening
    this.recognition.lang = 'en-US';
    this.recognition.continuous = true;  // Enable continuous listening
    this.recognition.interimResults = false;
    this.recognition.maxAlternatives = 1;

    // Event handlers
    this.recognition.onstart = () => {
      this.onListeningStart();
    };

    this.recognition.onresult = (event) => {
      this.onSpeechResult(event);
    };

    this.recognition.onerror = (event) => {
      this.onSpeechError(event);
    };

    this.recognition.onend = () => {
      this.onListeningEnd();
    };
  }

  startListening() {
    if (!this.recognition) {
      this.showStatus("❌ Not available", "error");
      return;
    }
    
    try {
      this.recognition.start();
    } catch (error) {
      console.error('Error starting recognition:', error);
      this.showStatus("❌ Error", "error");
    }
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
    }
  }

  onListeningStart() {
    this.isListening = true;
    const startBtn = this.floatingPopup.querySelector('#voice-nav-start-btn');
    const btnText = this.floatingPopup.querySelector('#voice-nav-btn-text');
    
    if (startBtn) {
      startBtn.classList.add('listening');
      startBtn.style.animation = 'pulse 1.5s infinite';
      btnText.textContent = 'Stop';
    }
    
    this.showStatus("🎙️ Listening...", "listening");
    
    // Save listening state for cross-domain persistence
    this.savePopupState(true, null, true);
  }

  onSpeechResult(event) {
    const command = event.results[event.results.length - 1][0].transcript;
    const confidence = event.results[event.results.length - 1][0].confidence;
    
    this.commandHistory.push({
      command: command,
      confidence: confidence,
      timestamp: new Date()
    });

    this.showStatus(`✅ "${command}"`, "success");
    
    // Check for stop listening command
    if (command.toLowerCase().trim().includes('stop listening')) {
      this.shouldStopListening = true;
      this.continuousListening = false;
      this.showStatus("🛑 Stopping", "info");
      this.recognition.stop();
      // Clear listening state from storage
      this.savePopupState(true, null, true);
      return;
    }
    
    // Process the command
    this.handleCommand(command);
    
    // Enable continuous listening after first command
    if (!this.continuousListening) {
      this.continuousListening = true;
      this.showStatus("🔄 Continuous mode", "info");
      // Save continuous listening state
      this.savePopupState(true, null, true);
    }
  }

  onSpeechError(event) {
    console.error('Speech recognition error:', event.error);
    
    let errorMessage = "❌ ";
    switch (event.error) {
      case 'no-speech':
        errorMessage += "No speech";
        break;
      case 'audio-capture':
        errorMessage += "No mic";
        break;
      case 'not-allowed':
        errorMessage += "Mic denied";
        break;
      case 'network':
        errorMessage += "Network error";
        break;
      default:
        errorMessage += "Error";
    }
    
    this.showStatus(errorMessage, "error");
  }

  onListeningEnd() {
    this.isListening = false;
    const startBtn = this.floatingPopup.querySelector('#voice-nav-start-btn');
    const btnText = this.floatingPopup.querySelector('#voice-nav-btn-text');
    
    // If we should stop listening (user said "stop listening"), reset everything
    if (this.shouldStopListening) {
      this.shouldStopListening = false;
      this.continuousListening = false;
      
      if (startBtn) {
        startBtn.classList.remove('listening');
        startBtn.style.animation = '';
        btnText.textContent = 'Start';
      }
      
      this.showStatus("⏹️ Stopped", "stopped");
      // Save stopped state
      this.savePopupState(true, null, true);
      return;
    }
    
    // If in continuous listening mode, restart automatically after a brief pause
    if (this.continuousListening) {
      setTimeout(() => {
        if (this.continuousListening && !this.shouldStopListening) {
          this.startListening();
        }
      }, 1000); // 1 second pause between commands
      
      this.showStatus("🎙️ Ready...", "listening");
      // Save continuous listening state
      this.savePopupState(true, null, true);
    } else {
      // First time or manual stop
      if (startBtn) {
        startBtn.classList.remove('listening');
        startBtn.style.animation = '';
        btnText.textContent = 'Start';
      }
      
      this.showStatus("⏹️ Stopped", "stopped");
      // Save stopped state
      this.savePopupState(true, null, true);
    }
  }

  showStatus(message, type = "info") {
    const status = this.floatingPopup?.querySelector('#voice-nav-status');
    if (status) {
      status.textContent = message;
      status.className = `voice-nav-status ${type}`;
      
      // Auto-clear success messages after 2 seconds for compact display
      if (type === "success") {
        setTimeout(() => {
          if (status.textContent === message) {
            this.showStatus("Ready", "ready");
          }
        }, 2000);
      }
    }
  }

  addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .voice-nav-highlight {
        outline: 3px solid #4285f4 !important;
        outline-offset: 2px !important;
        background-color: rgba(66, 133, 244, 0.1) !important;
        transition: all 0.3s ease !important;
      }
      .voice-nav-success {
        outline: 3px solid #34a853 !important;
        outline-offset: 2px !important;
        background-color: rgba(52, 168, 83, 0.1) !important;
      }
      .voice-nav-error {
        outline: 3px solid #ea4335 !important;
        outline-offset: 2px !important;
        background-color: rgba(234, 67, 53, 0.1) !important;
      }
      @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.7; }
        100% { opacity: 1; }
      }
      
      /* Compact scrollbar for commands */
      #voice-nav-commands::-webkit-scrollbar {
        width: 4px;
      }
      #voice-nav-commands::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
      }
      #voice-nav-commands::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.3);
        border-radius: 2px;
      }
    `;
    document.head.appendChild(style);
  }

  handleCommand(command) {
    if (!command) return;

    command = command.toLowerCase().trim();
    this.commandHistory.push(command);
    console.log('Processing enhanced command:', command);

    try {
      this.clearHighlights();

      // Handle start listening command (for when stopped)
      if (command.includes('start listening')) {
        if (!this.isListening && !this.continuousListening) {
          this.startListening();
          return;
        }
      }

      // Enhanced command routing
      if (command.includes('scroll')) {
        this.handleScrollCommands(command);
      } else if (command.startsWith('click ')) {
        this.clickElement(command.replace('click ', ''));
      } else if (command.startsWith('type ')) {
        this.typeIntoField(command);
      } else if (command.startsWith('select ')) {
        this.selectFromDropdown(command);
      } else if (command.includes('go to') || command.includes('open') || command.includes('navigate')) {
        this.navigateToAdvanced(command);
      } else if (command.includes('form')) {
        this.handleAdvancedFormActions(command);
      } else if (command.includes('submit')) {
        this.submitForm();
      } else if (command.includes('clear')) {
        this.clearField(command);
      } else if (command.includes('focus')) {
        this.focusElement(command.replace('focus ', ''));
      } else if (command.includes('refresh') || command.includes('back') || command.includes('forward') || command.includes('print') || command.includes('fullscreen')) {
        this.handlePageInteractions(command);
      } else if (command.includes('tab') || command.includes('next field') || command.includes('previous field')) {
        this.handleAdvancedFormActions(command);
      } else {
        this.showStatus('❓ Unknown', 'error');
      }
    } catch (error) {
      console.error('Error executing enhanced command:', error);
      this.showStatus('❌ Error', 'error');
    }
  }

  // Scrolling functions
  handleScrollCommands(command) {
    if (command.includes('scroll down')) {
      this.scrollDown();
    } else if (command.includes('scroll up')) {
      this.scrollUp();
    } else if (command.includes('scroll to top')) {
      this.scrollToTop();
    } else if (command.includes('scroll to bottom')) {
      this.scrollToBottom();
    }
  }

  scrollDown() {
    window.scrollBy({ top: 300, behavior: 'smooth' });
    this.showStatus('↓ Scrolled', 'success');
  }

  scrollUp() {
    window.scrollBy({ top: -300, behavior: 'smooth' });
    this.showStatus('↑ Scrolled', 'success');
  }

  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.showStatus('⬆️ Top', 'success');
  }

  scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    this.showStatus('⬇️ Bottom', 'success');
  }

  // Enhanced click function
  clickElement(targetText) {
    const selectors = [
      'button', 'a', 'input[type="button"]', 'input[type="submit"]', 
      '[role="button"]', '.btn', '.button', '[onclick]'
    ];
    
    const elements = document.querySelectorAll(selectors.join(', '));
    let found = false;

    for (let element of elements) {
      const text = this.getElementText(element);
      if (text.toLowerCase().includes(targetText.toLowerCase())) {
        this.highlightElement(element, 'success');
        element.click();
        this.showStatus(`✅ Clicked`, 'success');
        found = true;
        break;
      }
    }

    if (!found) {
      this.showStatus(`❌ Not found`, 'error');
    }
  }

  // Type into input fields
  typeIntoField(command) {
    // Parse command: "type [text] into [field]" or "type [text] in [field]"
    const typeMatch = command.match(/type\s+["']?([^"']+?)["']?\s+(?:into|in)\s+(.+)/i);
    
    if (!typeMatch) {
      this.showStatus('❌ Invalid format', 'error');
      return;
    }

    let textToType = typeMatch[1];
    const fieldIdentifier = typeMatch[2];

    // Check if this is an OTP field and clean the text
    if (this.isOTPField(fieldIdentifier)) {
      textToType = textToType.replace(/\s+/g, '');
    }

    const inputElement = this.findInputField(fieldIdentifier);
    
    if (inputElement) {
      this.highlightElement(inputElement, 'success');
      inputElement.focus();
      inputElement.value = textToType;
      
      // Trigger input events
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      inputElement.dispatchEvent(new Event('change', { bubbles: true }));
      
      this.showStatus(`✅ Typed`, 'success');
    } else {
      this.showStatus(`❌ Field not found`, 'error');
    }
  }

  // Find input field by various attributes
  findInputField(identifier) {
    const selectors = [
      'input[type="text"]', 'input[type="email"]', 'input[type="password"]',
      'input[type="search"]', 'input[type="url"]', 'input[type="tel"]',
      'input[type="number"]', 'textarea', 'input:not([type])'
    ];

    const elements = document.querySelectorAll(selectors.join(', '));
    
    for (let element of elements) {
      // Check placeholder, name, id, label, aria-label
      const placeholder = element.placeholder?.toLowerCase() || '';
      const name = element.name?.toLowerCase() || '';
      const id = element.id?.toLowerCase() || '';
      const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';
      
      // Check associated label
      let labelText = '';
      if (element.id) {
        const label = document.querySelector(`label[for="${element.id}"]`);
        labelText = label?.textContent?.toLowerCase() || '';
      }
      
      const identifierLower = identifier.toLowerCase();
      
      if (placeholder.includes(identifierLower) || 
          name.includes(identifierLower) || 
          id.includes(identifierLower) || 
          ariaLabel.includes(identifierLower) || 
          labelText.includes(identifierLower)) {
        return element;
      }
    }
    
    return null;
  }

  // Check if field is an OTP field
  isOTPField(fieldIdentifier) {
    const otpKeywords = ['otp', 'code', 'verification', 'pin', 'token', 'auth'];
    const identifier = fieldIdentifier.toLowerCase();
    return otpKeywords.some(keyword => identifier.includes(keyword));
  }

  // Select from dropdown
  selectFromDropdown(command) {
    // Parse command: "select [option] from [dropdown]"
    const selectMatch = command.match(/select\s+["']?([^"']+?)["']?\s+from\s+(.+)/i);
    
    if (!selectMatch) {
      this.showStatus('❌ Invalid format', 'error');
      return;
    }

    const optionText = selectMatch[1];
    const dropdownIdentifier = selectMatch[2];

    const selectElement = this.findSelectElement(dropdownIdentifier);
    
    if (selectElement) {
      const option = this.findOptionInSelect(selectElement, optionText);
      
      if (option) {
        this.highlightElement(selectElement, 'success');
        selectElement.value = option.value;
        selectElement.dispatchEvent(new Event('change', { bubbles: true }));
        this.showStatus(`✅ Selected`, 'success');
      } else {
        this.showStatus(`❌ Option not found`, 'error');
      }
    } else {
      this.showStatus(`❌ Dropdown not found`, 'error');
    }
  }

  // Find select element
  findSelectElement(identifier) {
    const selects = document.querySelectorAll('select');
    
    for (let select of selects) {
      const name = select.name?.toLowerCase() || '';
      const id = select.id?.toLowerCase() || '';
      const ariaLabel = select.getAttribute('aria-label')?.toLowerCase() || '';
      
      // Check associated label
      let labelText = '';
      if (select.id) {
        const label = document.querySelector(`label[for="${select.id}"]`);
        labelText = label?.textContent?.toLowerCase() || '';
      }
      
      const identifierLower = identifier.toLowerCase();
      
      if (name.includes(identifierLower) || 
          id.includes(identifierLower) || 
          ariaLabel.includes(identifierLower) || 
          labelText.includes(identifierLower)) {
        return select;
      }
    }
    
    return null;
  }

  // Find option in select element
  findOptionInSelect(selectElement, optionText) {
    const options = selectElement.querySelectorAll('option');
    
    for (let option of options) {
      if (option.textContent.toLowerCase().includes(optionText.toLowerCase()) ||
          option.value.toLowerCase().includes(optionText.toLowerCase())) {
        return option;
      }
    }
    
    return null;
  }

  // Advanced navigation with better URL handling
  navigateToAdvanced(command) {
    const patterns = [
      /(?:go to|open|navigate to|visit)\s+(.+)/i,
      /(?:click|open)\s+link\s+(.+)/i
    ];
    
    let linkIdentifier = null;
    for (const pattern of patterns) {
      const match = command.match(pattern);
      if (match) {
        linkIdentifier = match[1];
        break;
      }
    }
    
    if (!linkIdentifier) {
      this.showStatus('❌ Invalid format', 'error');
      return;
    }

    // Handle different types of navigation
    if (this.isURL(linkIdentifier)) {
      this.navigateToURL(linkIdentifier);
    } else if (linkIdentifier.includes('@')) {
      this.navigateToEmail(linkIdentifier);
    } else {
      this.navigateToLinkByText(linkIdentifier);
    }
  }

  isURL(text) {
    const urlPatterns = [
      /^https?:\/\//i,
      /^www\./i,
      /\.(com|org|net|edu|gov|mil|int|co|io|ly|me|tv|info|biz|name|mobi|tel|travel|museum|aero|coop|jobs|post|pro|xxx)$/i
    ];
    
    return urlPatterns.some(pattern => pattern.test(text)) || 
           (text.includes('.') && !text.includes(' ') && text.length > 3);
  }

  navigateToURL(url) {
    let fullURL = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      fullURL = 'https://' + url;
    }
    
    try {
      window.location.href = fullURL;
      this.showStatus(`🌐 Navigating`, 'success');
    } catch (error) {
      this.showStatus(`❌ Nav error`, 'error');
    }
  }

  navigateToEmail(email) {
    const mailtoLink = `mailto:${email}`;
    window.location.href = mailtoLink;
    this.showStatus(`📧 Email`, 'success');
  }

  navigateToLinkByText(linkText) {
    const links = document.querySelectorAll('a[href]');
    const searchText = linkText.toLowerCase();
    let bestMatch = null;
    let bestScore = 0;

    for (let link of links) {
      const linkContent = this.getElementText(link).toLowerCase();
      const href = link.href.toLowerCase();
      const title = (link.title || '').toLowerCase();
      
      // Calculate match score
      let score = 0;
      if (linkContent === searchText) score = 100;
      else if (linkContent.includes(searchText)) score = 80;
      else if (href.includes(searchText)) score = 60;
      else if (title.includes(searchText)) score = 40;
      else if (this.fuzzyMatch(linkContent, searchText)) score = 30;
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = link;
      }
    }

    if (bestMatch && bestScore > 25) {
      this.highlightElement(bestMatch, 'success');
      bestMatch.click();
      this.showStatus(`🔗 Opening`, 'success');
    } else {
      this.showStatus(`❌ Link not found`, 'error');
    }
  }

  fuzzyMatch(text1, text2) {
    const words1 = text1.split(/\s+/);
    const words2 = text2.split(/\s+/);
    
    for (let word2 of words2) {
      if (word2.length > 2) {
        for (let word1 of words1) {
          if (word1.includes(word2) || word2.includes(word1)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // Form handling functions
  submitForm() {
    const forms = document.querySelectorAll('form');
    if (forms.length === 1) {
      forms[0].submit();
      this.showStatus('✅ Form submitted', 'success');
    } else if (forms.length > 1) {
      // Try to find the most likely form to submit
      const submitButtons = document.querySelectorAll('input[type="submit"], button[type="submit"]');
      if (submitButtons.length > 0) {
        submitButtons[0].click();
        this.showStatus('✅ Form submitted', 'success');
      } else {
        this.showStatus('❌ Multiple forms found', 'error');
      }
    } else {
      this.showStatus('❌ No form found', 'error');
    }
  }

  clearField(command) {
    const fieldMatch = command.match(/clear\s+(?:field\s+)?(.+)/i);
    if (!fieldMatch) {
      this.showStatus('❌ Invalid format', 'error');
      return;
    }

    const fieldIdentifier = fieldMatch[1];
    const inputElement = this.findInputField(fieldIdentifier);
    
    if (inputElement) {
      this.highlightElement(inputElement, 'success');
      inputElement.focus();
      inputElement.value = '';
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      inputElement.dispatchEvent(new Event('change', { bubbles: true }));
      this.showStatus('✅ Cleared', 'success');
    } else {
      this.showStatus('❌ Field not found', 'error');
    }
  }

  focusElement(targetText) {
    const inputElement = this.findInputField(targetText);
    
    if (inputElement) {
      this.highlightElement(inputElement, 'success');
      inputElement.focus();
      this.showStatus('✅ Focused', 'success');
    } else {
      this.showStatus('❌ Element not found', 'error');
    }
  }

  handlePageInteractions(command) {
    if (command.includes('refresh')) {
      location.reload();
      this.showStatus('🔄 Refreshing', 'success');
    } else if (command.includes('back')) {
      history.back();
      this.showStatus('⬅️ Going back', 'success');
    } else if (command.includes('forward')) {
      history.forward();
      this.showStatus('➡️ Going forward', 'success');
    } else if (command.includes('print')) {
      window.print();
      this.showStatus('🖨️ Printing', 'success');
    } else if (command.includes('fullscreen')) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
        this.showStatus('⛶ Fullscreen', 'success');
      }
    }
  }

  handleAdvancedFormActions(command) {
    if (command.includes('tab') || command.includes('next field')) {
      // Simulate tab key
      const activeElement = document.activeElement;
      if (activeElement) {
        const event = new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9 });
        activeElement.dispatchEvent(event);
        this.showStatus('⭾ Next field', 'success');
      }
    } else if (command.includes('previous field')) {
      // Simulate shift+tab
      const activeElement = document.activeElement;
      if (activeElement) {
        const event = new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, shiftKey: true });
        activeElement.dispatchEvent(event);
        this.showStatus('⭾ Previous field', 'success');
      }
    }
  }

  // Utility functions
  getElementText(element) {
    return element.textContent || element.innerText || element.value || element.alt || element.title || '';
  }

  highlightElement(element, type = 'highlight') {
    this.clearHighlights();
    element.classList.add(`voice-nav-${type}`);
    this.lastHighlightedElement = element;
    
    // Auto-remove highlight after 2 seconds
    setTimeout(() => {
      if (this.lastHighlightedElement === element) {
        this.clearHighlights();
      }
    }, 2000);
  }

  clearHighlights() {
    if (this.lastHighlightedElement) {
      this.lastHighlightedElement.classList.remove('voice-nav-highlight', 'voice-nav-success', 'voice-nav-error');
      this.lastHighlightedElement = null;
    }
  }
}

// Initialize voice navigator when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new VoiceNavigator();
  });
} else {
  new VoiceNavigator();
}


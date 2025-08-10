// Enhanced Voice Navigator Content Script with Floating Popup
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
    this.init();
  }

  init() {
    // Listen for messages from popup and background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open
    });

    // Add visual feedback styles
    this.addStyles();
    
    // Get initial state from background script
    this.initializeFromBackground();
    
    console.log('Enhanced Voice Navigator initialized');
  }

  async initializeFromBackground() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getGlobalState' });
      if (response.success) {
        this.globalState = response.state;
        if (this.globalState.floatingPopupEnabled) {
          this.createFloatingPopup();
          if (this.globalState.isListening) {
            this.startListening();
          }
        }
      }
    } catch (error) {
      console.log('Could not get global state, using defaults:', error);
      this.createFloatingPopup();
    }
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.action) {
        case 'initializeWithState':
          this.globalState = message.state;
          if (message.state.floatingPopupEnabled) {
            this.createFloatingPopup();
            if (message.state.isListening) {
              setTimeout(() => this.startListening(), 500);
            }
          }
          sendResponse({ success: true });
          break;

        case 'globalStateChanged':
          this.handleGlobalStateChange(message.state);
          sendResponse({ success: true });
          break;

        case 'stopListening':
          this.stopListening();
          sendResponse({ success: true });
          break;

        case 'toggleFloatingPopup':
          this.toggleFloatingPopup();
          sendResponse({ success: true });
          break;

        case 'command':
          this.handleCommand(message.command);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  handleGlobalStateChange(newState) {
    this.globalState = newState;
    
    if (newState.floatingPopupEnabled && !this.floatingPopup) {
      this.createFloatingPopup();
    } else if (!newState.floatingPopupEnabled && this.floatingPopup) {
      this.removeFloatingPopup();
    }

    if (this.floatingPopup) {
      this.updateFloatingPopupState();
    }
  }

  removeFloatingPopup() {
    if (this.floatingPopup) {
      this.floatingPopup.remove();
      this.floatingPopup = null;
    }
    if (this.recognition) {
      this.recognition.stop();
    }
  }

  updateFloatingPopupState() {
    // Update the floating popup UI based on global state
    if (!this.floatingPopup) return;
    
    const isListening = this.isListening || (this.globalState?.isListening && this.globalState?.listeningTabId === this.getTabId());
    const startBtn = this.floatingPopup.querySelector('#voice-nav-start-btn');
    const btnText = this.floatingPopup.querySelector('#voice-nav-btn-text');
    
    if (startBtn && btnText) {
      startBtn.classList.toggle('listening', isListening);
      btnText.textContent = isListening ? 'Stop' : 'Listen';
    }
  }

  getTabId() {
    // This is a simplified way to get tab context
    return Date.now(); // Placeholder - in real implementation this would be passed from background
  }

  async loadPopupState() {
    try {
      const result = await chrome.storage.local.get(['floatingPopupEnabled', 'popupPosition']);
      if (result.floatingPopupEnabled !== false) { // Default to enabled
        this.createFloatingPopup(result.popupPosition);
      }
    } catch (error) {
      console.log('Storage not available, creating default popup');
      this.createFloatingPopup();
    }
  }

  async savePopupState(enabled, position = null) {
    try {
      const data = { floatingPopupEnabled: enabled };
      if (position) {
        data.popupPosition = position;
      }
      await chrome.storage.local.set(data);
    } catch (error) {
      console.log('Could not save popup state:', error);
    }
  }

  createFloatingPopup(position = null) {
    if (this.floatingPopup) {
      this.floatingPopup.remove();
    }

    // Create floating popup container
    this.floatingPopup = document.createElement('div');
    this.floatingPopup.id = 'voice-nav-floating-popup';
    this.floatingPopup.className = 'voice-nav-floating-popup';
    
    // Set position
    const defaultPosition = { x: 20, y: 20 };
    const popupPosition = position || defaultPosition;
    
    this.floatingPopup.style.cssText = `
      position: fixed;
      top: ${popupPosition.y}px;
      left: ${popupPosition.x}px;
      width: 180px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 10px;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 10000;
      user-select: none;
      transition: all 0.3s ease;
      font-size: 12px;
    `;

    // Create popup content
    this.floatingPopup.innerHTML = `
      <div class="voice-nav-header" style="
        padding: 8px 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        cursor: move;
        display: flex;
        justify-content: space-between;
        align-items: center;
      ">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 14px;">🎤</span>
          <span style="font-size: 12px; font-weight: 600;">Voice Nav</span>
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
          ">−</button>
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
          ">×</button>
        </div>
      </div>
      <div id="voice-nav-content" style="padding: 12px;">
        <div style="display: flex; gap: 6px; margin-bottom: 10px;">
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
            gap: 4px;
            flex: 1;
          ">
            <span style="font-size: 12px;">🎤</span>
            <span id="voice-nav-btn-text">Listen</span>
          </button>
          <button id="voice-nav-help-btn" style="
            padding: 8px;
            border: none;
            border-radius: 6px;
            font-size: 11px;
            cursor: pointer;
            background: rgba(255, 255, 255, 0.1);
            color: white;
            transition: all 0.2s ease;
            width: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
          " title="Commands">❓</button>
        </div>
        <div id="voice-nav-status" style="
          background: rgba(255, 255, 255, 0.1);
          padding: 6px 8px;
          border-radius: 4px;
          font-size: 10px;
          line-height: 1.2;
          backdrop-filter: blur(10px);
          margin-bottom: 8px;
        ">
          Ready for voice commands
        </div>
        <div id="voice-nav-commands" style="
          background: rgba(255, 255, 255, 0.1);
          padding: 8px;
          border-radius: 4px;
          backdrop-filter: blur(10px);
          display: none;
        ">
          <div style="font-size: 9px; line-height: 1.3; opacity: 0.9;">
            <strong>Commands:</strong><br>
            • "scroll up/down"<br>
            • "click [text]"<br>
            • "type [text] into [field]"<br>
            • "go to [link]"<br>
            • "submit form"
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
    const minimizeBtn = this.floatingPopup.querySelector('#voice-nav-minimize');
    const closeBtn = this.floatingPopup.querySelector('#voice-nav-close');
    const content = this.floatingPopup.querySelector('#voice-nav-content');
    const commands = this.floatingPopup.querySelector('#voice-nav-commands');

    // Drag functionality
    header.addEventListener('mousedown', (e) => this.startDrag(e));
    header.addEventListener('touchstart', (e) => this.startDrag(e.touches[0]), { passive: false });

    // Double-tap to minimize (mobile)
    let lastTap = 0;
    header.addEventListener('touchend', (e) => {
      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTap;
      if (tapLength < 500 && tapLength > 0) {
        // Double tap detected
        const isMinimized = content.style.display === 'none';
        content.style.display = isMinimized ? 'block' : 'none';
        minimizeBtn.textContent = isMinimized ? '−' : '+';
        this.floatingPopup.style.width = isMinimized ? '180px' : 'auto';
        e.preventDefault();
      }
      lastTap = currentTime;
    });

    // Voice control buttons
    startBtn.addEventListener('click', async () => {
      if (this.isListening || this.continuousListening) {
        // Stop continuous listening
        await chrome.runtime.sendMessage({ action: 'stopListening' });
        this.shouldStopListening = true;
        this.continuousListening = false;
        if (this.recognition) {
          this.recognition.stop();
        }
      } else {
        // Start listening
        await chrome.runtime.sendMessage({ action: 'startListening' });
        this.startListening();
      }
    });

    helpBtn.addEventListener('click', () => {
      const isVisible = commands.style.display !== 'none';
      commands.style.display = isVisible ? 'none' : 'block';
      helpBtn.innerHTML = isVisible ? 
        '<span style="margin-right: 6px;">❓</span><span>Show Commands</span>' : 
        '<span style="margin-right: 6px;">❌</span><span>Hide Commands</span>';
    });

    // Minimize/maximize
    minimizeBtn.addEventListener('click', () => {
      const isMinimized = content.style.display === 'none';
      content.style.display = isMinimized ? 'block' : 'none';
      minimizeBtn.textContent = isMinimized ? '−' : '+';
      this.floatingPopup.style.width = isMinimized ? '180px' : 'auto';
    });

    // Close popup
    closeBtn.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ 
        action: 'updateGlobalState', 
        state: { floatingPopupEnabled: false } 
      });
    });

    // Hover effects for desktop
    startBtn.addEventListener('mouseenter', () => {
      startBtn.style.background = 'rgba(255, 255, 255, 0.3)';
      startBtn.style.transform = 'translateY(-1px)';
    });
    
    startBtn.addEventListener('mouseleave', () => {
      startBtn.style.background = 'rgba(255, 255, 255, 0.2)';
      startBtn.style.transform = 'translateY(0)';
    });

    helpBtn.addEventListener('mouseenter', () => {
      helpBtn.style.background = 'rgba(255, 255, 255, 0.2)';
    });
    
    helpBtn.addEventListener('mouseleave', () => {
      helpBtn.style.background = 'rgba(255, 255, 255, 0.1)';
    });

    // Touch feedback for mobile
    [startBtn, helpBtn, minimizeBtn, closeBtn].forEach(btn => {
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
    
    // Snap to edges if close (within 20px)
    const snapDistance = 20;
    
    // Snap to left edge
    if (boundedX < snapDistance) {
      boundedX = 0;
      this.showSnapFeedback('left');
    }
    // Snap to right edge
    else if (boundedX > maxX - snapDistance) {
      boundedX = maxX;
      this.showSnapFeedback('right');
    }
    
    // Snap to top edge
    if (boundedY < snapDistance) {
      boundedY = 0;
      this.showSnapFeedback('top');
    }
    // Snap to bottom edge
    else if (boundedY > maxY - snapDistance) {
      boundedY = maxY;
      this.showSnapFeedback('bottom');
    }
    
    this.floatingPopup.style.left = boundedX + 'px';
    this.floatingPopup.style.top = boundedY + 'px';
  }

  showSnapFeedback(edge) {
    // Add visual feedback for snapping
    this.floatingPopup.style.boxShadow = '0 8px 32px rgba(66, 133, 244, 0.5)';
    setTimeout(() => {
      this.floatingPopup.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.3)';
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
    chrome.runtime.sendMessage({
      action: 'updateGlobalState',
      state: { popupPosition: { x: rect.left, y: rect.top } }
    });
  }

  toggleFloatingPopup() {
    if (this.floatingPopup) {
      this.removeFloatingPopup();
    } else {
      this.createFloatingPopup();
    }
  }

  setupSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      this.showStatus("❌ Speech recognition not supported in this browser", "error");
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
      this.showStatus("❌ Speech recognition not available", "error");
      return;
    }
    
    try {
      this.recognition.start();
    } catch (error) {
      console.error('Error starting recognition:', error);
      this.showStatus("❌ Error starting speech recognition", "error");
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
      btnText.textContent = this.continuousListening ? 'Stop Listening' : 'Listening...';
    }
    
    const statusMessage = this.continuousListening ? 
      "🎙️ Continuous listening active... Speak your command" : 
      "🎙️ Listening... Speak your command";
    this.showStatus(statusMessage, "listening");
  }

  onSpeechResult(event) {
    const command = event.results[event.results.length - 1][0].transcript;
    const confidence = event.results[event.results.length - 1][0].confidence;
    
    this.commandHistory.push({
      command: command,
      confidence: confidence,
      timestamp: new Date()
    });

    this.showStatus(`✅ Heard: "${command}" (${Math.round(confidence * 100)}% confidence)`, "success");
    
    // Check for stop listening command
    if (command.toLowerCase().trim().includes('stop listening')) {
      this.shouldStopListening = true;
      this.continuousListening = false;
      this.showStatus("🛑 Stopping voice recognition", "info");
      this.recognition.stop();
      return;
    }
    
    // Process the command
    this.handleCommand(command);
    
    // Enable continuous listening after first command
    if (!this.continuousListening) {
      this.continuousListening = true;
      this.showStatus("🔄 Continuous listening enabled. Say 'stop listening' to stop.", "info");
    }
  }

  onSpeechError(event) {
    console.error('Speech recognition error:', event.error);
    
    let errorMessage = "❌ ";
    switch (event.error) {
      case 'no-speech':
        errorMessage += "No speech detected. Try again.";
        break;
      case 'audio-capture':
        errorMessage += "Microphone not accessible.";
        break;
      case 'not-allowed':
        errorMessage += "Microphone permission denied.";
        break;
      case 'network':
        errorMessage += "Network error occurred.";
        break;
      default:
        errorMessage += `Speech recognition error: ${event.error}`;
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
        btnText.textContent = 'Start Listening';
      }
      
      this.showStatus("⏹️ Voice recognition stopped. Click 'Start Listening' or say 'start listening' to resume.", "stopped");
      return;
    }
    
    // If in continuous listening mode, restart automatically after a brief pause
    if (this.continuousListening) {
      setTimeout(() => {
        if (this.continuousListening && !this.shouldStopListening) {
          this.startListening();
        }
      }, 1000); // 1 second pause between commands
      
      this.showStatus("🎙️ Ready for next command... (say 'stop listening' to stop)", "listening");
    } else {
      // First time or manual stop
      if (startBtn) {
        startBtn.classList.remove('listening');
        startBtn.style.animation = '';
        btnText.textContent = 'Start Listening';
      }
      
      this.showStatus("⏹️ Stopped listening", "stopped");
    }
  }

  showStatus(message, type = "info") {
    const status = this.floatingPopup?.querySelector('#voice-nav-status');
    if (status) {
      status.textContent = message;
      status.className = `voice-nav-status ${type}`;
      
      // Auto-clear success messages after 3 seconds
      if (type === "success") {
        setTimeout(() => {
          if (status.textContent === message) {
            this.showStatus("Ready for next command", "ready");
          }
        }, 3000);
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
        this.showFeedback('Command not recognized: ' + command, 'error');
        this.suggestCommands();
      }
    } catch (error) {
      console.error('Error executing enhanced command:', error);
      this.showFeedback('Error executing command: ' + error.message, 'error');
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
    this.showStatus('Scrolled down', 'success');
  }

  scrollUp() {
    window.scrollBy({ top: -300, behavior: 'smooth' });
    this.showStatus('Scrolled up', 'success');
  }

  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.showStatus('Scrolled to top', 'success');
  }

  scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    this.showStatus('Scrolled to bottom', 'success');
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
        this.showStatus(`Clicked: ${text}`, 'success');
        found = true;
        break;
      }
    }

    if (!found) {
      this.showStatus(`Could not find clickable element: "${targetText}"`, 'error');
    }
  }

  // Type into input fields
  typeIntoField(command) {
    // Parse command: "type [text] into [field]" or "type [text] in [field]"
    const typeMatch = command.match(/type\s+["']?([^"']+?)["']?\s+(?:into|in)\s+(.+)/i);
    
    if (!typeMatch) {
      this.showStatus('Invalid type command format. Use: "type [text] into [field]"', 'error');
      return;
    }

    let textToType = typeMatch[1];
    const fieldIdentifier = typeMatch[2];

    // Check if this is an OTP field and clean the text
    if (this.isOTPField(fieldIdentifier)) {
      textToType = textToType.replace(/\s+/g, '');
      this.showStatus(`Cleaned OTP text: "${textToType}"`, 'info');
    }

    const inputElement = this.findInputField(fieldIdentifier);
    
    if (inputElement) {
      this.highlightElement(inputElement, 'success');
      inputElement.focus();
      inputElement.value = textToType;
      
      // Trigger input events
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      inputElement.dispatchEvent(new Event('change', { bubbles: true }));
      
      this.showStatus(`Typed "${textToType}" into ${fieldIdentifier}`, 'success');
    } else {
      this.showStatus(`Could not find input field: "${fieldIdentifier}"`, 'error');
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
    const otpKeywords = ['otp', 'code', 'verification', 'pin', 'token'];
    const identifier = fieldIdentifier.toLowerCase();
    return otpKeywords.some(keyword => identifier.includes(keyword));
  }

  // Select from dropdown
  selectFromDropdown(command) {
    // Parse command: "select [option] from [dropdown]"
    const selectMatch = command.match(/select\s+["']?([^"']+?)["']?\s+from\s+(.+)/i);
    
    if (!selectMatch) {
      this.showStatus('Invalid select command format. Use: "select [option] from [dropdown]"', 'error');
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
        this.showStatus(`Selected "${optionText}" from ${dropdownIdentifier}`, 'success');
      } else {
        this.showStatus(`Could not find option "${optionText}" in dropdown`, 'error');
      }
    } else {
      this.showStatus(`Could not find dropdown: "${dropdownIdentifier}"`, 'error');
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
      this.showStatus('Invalid navigation command format', 'error');
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
      /\.(com|org|net|edu|gov|mil|int|co|io|ly|me|tv|info|biz|name|mobi|tel|travel|museum|aero|coop|jobs|post|pro|xxx|ac|ad|ae|af|ag|ai|al|am|an|ao|aq|ar|as|at|au|aw|ax|az|ba|bb|bd|be|bf|bg|bh|bi|bj|bm|bn|bo|br|bs|bt|bv|bw|by|bz|ca|cc|cd|cf|cg|ch|ci|ck|cl|cm|cn|co|cr|cs|cu|cv|cx|cy|cz|de|dj|dk|dm|do|dz|ec|ee|eg|eh|er|es|et|eu|fi|fj|fk|fm|fo|fr|ga|gb|gd|ge|gf|gg|gh|gi|gl|gm|gn|gp|gq|gr|gs|gt|gu|gw|gy|hk|hm|hn|hr|ht|hu|id|ie|il|im|in|io|iq|ir|is|it|je|jm|jo|jp|ke|kg|kh|ki|km|kn|kp|kr|kw|ky|kz|la|lb|lc|li|lk|lr|ls|lt|lu|lv|ly|ma|mc|md|me|mg|mh|mk|ml|mm|mn|mo|mp|mq|mr|ms|mt|mu|mv|mw|mx|my|mz|na|nc|ne|nf|ng|ni|nl|no|np|nr|nu|nz|om|pa|pe|pf|pg|ph|pk|pl|pm|pn|pr|ps|pt|pw|py|qa|re|ro|rs|ru|rw|sa|sb|sc|sd|se|sg|sh|si|sj|sk|sl|sm|sn|so|sr|st|su|sv|sy|sz|tc|td|tf|tg|th|tj|tk|tl|tm|tn|to|tp|tr|tt|tv|tw|tz|ua|ug|uk|um|us|uy|uz|va|vc|ve|vg|vi|vn|vu|wf|ws|ye|yt|yu|za|zm|zw)$/i
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
      this.showStatus(`Navigating to ${fullURL}`, 'success');
    } catch (error) {
      this.showStatus(`Error navigating to ${fullURL}: ${error.message}`, 'error');
    }
  }

  navigateToEmail(email) {
    const mailtoLink = `mailto:${email}`;
    window.location.href = mailtoLink;
    this.showStatus(`Opening email to ${email}`, 'success');
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
      this.showStatus(`Opening: ${this.getElementText(bestMatch)}`, 'success');
    } else {
      this.showStatus(`Could not find link: "${linkText}"`, 'error');
      this.suggestAlternatives(linkText);
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

  suggestAlternatives(searchText) {
    const links = document.querySelectorAll('a[href]');
    const suggestions = [];
    
    for (let link of links) {
      const linkText = this.getElementText(link);
      if (linkText.length > 0 && linkText.length < 50) {
        suggestions.push(linkText);
      }
    }
    
    if (suggestions.length > 0) {
      const uniqueSuggestions = [...new Set(suggestions)].slice(0, 5);
      console.log('Available links:', uniqueSuggestions);
      this.showStatus(`Available links: ${uniqueSuggestions.join(', ')}`, 'info');
    }
  }

  // Submit form
  submitForm() {
    const forms = document.querySelectorAll('form');
    
    if (forms.length === 1) {
      forms[0].submit();
      this.showStatus('Form submitted', 'success');
    } else if (forms.length > 1) {
      this.showStatus('Multiple forms found. Please be more specific.', 'error');
    } else {
      // Look for submit buttons
      const submitButtons = document.querySelectorAll('input[type="submit"], button[type="submit"], button:not([type])');
      if (submitButtons.length > 0) {
        submitButtons[0].click();
        this.showStatus('Submit button clicked', 'success');
      } else {
        this.showStatus('No forms or submit buttons found', 'error');
      }
    }
  }

  // Clear field
  clearField(command) {
    const fieldMatch = command.match(/clear\s+(?:field|input)\s*(.+)?/i);
    const fieldIdentifier = fieldMatch?.[1] || '';

    if (fieldIdentifier) {
      const inputElement = this.findInputField(fieldIdentifier);
      if (inputElement) {
        this.highlightElement(inputElement, 'success');
        inputElement.value = '';
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));
        this.showStatus(`Cleared field: ${fieldIdentifier}`, 'success');
      } else {
        this.showStatus(`Could not find field: "${fieldIdentifier}"`, 'error');
      }
    } else {
      // Clear focused element
      const focused = document.activeElement;
      if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) {
        focused.value = '';
        focused.dispatchEvent(new Event('input', { bubbles: true }));
        focused.dispatchEvent(new Event('change', { bubbles: true }));
        this.showStatus('Cleared focused field', 'success');
      } else {
        this.showStatus('No field to clear', 'error');
      }
    }
  }

  // Focus element
  focusElement(targetText) {
    const inputElement = this.findInputField(targetText);
    if (inputElement) {
      this.highlightElement(inputElement, 'success');
      inputElement.focus();
      this.showStatus(`Focused: ${targetText}`, 'success');
    } else {
      this.showStatus(`Could not find field: "${targetText}"`, 'error');
    }
  }

  // Handle advanced form actions
  handleAdvancedFormActions(command) {
    if (command.includes('next field') || command.includes('tab')) {
      this.focusNextField();
    } else if (command.includes('previous field')) {
      this.focusPreviousField();
    } else if (command.includes('fill form')) {
      this.fillFormAutomatically();
    }
  }

  focusNextField() {
    const focusableElements = document.querySelectorAll('input, textarea, select, button, [tabindex]:not([tabindex="-1"])');
    const currentIndex = Array.from(focusableElements).indexOf(document.activeElement);
    const nextIndex = (currentIndex + 1) % focusableElements.length;
    focusableElements[nextIndex].focus();
    this.showStatus('Focused next field', 'success');
  }

  focusPreviousField() {
    const focusableElements = document.querySelectorAll('input, textarea, select, button, [tabindex]:not([tabindex="-1"])');
    const currentIndex = Array.from(focusableElements).indexOf(document.activeElement);
    const prevIndex = currentIndex === 0 ? focusableElements.length - 1 : currentIndex - 1;
    focusableElements[prevIndex].focus();
    this.showStatus('Focused previous field', 'success');
  }

  // Handle page interactions
  handlePageInteractions(command) {
    if (command.includes('refresh')) {
      window.location.reload();
      this.showStatus('Page refreshed', 'success');
    } else if (command.includes('back')) {
      window.history.back();
      this.showStatus('Navigated back', 'success');
    } else if (command.includes('forward')) {
      window.history.forward();
      this.showStatus('Navigated forward', 'success');
    } else if (command.includes('print')) {
      window.print();
      this.showStatus('Print dialog opened', 'success');
    } else if (command.includes('fullscreen')) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
        this.showStatus('Exited fullscreen', 'success');
      } else {
        document.documentElement.requestFullscreen();
        this.showStatus('Entered fullscreen', 'success');
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

  showFeedback(message, type = 'info') {
    this.showStatus(message, type);
    console.log(`Voice Navigator: ${message}`);
  }

  suggestCommands() {
    const suggestions = [
      'Try: "scroll down", "click [button name]", "type [text] into [field]"',
      'Or: "go to [link]", "select [option] from [dropdown]", "submit form"'
    ];
    this.showStatus(suggestions.join(' '), 'info');
  }
}

// Initialize the voice navigator
const voiceNavigator = new VoiceNavigator();


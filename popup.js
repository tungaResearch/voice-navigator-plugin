// Enhanced Voice Navigator Popup Script
class VoiceNavigatorPopup {
  constructor() {
    this.isListening = false;
    this.recognition = null;
    this.commandHistory = [];
    this.floatingPopupEnabled = false;
    this.init();
  }

  init() {
    this.status = document.getElementById("status");
    this.startBtn = document.getElementById("startBtn");
    this.btnText = document.getElementById("btnText");
    this.helpBtn = document.getElementById("helpBtn");
    this.floatingBtn = document.getElementById("floatingBtn");
    this.commands = document.getElementById("commands");

    // Check if speech recognition is supported
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      this.showStatus("❌ Speech recognition not supported in this browser", "error");
      this.startBtn.disabled = true;
      return;
    }

    this.setupEventListeners();
    this.setupSpeechRecognition();
    this.loadFloatingPopupState();
    this.showStatus("Ready to listen for voice commands", "ready");
  }

  async loadFloatingPopupState() {
    try {
      const result = await chrome.storage.local.get(['floatingPopupEnabled']);
      this.floatingPopupEnabled = result.floatingPopupEnabled !== false; // Default to enabled
      this.updateFloatingPopupButton();
    } catch (error) {
      console.log('Storage not available');
      this.floatingPopupEnabled = true;
      this.updateFloatingPopupButton();
    }
  }

  updateFloatingPopupButton() {
    if (this.floatingBtn) {
      const btnText = this.floatingBtn.querySelector('span:last-child');
      const icon = this.floatingBtn.querySelector('.icon');
      
      if (this.floatingPopupEnabled) {
        btnText.textContent = 'Enabled';
        icon.textContent = '🎯';
        this.floatingBtn.style.background = 'rgba(52, 168, 83, 0.2)';
      } else {
        btnText.textContent = 'Disabled';
        icon.textContent = '⭕';
        this.floatingBtn.style.background = 'rgba(255, 255, 255, 0.1)';
      }
    }
  }

  async toggleFloatingPopup() {
    this.floatingPopupEnabled = !this.floatingPopupEnabled;
    
    // Save state
    try {
      await chrome.storage.local.set({ floatingPopupEnabled: this.floatingPopupEnabled });
    } catch (error) {
      console.log('Could not save floating popup state');
    }

    // Send message to content script to toggle popup and cleanup old ones
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'toggleFloatingPopup'
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error sending message:', chrome.runtime.lastError);
          }
        });
      }
    });

    this.updateFloatingPopupButton();
    
    const statusMessage = this.floatingPopupEnabled ? 
      '✅ Floating popup enabled' : 
      '❌ Floating popup disabled';
    this.showStatus(statusMessage, 'success');
  }

  setupEventListeners() {
    this.startBtn.addEventListener('click', () => {
      if (this.isListening) {
        this.stopListening();
      } else {
        this.startListening();
      }
    });

    this.helpBtn.addEventListener('click', () => {
      this.toggleCommands();
    });

    this.floatingBtn.addEventListener('click', () => {
      this.toggleFloatingPopup();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (this.isListening) {
          this.stopListening();
        } else {
          this.startListening();
        }
      } else if (e.key === 'h' || e.key === 'H') {
        this.toggleCommands();
      } else if (e.key === 'f' || e.key === 'F') {
        this.toggleFloatingPopup();
      }
    });

    // Cleanup when popup is closed
    window.addEventListener('beforeunload', () => {
      this.cleanup();
    });

    // Handle visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.cleanup();
      }
    });
  }

  cleanup() {
    // Stop speech recognition to free up microphone
    if (this.recognition && this.isListening) {
      this.recognition.stop();
    }
  }

  setupSpeechRecognition() {
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
    this.startBtn.classList.add('listening');
    this.btnText.textContent = 'Stop Listening';
    this.showStatus("🎙️ Listening... Speak your command", "listening");
  }

  onSpeechResult(event) {
    const command = event.results[0][0].transcript;
    const confidence = event.results[0][0].confidence;
    
    this.commandHistory.push({
      command: command,
      confidence: confidence,
      timestamp: new Date()
    });

    this.showStatus(`✅ Heard: "${command}" (${Math.round(confidence * 100)}%)`, "success");
    
    // Send command to content script
    this.sendCommandToContentScript(command);
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
    this.startBtn.classList.remove('listening');
    this.btnText.textContent = 'Start Listening';
    
    if (!this.status.textContent.startsWith("✅")) {
      this.showStatus("⏹️ Stopped listening", "stopped");
    }
  }

  sendCommandToContentScript(command) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { command: command }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error sending message:', chrome.runtime.lastError);
            this.showStatus("❌ Could not communicate with page", "error");
          }
        });
      }
    });
  }

  showStatus(message, type = "info") {
    this.status.textContent = message;
    this.status.className = `status ${type}`;
    
    // Auto-clear success messages after 3 seconds
    if (type === "success") {
      setTimeout(() => {
        if (this.status.textContent === message) {
          this.showStatus("Ready for next command", "ready");
        }
      }, 3000);
    }
  }

  toggleCommands() {
    const isVisible = this.commands.style.display !== 'none';
    this.commands.style.display = isVisible ? 'none' : 'block';
    
    const helpText = this.helpBtn.querySelector('span:last-child');
    helpText.textContent = isVisible ? 'Help' : 'Hide';
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new VoiceNavigatorPopup();
});


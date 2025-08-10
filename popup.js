// Enhanced Voice Navigator Popup Script
class VoiceNavigatorPopup {
  constructor() {
    this.isListening = false;
    this.recognition = null;
    this.commandHistory = [];
    this.floatingPopupEnabled = false;
    this.globalState = {};
    this.init();
  }

  init() {
    this.status = document.getElementById("status");
    this.startBtn = document.getElementById("startBtn");
    this.btnText = document.getElementById("btnText");
    this.helpBtn = document.getElementById("helpBtn");
    this.floatingBtn = document.getElementById("floatingBtn");
    this.floatingBtnText = document.getElementById("floatingBtnText");
    this.commands = document.getElementById("commands");

    // Check if speech recognition is supported
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      this.showStatus("❌ Speech recognition not supported in this browser", "error");
      this.startBtn.disabled = true;
      return;
    }

    this.setupEventListeners();
    this.setupSpeechRecognition();
    this.loadGlobalState();
    this.showStatus("Ready to listen for voice commands", "ready");
  }

  async loadGlobalState() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getGlobalState' });
      if (response.success) {
        this.globalState = response.state;
        this.floatingPopupEnabled = this.globalState.floatingPopupEnabled;
        this.isListening = this.globalState.isListening;
        this.updateUI();
      }
    } catch (error) {
      console.log('Could not load global state:', error);
      this.floatingPopupEnabled = true;
      this.updateUI();
    }
  }

  updateUI() {
    // Update floating popup button
    this.floatingBtnText.textContent = this.floatingPopupEnabled ? 'Enabled' : 'Disabled';
    this.floatingBtn.style.background = this.floatingPopupEnabled ? 
      'rgba(76, 175, 80, 0.3)' : 'rgba(255, 255, 255, 0.1)';
    
    // Update listening button
    this.btnText.textContent = this.isListening ? 'Stop Listening' : 'Start Listening';
    this.startBtn.classList.toggle('listening', this.isListening);
    
    // Update status
    if (this.isListening) {
      this.showStatus("🎤 Listening for voice commands...", "listening");
    } else {
      this.showStatus("Ready to listen for voice commands", "ready");
    }
  }

  setupEventListeners() {
    // Start/Stop listening button
    this.startBtn.addEventListener('click', async () => {
      if (this.isListening) {
        await chrome.runtime.sendMessage({ action: 'stopListening' });
      } else {
        await chrome.runtime.sendMessage({ action: 'startListening' });
      }
      // Reload state after action
      setTimeout(() => this.loadGlobalState(), 100);
    });

    // Floating popup toggle button
    this.floatingBtn.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ action: 'toggleFloatingPopup' });
      // Reload state after action
      setTimeout(() => this.loadGlobalState(), 100);
    });

    // Help button
    this.helpBtn.addEventListener('click', () => {
      const isVisible = this.commands.style.display !== 'none';
      this.commands.style.display = isVisible ? 'none' : 'block';
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        this.startBtn.click();
      } else if (e.key === 'h' || e.key === 'H') {
        this.helpBtn.click();
      } else if (e.key === 'f' || e.key === 'F') {
        this.floatingBtn.click();
      }
    });
  }

  setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    
    // Configure recognition for continuous listening
    this.recognition.lang = 'en-US';
    this.recognition.continuous = true;
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

  async startListening() {
    try {
      await chrome.runtime.sendMessage({ action: 'startListening' });
      this.recognition.start();
      setTimeout(() => this.loadGlobalState(), 100);
    } catch (error) {
      this.showStatus(`❌ Error starting speech recognition: ${error.message}`, "error");
    }
  }

  async stopListening() {
    try {
      await chrome.runtime.sendMessage({ action: 'stopListening' });
      if (this.recognition) {
        this.recognition.stop();
      }
      setTimeout(() => this.loadGlobalState(), 100);
    } catch (error) {
      this.showStatus(`❌ Error stopping speech recognition: ${error.message}`, "error");
    }
  }

  onListeningStart() {
    this.isListening = true;
    this.updateUI();
  }

  onListeningEnd() {
    this.isListening = false;
    this.updateUI();
  }

  onSpeechResult(event) {
    const result = event.results[event.results.length - 1];
    if (result.isFinal) {
      const command = result[0].transcript.trim().toLowerCase();
      this.commandHistory.push(command);
      this.showStatus(`🎤 Command: "${command}"`, "success");
      this.sendCommandToContentScript(command);
    }
  }

  onSpeechError(event) {
    console.error('Speech recognition error:', event.error);
    let errorMessage = "Speech recognition error";
    
    switch (event.error) {
      case 'no-speech':
        errorMessage = "No speech detected. Try speaking again.";
        break;
      case 'audio-capture':
        errorMessage = "Microphone not accessible. Check permissions.";
        break;
      case 'not-allowed':
        errorMessage = "Microphone permission denied.";
        break;
      case 'network':
        errorMessage = "Network error. Check your connection.";
        break;
      default:
        errorMessage = `Speech recognition error: ${event.error}`;
    }
    
    this.showStatus(`❌ ${errorMessage}`, "error");
  }

  async sendCommandToContentScript(command) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { action: 'command', command: command });
    } catch (error) {
      this.showStatus(`❌ Could not send command to page: ${error.message}`, "error");
    }
  }

  showStatus(message, type = 'info') {
    const statusElement = this.status;
    const indicator = statusElement.querySelector('.status-indicator');
    
    // Update indicator class
    if (indicator) {
      indicator.className = `status-indicator status-${type}`;
    }
    
    // Update text (preserve indicator)
    const textContent = message;
    if (indicator) {
      statusElement.innerHTML = '';
      statusElement.appendChild(indicator);
      statusElement.appendChild(document.createTextNode(textContent));
    } else {
      statusElement.textContent = textContent;
    }
    
    // Auto-clear success messages
    if (type === 'success') {
      setTimeout(() => {
        if (this.isListening) {
          this.showStatus("🎤 Listening for voice commands...", "listening");
        } else {
          this.showStatus("Ready to listen for voice commands", "ready");
        }
      }, 3000);
    }
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new VoiceNavigatorPopup();
});


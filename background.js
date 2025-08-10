// Enhanced Voice Navigator Background Script
// Handles cross-domain persistence and tab management

class VoiceNavigatorBackground {
  constructor() {
    this.globalState = {
      isListening: false,
      floatingPopupEnabled: true,
      popupPosition: { x: 20, y: 20 },
      currentTabId: null,
      listeningTabId: null
    };
    this.init();
  }

  init() {
    // Listen for tab changes
    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.handleTabChange(activeInfo.tabId);
    });

    // Listen for tab updates (URL changes)
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.handleTabUpdate(tabId, tab.url);
      }
    });

    // Listen for messages from content scripts and popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });

    // Initialize state from storage
    this.loadGlobalState();

    console.log('Voice Navigator Background Script initialized');
  }

  async loadGlobalState() {
    try {
      const result = await chrome.storage.local.get([
        'floatingPopupEnabled',
        'popupPosition',
        'isListening'
      ]);
      
      this.globalState = {
        ...this.globalState,
        floatingPopupEnabled: result.floatingPopupEnabled !== false,
        popupPosition: result.popupPosition || { x: 20, y: 20 },
        isListening: result.isListening || false
      };
    } catch (error) {
      console.log('Could not load global state:', error);
    }
  }

  async saveGlobalState() {
    try {
      await chrome.storage.local.set({
        floatingPopupEnabled: this.globalState.floatingPopupEnabled,
        popupPosition: this.globalState.popupPosition,
        isListening: this.globalState.isListening
      });
    } catch (error) {
      console.log('Could not save global state:', error);
    }
  }

  async handleTabChange(newTabId) {
    const oldTabId = this.globalState.currentTabId;
    this.globalState.currentTabId = newTabId;

    // If we were listening on the old tab, stop it
    if (oldTabId && this.globalState.isListening && this.globalState.listeningTabId === oldTabId) {
      try {
        await chrome.tabs.sendMessage(oldTabId, { 
          action: 'stopListening',
          reason: 'tabChange'
        });
      } catch (error) {
        console.log('Could not stop listening on old tab:', error);
      }
    }

    // If floating popup is enabled and we were listening, start on new tab
    if (this.globalState.floatingPopupEnabled && this.globalState.isListening) {
      setTimeout(async () => {
        try {
          await chrome.tabs.sendMessage(newTabId, {
            action: 'initializeWithState',
            state: {
              isListening: this.globalState.isListening,
              popupPosition: this.globalState.popupPosition,
              floatingPopupEnabled: this.globalState.floatingPopupEnabled
            }
          });
          this.globalState.listeningTabId = newTabId;
        } catch (error) {
          console.log('Could not initialize new tab:', error);
        }
      }, 500); // Small delay to ensure content script is loaded
    }
  }

  async handleTabUpdate(tabId, url) {
    // Handle URL changes within the same tab (navigation/redirect)
    if (tabId === this.globalState.currentTabId) {
      // If we were listening, maintain the state on the new page
      if (this.globalState.isListening && this.globalState.floatingPopupEnabled) {
        setTimeout(async () => {
          try {
            await chrome.tabs.sendMessage(tabId, {
              action: 'initializeWithState',
              state: {
                isListening: this.globalState.isListening,
                popupPosition: this.globalState.popupPosition,
                floatingPopupEnabled: this.globalState.floatingPopupEnabled
              }
            });
            this.globalState.listeningTabId = tabId;
          } catch (error) {
            console.log('Could not reinitialize after navigation:', error);
          }
        }, 1000); // Longer delay for page navigation
      }
    }
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.action) {
        case 'updateGlobalState':
          this.updateGlobalState(message.state);
          sendResponse({ success: true });
          break;

        case 'getGlobalState':
          sendResponse({ 
            success: true, 
            state: this.globalState 
          });
          break;

        case 'startListening':
          await this.startGlobalListening(sender.tab.id);
          sendResponse({ success: true });
          break;

        case 'stopListening':
          await this.stopGlobalListening();
          sendResponse({ success: true });
          break;

        case 'toggleFloatingPopup':
          await this.toggleGlobalFloatingPopup();
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

  updateGlobalState(newState) {
    this.globalState = { ...this.globalState, ...newState };
    this.saveGlobalState();
  }

  async startGlobalListening(tabId) {
    this.globalState.isListening = true;
    this.globalState.listeningTabId = tabId;
    await this.saveGlobalState();

    // Notify all tabs about the state change
    this.broadcastStateChange();
  }

  async stopGlobalListening() {
    this.globalState.isListening = false;
    this.globalState.listeningTabId = null;
    await this.saveGlobalState();

    // Notify all tabs about the state change
    this.broadcastStateChange();
  }

  async toggleGlobalFloatingPopup() {
    this.globalState.floatingPopupEnabled = !this.globalState.floatingPopupEnabled;
    await this.saveGlobalState();

    // Notify all tabs about the state change
    this.broadcastStateChange();
  }

  async broadcastStateChange() {
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'globalStateChanged',
            state: this.globalState
          });
        } catch (error) {
          // Tab might not have content script loaded, ignore
        }
      }
    } catch (error) {
      console.log('Could not broadcast state change:', error);
    }
  }
}

// Initialize background script
new VoiceNavigatorBackground();


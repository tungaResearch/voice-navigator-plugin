let mediaRecorder;
let audioChunks = [];

const startBtn = document.getElementById("startBtn");
const statusElem = document.getElementById("status");

// Fallback to Web Speech API if Whisper server is not available
const useWebSpeechAPI = () => {
  console.log("Attempting to use Web Speech API fallback.");
  const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = false;

  statusElem.textContent = "🎙 Listening...";
  console.log("Web Speech API: Starting recognition.");

  recognition.onresult = function (event) {
    const command = event.results[0][0].transcript.toLowerCase();
    statusElem.textContent = `✅ Heard: "${command}"`;
    console.log(`Web Speech API: Heard command: ${command}`);

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      console.log(`Web Speech API: Sending message to tab ${tab.id} with command: ${command}`);
      chrome.tabs.sendMessage(tab.id, { command });
    });
  };

  recognition.onerror = (e) => {
    console.error("Web Speech API Error:", e.error);
    statusElem.textContent = "❌ Error or mic not allowed";
  };

  recognition.onend = () => {
    console.log("Web Speech API: Recognition ended.");
    if (!statusElem.textContent.startsWith("✅")) {
      statusElem.textContent = "⏹ Stopped listening";
    }
  };

  recognition.start();
};

startBtn.addEventListener('click', async () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    console.log("Stopping recording.");
    mediaRecorder.stop();
    startBtn.textContent = '🎤 Start Listening';
    statusElem.textContent = 'Stopped listening.';
  } else {
    try {
      console.log("Requesting microphone access.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("Microphone access granted. Initializing MediaRecorder.");
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.start();
      startBtn.textContent = '⏹️ Stop Listening';
      statusElem.textContent = 'Listening...';
      console.log("MediaRecorder started.");

      mediaRecorder.ondataavailable = (event) => {
        console.log("Audio data available.", event.data);
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        console.log("MediaRecorder stopped. Creating audio blob.");
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        audioChunks = [];

        const formData = new FormData();
        formData.append('audio', audioBlob, 'audio.wav');

        statusElem.textContent = 'Processing audio...';
        console.log("Sending audio to Whisper server for transcription.");

        try {
          const response = await fetch('http://localhost:5000/transcribe', {
            method: 'POST',
            body: formData,
          });

          if (response.ok) {
            const data = await response.json();
            const command = data.text;
            statusElem.textContent = `✅ Heard: "${command}"`;
            console.log(`Whisper Server: Transcribed command: ${command}`);
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              console.log(`Whisper Server: Sending message to tab ${tabs[0].id} with command: ${command}`);
              chrome.tabs.sendMessage(tabs[0].id, { command: command });
            });
          } else {
            statusElem.textContent = `Error: ${response.statusText}`;
            console.error(`Whisper Server Error: ${response.statusText}`);
            // Fallback to Web Speech API
            useWebSpeechAPI();
          }
        } catch (error) {
          statusElem.textContent = `Whisper server not available, using Web Speech API`;
          console.error("Error connecting to Whisper server:", error);
          // Fallback to Web Speech API
          useWebSpeechAPI();
        }
      };
    } catch (error) {
      statusElem.textContent = 'Microphone access denied';
      console.error("Microphone access error:", error);
    }
  }
});
const status = document.getElementById("status");
const btn = document.getElementById("startBtn");

btn.onclick = () => {
  const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = false;

  status.textContent = "🎙 Listening...";

  recognition.onresult = function (event) {
    const command = event.results[0][0].transcript.toLowerCase();
    status.textContent = `✅ Heard: "${command}"`;

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      chrome.tabs.sendMessage(tab.id, { command });
    });
  };

  recognition.onerror = (e) => {
    console.error("Speech error:", e.error);
    status.textContent = "❌ Error or mic not allowed";
  };

  recognition.onend = () => {
    if (!status.textContent.startsWith("✅")) {
      status.textContent = "⏹ Stopped listening";
    }
  };

  recognition.start();
};

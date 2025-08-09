chrome.runtime.onMessage.addListener(({ command }) => {
  console.log("Received command:", command);

  if (command.includes("scroll down")) {
    window.scrollBy(0, 300);
  } else if (command.includes("scroll up")) {
    window.scrollBy(0, -300);
  } else if (command.includes("go to") || command.includes("open")) {
    const url = command.replace(/go to|open/g, "").trim();
    if (url) {
      window.location.href = url;
    }
  } else if (command.includes("click")) {
    const text = command.replace("click", "").trim();
    const els = document.querySelectorAll("button, a, input[type=\'button\'], [role=\'link\'], [role=\'button\']");

    for (let el of els) {
      if (el.innerText.toLowerCase().includes(text) || (el.value && el.value.toLowerCase().includes(text))) {
        console.log("Clicking:", el.innerText || el.value);
        el.click();
        el.style.outline = "2px solid red";
        break;
      }
    }
  } else if (command.includes("type") || command.includes("enter")) {
    const parts = command.split(/type|enter/);
    if (parts.length > 1) {
      const textToType = parts[1].trim();
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'input' || activeElement.tagName === 'textarea')) {
        activeElement.value = textToType;
      } else {
        // Try to find an input field based on context (e.g., a nearby label)
        const labels = document.querySelectorAll('label');
        for (let label of labels) {
          if (label.innerText.toLowerCase().includes(parts[0].trim())) {
            const inputId = label.getAttribute('for');
            if (inputId) {
              const inputElement = document.getElementById(inputId);
              if (inputElement) {
                inputElement.value = textToType;
                break;
              }
            }
          }
        }
      }
    }
  }
});



chrome.runtime.onMessage.addListener(({ command }) => {
  console.log("Received command:", command); // check console log

  if (command.includes("scroll down")) {
    window.scrollBy(0, 300);
  } else if (command.includes("scroll up")) {
    window.scrollBy(0, -300);
  } else if (command.includes("click")) {
    const text = command.replace("click", "").trim();
    const els = document.querySelectorAll("button, a, input[type='button']");

    for (let el of els) {
      if (el.innerText.toLowerCase().includes(text)) {
        console.log("Clicking:", el.innerText); // log what it clicks
        el.click();
        el.style.outline = "2px solid red"; // visual feedback
        break;
      }
    }
  }
});

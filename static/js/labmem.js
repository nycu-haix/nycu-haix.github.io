(() => {
  const body = document.body;
  if (!body || !body.classList.contains("labmem-page")) {
    return;
  }

  const peopleList = document.getElementById("people-list");
  const triggerButton = document.getElementById("reading-steiner-trigger");
  const worldlineValue = document.getElementById("worldline-value");
  const worldlineLog = document.getElementById("worldline-log");

  if (!peopleList || !triggerButton || !worldlineValue) {
    return;
  }

  let currentWorldlineValue = normalizeWorldlineValue(worldlineValue.textContent) || generateRandomWorldlineValue();
  let hasShiftedWorldline = false;
  let meterAnimationTimer = null;
  let bodyShiftTimer = null;

  applyMemberIndices();
  applyWorldlineState({ animateMeter: false });

  triggerButton.addEventListener("click", () => {
    currentWorldlineValue = pickNextWorldlineValue(currentWorldlineValue);
    hasShiftedWorldline = true;

    body.classList.add("is-shifting");
    if (bodyShiftTimer) {
      window.clearTimeout(bodyShiftTimer);
    }
    bodyShiftTimer = window.setTimeout(() => {
      body.classList.remove("is-shifting");
      bodyShiftTimer = null;
    }, 860);

    applyWorldlineState({ animateMeter: true });
  });

  const observer = new MutationObserver(() => {
    applyMemberIndices();
    applyWorldlineVisibilityOnly();
  });

  observer.observe(peopleList, { childList: true });

  peopleList.addEventListener("click", (event) => {
    const photoLink = event.target instanceof Element ? event.target.closest(".people-open-photo") : null;
    if (!photoLink || !peopleList.contains(photoLink)) {
      return;
    }

    event.preventDefault();
  });

  function applyWorldlineState(options) {
    const { animateMeter } = options;
    const targetWorldline = currentWorldlineValue;

    if (animateMeter) {
      animateMeterDisplay(targetWorldline);
    } else {
      setWorldlineDisplay(targetWorldline);
    }

    if (worldlineLog) {
      worldlineLog.textContent = `Worldline shifted: ${targetWorldline}`;
    }
    body.setAttribute("data-worldline", targetWorldline);
    applyWorldlineVisibilityOnly();
  }

  function applyMemberIndices() {
    const cards = Array.from(peopleList.querySelectorAll(".people-card"));
    cards.forEach((card, index) => {
      let indexNode = card.querySelector(".labmem-index");
      if (!indexNode) {
        indexNode = document.createElement("span");
        indexNode.className = "labmem-index";
        card.insertBefore(indexNode, card.firstChild);
      }

      indexNode.textContent = `MEM-${String(index + 1).padStart(3, "0")}`;
      card.dataset.labmemIndex = indexNode.textContent;
    });
  }

  function applyWorldlineVisibilityOnly() {
    const cards = Array.from(peopleList.querySelectorAll(".people-card"));

    if (!cards.length) {
      return;
    }

    if (!hasShiftedWorldline) {
      cards.forEach((card) => {
        card.classList.remove("worldline-hidden");
        card.setAttribute("aria-hidden", "false");
      });
      return;
    }

    const seed = worldlineSeed(currentWorldlineValue);

    cards.forEach((card, index) => {
      const shouldHide = ((seed + ((index + 1) * 131)) % 7) < 3;

      card.classList.toggle("worldline-hidden", shouldHide);
      card.setAttribute("aria-hidden", shouldHide ? "true" : "false");
    });
  }

  function pickNextWorldlineValue(previousValue) {
    let nextValue = generateRandomWorldlineValue();

    if (nextValue !== previousValue) {
      return nextValue;
    }

    nextValue = generateRandomWorldlineValue();
    return nextValue;
  }

  function generateRandomWorldlineValue() {
    const digits = String(Math.floor(Math.random() * 10000000)).padStart(7, "0");
    return `${digits.slice(0, 1)}.${digits.slice(1)}`;
  }

  function normalizeWorldlineValue(value) {
    const digitsOnly = String(value || "").replace(/\D/g, "");
    if (digitsOnly.length < 7) {
      return "";
    }

    const normalizedDigits = digitsOnly.slice(0, 7);
    return `${normalizedDigits.slice(0, 1)}.${normalizedDigits.slice(1)}`;
  }

  function worldlineSeed(worldline) {
    const digitsOnly = String(worldline || "").replace(/\D/g, "");
    const seed = Number.parseInt(digitsOnly, 10);
    return Number.isNaN(seed) ? 0 : seed;
  }

  function animateMeterDisplay(targetValue) {
    const value = String(targetValue || "");

    if (meterAnimationTimer) {
      window.clearInterval(meterAnimationTimer);
      meterAnimationTimer = null;
    }

    let tick = 0;
    meterAnimationTimer = window.setInterval(() => {
      tick += 1;
      setWorldlineDisplay(randomWorldlinePattern(value));

      if (tick >= 11) {
        window.clearInterval(meterAnimationTimer);
        meterAnimationTimer = null;
        setWorldlineDisplay(value);
      }
    }, 48);
  }

  function setWorldlineDisplay(value) {
    const text = String(value || "");
    worldlineValue.textContent = text;
    worldlineValue.setAttribute("data-worldline", text);
  }

  function randomWorldlinePattern(targetPattern) {
    return targetPattern
      .split("")
      .map((char) => {
        if (char === ".") {
          return ".";
        }

        if (char < "0" || char > "9") {
          return char;
        }

        return String(Math.floor(Math.random() * 10));
      })
      .join("");
  }
})();

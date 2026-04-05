(() => {
  const body = document.body;
  if (!body || !body.classList.contains("labmem-page")) {
    return;
  }

  const peopleList = document.getElementById("people-list");
  const worldlineValue = document.getElementById("worldline-value");
  const worldlineLog = document.getElementById("worldline-log");
  const observerFeedback = document.getElementById("observer-feedback");

  if (!peopleList || !worldlineValue) {
    return;
  }

  let currentWorldlineValue = seedInitialWorldline(worldlineValue.textContent);
  let hasShiftedWorldline = false;
  let meterAnimationTimer = null;
  let bodyShiftTimer = null;
  let longPressTimer = null;
  let feedbackTimer = null;
  let suppressNextClick = false;
  let keySequence = "";
  const maxSequenceLength = 20;
  const longPressDurationMs = 1200;
  const dayWorldlineLogs = [
    "Minor divergence detected. Registry stabilized.",
    "No major drift detected.",
    "Archive integrity: 97.3%.",
    "External observer connected.",
    "Unauthorized curiosity accepted.",
    "Signal recovered from a nearby node."
  ];
  const nightWorldlineLogs = [
    "Instability rising. Keep observation channel open.",
    "Night cycle detected. Divergence noise increasing.",
    "Temporal jitter elevated after 21:00.",
    "Worldline drift is louder in this hour.",
    "Quiet corridor breached. Maintain record lock.",
    "Reading Steiner sensitivity above baseline."
  ];

  applyMemberIndices();
  applyWorldlineState({ animateMeter: false });

  worldlineValue.addEventListener("click", () => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }

    shiftWorldline();
  });

  worldlineValue.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

    clearLongPressTimer();
    longPressTimer = window.setTimeout(() => {
      suppressNextClick = true;
      shiftWorldline({ unstableSweep: true });
      logWorldline("Unstable sweep executed. Divergence spike recorded.");
      clearLongPressTimer();
    }, longPressDurationMs);
  });

  worldlineValue.addEventListener("pointerup", clearLongPressTimer);
  worldlineValue.addEventListener("pointerleave", clearLongPressTimer);
  worldlineValue.addEventListener("pointercancel", clearLongPressTimer);

  worldlineValue.addEventListener("mouseenter", () => {
    worldlineValue.classList.add("is-hovering");
  });

  worldlineValue.addEventListener("mouseleave", () => {
    worldlineValue.classList.remove("is-hovering");
  });

  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) {
      return;
    }

    keySequence = `${keySequence}${event.key.toLowerCase()}`.replace(/[^a-z0-9]/g, "");
    if (keySequence.length > maxSequenceLength) {
      keySequence = keySequence.slice(-maxSequenceLength);
    }

    if (keySequence.includes("elpsykongroo")) {
      body.classList.remove("mode-alert");
      logWorldline("Observer phrase accepted.");
      keySequence = "";
      return;
    }

    if (keySequence.includes("readingsteiner")) {
      shiftWorldline();
      logWorldline("Reading Steiner invoked by keyboard.");
      showObserverFeedback("Observer rank updated.", 2000);
      keySequence = "";
      return;
    }

    if (keySequence.includes("tuturu")) {
      body.classList.add("is-shifting");
      window.setTimeout(() => {
        body.classList.remove("is-shifting");
      }, 860);
      logWorldline("Signal fragment: tuturu.");
      keySequence = "";
      return;
    }

    if (keySequence.includes("ibn5100")) {
      body.classList.toggle("mode-alert");
      logWorldline(body.classList.contains("mode-alert") ? "Alert mode enabled." : "Alert mode disabled.");
      keySequence = "";
    }
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

    if (animateMeter) {
      logWorldline(`Worldline shifted: ${targetWorldline}`);
    } else {
      setWorldlineLog(randomWorldlineLog());
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

  function shiftWorldline(options = {}) {
    const { unstableSweep = false } = options;
    currentWorldlineValue = pickNextWorldlineValue(currentWorldlineValue);
    hasShiftedWorldline = true;

    body.classList.add("is-shifting");
    if (unstableSweep) {
      body.classList.add("is-unstable-sweep");
    }

    if (bodyShiftTimer) {
      window.clearTimeout(bodyShiftTimer);
    }
    bodyShiftTimer = window.setTimeout(() => {
      body.classList.remove("is-shifting");
      body.classList.remove("is-unstable-sweep");
      bodyShiftTimer = null;
    }, unstableSweep ? 1400 : 860);

    applyWorldlineState({ animateMeter: true });
  }

  function clearLongPressTimer() {
    if (longPressTimer) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
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

  function seedInitialWorldline(value) {
    const normalized = normalizeWorldlineValue(value) || generateRandomWorldlineValue();
    const digits = normalized.replace(".", "");
    const prefix = digits.slice(0, 4);
    const baseline = Number.parseInt(digits.slice(4), 10);
    const drift = Math.floor(Math.random() * 17) - 8;
    const nextTail = String(Math.min(999, Math.max(0, baseline + drift))).padStart(3, "0");
    return `${prefix.slice(0, 1)}.${prefix.slice(1)}${nextTail}`;
  }

  function logWorldline(text) {
    setWorldlineLog(text);
    const nextText = randomWorldlineLog();
    window.setTimeout(() => {
      if (worldlineLog && worldlineLog.textContent === text) {
        setWorldlineLog(nextText);
      }
    }, 2200);
  }

  function setWorldlineLog(text) {
    if (!worldlineLog) {
      return;
    }

    worldlineLog.textContent = text;
  }

  function randomWorldlineLog() {
    const source = isNightObservationHour() ? nightWorldlineLogs : dayWorldlineLogs;
    return source[Math.floor(Math.random() * source.length)];
  }

  function isNightObservationHour() {
    const hour = new Date().getHours();
    return hour >= 21 || hour < 6;
  }

  function showObserverFeedback(text, durationMs) {
    if (!observerFeedback) {
      return;
    }

    observerFeedback.textContent = text;
    observerFeedback.classList.add("is-visible");

    if (feedbackTimer) {
      window.clearTimeout(feedbackTimer);
    }

    feedbackTimer = window.setTimeout(() => {
      observerFeedback.classList.remove("is-visible");
      observerFeedback.textContent = "";
      feedbackTimer = null;
    }, durationMs);
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

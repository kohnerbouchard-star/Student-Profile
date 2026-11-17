window.createAdminMfaCreateWizard = function createAdminMfaCreateWizard(ownerScope) {
  "use strict";

  const { runtime, createElement } = ownerScope;


  function validTimeZone(value) {
    const timeZone = String(value || "").trim();
    if (!timeZone) return "";
    try {
      new Intl.DateTimeFormat("en-US", { timeZone }).format();
      return timeZone;
    } catch (_) {
      return "";
    }
  }

  function reorderTimeZones() {
    const select = runtime.document.getElementById("gameTimeZone");
    if (!select) return;

    const supported = typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : Array.from(select.options).map((option) => option.value);
    const deviceTimeZone = validTimeZone(
      Intl.DateTimeFormat().resolvedOptions().timeZone
    );
    const zones = Array.from(new Set([
      ...supported.map(validTimeZone).filter(Boolean),
      "UTC"
    ])).sort((left, right) => left.localeCompare(right));
    const first = deviceTimeZone || validTimeZone(select.value) || "UTC";
    const ordered = [first, ...zones.filter((zone) => zone !== first)];
    const fragment = runtime.document.createDocumentFragment();

    ordered.forEach((timeZone) => {
      const option = runtime.document.createElement("option");
      option.value = timeZone;
      option.textContent = timeZone;
      option.selected = timeZone === first;
      fragment.append(option);
    });
    select.replaceChildren(fragment);
  }

  function installCreateWizard() {
    const form = runtime.document.getElementById("createForm");
    if (!form || form.dataset.createWizardInstalled === "true") return;

    const license = runtime.document.getElementById("licenseCode")?.closest("label");
    const email = runtime.document.getElementById("createEmail")?.closest("label");
    const displayName = runtime.document.getElementById("createDisplayName")?.closest("label");
    const sessionName = runtime.document.getElementById("sessionName")?.closest("label");
    const timeZone = runtime.document.getElementById("gameTimeZone")?.closest("label");
    const difficulty = runtime.document.getElementById("difficultyLevel")?.closest("label");
    const passwordGroup = runtime.document.getElementById("createAccessCode")?.closest(".two-col");
    const message = runtime.document.getElementById("createMessage");
    const submit = form.querySelector("button[type='submit']");
    if (
      !license || !email || !displayName || !sessionName || !timeZone ||
      !difficulty || !passwordGroup || !message || !submit
    ) {
      return;
    }

    form.dataset.createWizardInstalled = "true";
    let currentStep = 1;

    const progress = createElement("div", "econovaria-create-progress");
    progress.setAttribute("aria-label", "Create game progress");
    ["Account", "Game", "Security"].forEach((label, index) => {
      const item = createElement("span", "econovaria-create-progress-item");
      item.dataset.step = String(index + 1);
      item.append(
        createElement("b", "", String(index + 1)),
        createElement("span", "", label)
      );
      progress.append(item);
    });

    const stepOne = createElement("div", "econovaria-create-step");
    stepOne.dataset.step = "1";
    stepOne.append(license, email, displayName);

    const stepTwo = createElement("div", "econovaria-create-step hidden");
    stepTwo.dataset.step = "2";
    stepTwo.append(sessionName, timeZone, difficulty);

    const stepThree = createElement("div", "econovaria-create-step hidden");
    stepThree.dataset.step = "3";
    stepThree.append(passwordGroup, message);

    function navigationButton(label, direction) {
      const button = createElement(
        "button",
        direction === "next"
          ? "submit-btn purple econovaria-create-next"
          : "econovaria-create-back",
        label
      );
      button.type = "button";
      return button;
    }

    const stepOneActions = createElement("div", "econovaria-create-actions");
    const stepOneNext = navigationButton("Continue", "next");
    stepOneActions.append(stepOneNext);
    stepOne.append(stepOneActions);

    const stepTwoActions = createElement("div", "econovaria-create-actions split");
    const stepTwoBack = navigationButton("Back", "back");
    const stepTwoNext = navigationButton("Continue", "next");
    stepTwoActions.append(stepTwoBack, stepTwoNext);
    stepTwo.append(stepTwoActions);

    const stepThreeActions = createElement("div", "econovaria-create-actions split");
    const stepThreeBack = navigationButton("Back", "back");
    stepThreeActions.append(stepThreeBack, submit);
    stepThree.append(stepThreeActions);

    form.replaceChildren(progress, stepOne, stepTwo, stepThree);

    function stepFields(step) {
      return Array.from(step.querySelectorAll("input, select"));
    }

    function validateStep(step) {
      for (const field of stepFields(step)) {
        if (!field.checkValidity()) {
          field.reportValidity();
          field.focus();
          return false;
        }
      }
      return true;
    }

    function setStep(nextStep) {
      currentStep = Math.max(1, Math.min(3, Number(nextStep) || 1));
      form.querySelectorAll(".econovaria-create-step").forEach((step) => {
        step.classList.toggle("hidden", Number(step.dataset.step) !== currentStep);
      });
      progress.querySelectorAll(".econovaria-create-progress-item").forEach((item) => {
        const itemStep = Number(item.dataset.step);
        item.classList.toggle("is-active", itemStep === currentStep);
        item.classList.toggle("is-complete", itemStep < currentStep);
      });
      const active = form.querySelector(
        `.econovaria-create-step[data-step="${currentStep}"] input, ` +
        `.econovaria-create-step[data-step="${currentStep}"] select`
      );
      active?.focus({ preventScroll: true });
    }

    stepOneNext.addEventListener("click", () => {
      if (validateStep(stepOne)) setStep(2);
    });
    stepTwoBack.addEventListener("click", () => setStep(1));
    stepTwoNext.addEventListener("click", () => {
      if (validateStep(stepTwo)) setStep(3);
    });
    stepThreeBack.addEventListener("click", () => setStep(2));
    form.addEventListener("reset", () => runtime.setTimeout(() => setStep(1), 0));
    form.addEventListener("submit", (event) => {
      if (currentStep === 3) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (currentStep === 1 && validateStep(stepOne)) setStep(2);
      else if (currentStep === 2 && validateStep(stepTwo)) setStep(3);
    }, true);

    setStep(1);
  }

  return { validTimeZone, reorderTimeZones, installCreateWizard };
};

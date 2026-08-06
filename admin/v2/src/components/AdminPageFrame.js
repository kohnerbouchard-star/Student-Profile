import { appendContent, createElement, createId, replaceContent, setText } from "./dom.js";

export function AdminPageFrame({
  eyebrow,
  title = "Admin page",
  description,
  actions,
  content,
  labelledBy,
} = {}) {
  const titleId = labelledBy || createId("admin-page-title");
  const root = createElement("article", {
    className: "admin-page-frame",
    attrs: { "aria-labelledby": titleId },
  });
  const header = createElement("header", { className: "admin-page-frame__header" });
  const copy = createElement("div", { className: "admin-page-frame__copy" });
  const eyebrowElement = createElement("p", { className: "admin-page-frame__eyebrow", text: eyebrow || "" });
  eyebrowElement.hidden = !eyebrow;
  const heading = createElement("h1", {
    className: "admin-page-frame__title",
    text: title,
    attrs: { id: titleId },
  });
  const descriptionElement = createElement("p", {
    className: "admin-page-frame__description",
    text: description || "",
  });
  descriptionElement.hidden = !description;
  copy.append(eyebrowElement, heading, descriptionElement);
  const actionSlot = createElement("div", { className: "admin-page-frame__actions" });
  appendContent(actionSlot, actions);
  actionSlot.hidden = !actions;
  header.append(copy, actionSlot);
  const body = createElement("div", { className: "admin-page-frame__body" });
  appendContent(body, content);
  root.append(header, body);

  return {
    element: root,
    body,
    actionSlot,
    setTitle(nextTitle) { setText(heading, nextTitle, "Admin page"); },
    setDescription(nextDescription) {
      setText(descriptionElement, nextDescription);
      descriptionElement.hidden = !nextDescription;
    },
    setEyebrow(nextEyebrow) {
      setText(eyebrowElement, nextEyebrow);
      eyebrowElement.hidden = !nextEyebrow;
    },
    setActions(nextActions) {
      replaceContent(actionSlot, nextActions);
      actionSlot.hidden = !nextActions;
    },
    setContent(nextContent) { replaceContent(body, nextContent); },
  };
}

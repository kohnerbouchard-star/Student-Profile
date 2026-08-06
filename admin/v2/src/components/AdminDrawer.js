import { AdminDialog } from "./AdminDialog.js";

export function AdminDrawer({ side = "right", size = "medium", ...options } = {}) {
  const dialog = AdminDialog({
    ...options,
    size,
    className: `admin-drawer${options.className ? ` ${options.className}` : ""}`,
    panelClassName: "admin-drawer__panel",
  });
  dialog.element.dataset.side = side;
  dialog.panel.setAttribute("data-drawer-panel", "");
  return dialog;
}

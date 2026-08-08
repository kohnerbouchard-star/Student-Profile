import { createElement } from "../../components/dom.js";

function block(className) {
  return createElement("span", { className: `admin-attendance-skeleton__block ${className}` });
}

export function AttendanceSkeleton() {
  return createElement("div", {
    className: "admin-attendance-skeleton",
    attrs: { "aria-label": "Loading Attendance", role: "status" },
    children: [
      createElement("section", {
        className: "admin-attendance-skeleton__metrics",
        children: Array.from({ length: 5 }, () => block("admin-attendance-skeleton__metric")),
      }),
      createElement("section", {
        className: "admin-attendance-skeleton__scanner",
        children: [block("admin-attendance-skeleton__line"), block("admin-attendance-skeleton__input")],
      }),
      createElement("section", {
        className: "admin-attendance-skeleton__table",
        children: Array.from({ length: 7 }, () => block("admin-attendance-skeleton__row")),
      }),
    ],
  });
}

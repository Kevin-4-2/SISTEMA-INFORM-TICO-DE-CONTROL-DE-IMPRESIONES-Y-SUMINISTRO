import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "./polish.css";
import "./button-refinement.css";

const navFooter = document.querySelector(".nav-footer");
const motionButton = document.querySelector("#motion-toggle");
const navIcons = {
  dashboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.8 11.2 12 4.4l8.2 6.8"/><path d="M5.6 9.8V19a1.2 1.2 0 0 0 1.2 1.2h3.4v-5.4h3.6v5.4h3.4a1.2 1.2 0 0 0 1.2-1.2V9.8"/><path d="M9.5 4.6h5"/></svg>',
  impresoras: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8.2V3.6h10v4.6"/><path d="M7 16.6H4.8A1.8 1.8 0 0 1 3 14.8v-4A1.8 1.8 0 0 1 4.8 9h14.4A1.8 1.8 0 0 1 21 10.8v4a1.8 1.8 0 0 1-1.8 1.8H17"/><path d="M7 13.4h10v7H7z"/><path d="M17.4 11.6h.01"/></svg>',
  suministros: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.6 13.1 13.5 20.2a2.1 2.1 0 0 1-3 0L3 12.7V3.4h9.3l8.3 8.3a1 1 0 0 1 0 1.4Z"/><circle cx="7.6" cy="7.9" r="1.15"/></svg>',
  mantenimientos: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.1 6.9a4.2 4.2 0 0 0-5.4 5.4L3.6 18.4a1.9 1.9 0 1 0 2.7 2.7l6.1-6.1a4.2 4.2 0 0 0 5.4-5.4l-2.5 2.5-2.7-2.7 2.5-2.5Z"/><path d="M17.5 2.5l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z"/></svg>',
  registros: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.6" y="2.8" width="14.8" height="18.4" rx="2.2"/><path d="M8.6 7.6h6.8M8.6 11.4h6.8M8.6 15.2h4.2"/><path d="M15.8 2.8v4.8"/></svg>',
  reportes: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.4 19.6V11M12 19.6V4.4M18.6 19.6v-6.2"/><path d="M3 19.6h18"/></svg>',
  configuracion: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.2" cy="7.8" r="3.2"/><path d="M4 20.6a6.2 6.2 0 0 1 12.4 0"/><path d="M18.6 3.4v4.4M16.4 5.6h4.4"/></svg>',
  auditoria: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.2"/><path d="M12 7.2V12l3.4 1.8"/><path d="M12 1.6v1.6M12 20.8v1.6M1.6 12h1.6M20.8 12h1.6"/></svg>',
};

document.querySelectorAll(".station-button").forEach((button) => {
  const icon = button.querySelector(":scope > i");
  if (!icon || !navIcons[button.dataset.stationTarget]) return;
  icon.innerHTML = navIcons[button.dataset.stationTarget];
  const svg = icon.querySelector("svg");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
});

function buildLogoutButton(extraClass = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "logout-button " + extraClass;
  button.setAttribute("aria-label", "Cerrar sesión y volver al inicio");
  button.innerHTML = '<span class="logout-glyph"><i class="logout-door"></i><i class="logout-arrow">←</i></span><b>Cerrar sesión</b>';
  button.addEventListener("click", () => {
    if (typeof window.sicisLogout === "function") window.sicisLogout();
  });
  return button;
}

const sidebarLogout = buildLogoutButton();
navFooter.insertBefore(sidebarLogout, motionButton);

const topLogout = buildLogoutButton("logout-top-button");
topLogout.querySelector("b").remove();
document.querySelector(".room-actions").appendChild(topLogout);

const curtain = document.createElement("div");
curtain.className = "logout-curtain";
curtain.id = "logout-curtain";
curtain.innerHTML = "<span>CERRANDO SESIÓN</span>";
document.querySelector(".experience").appendChild(curtain);

document.querySelectorAll(
  ".launch-button, .primary-action, .add-button, .printer-open, .secondary-action, .station-button, .command-button, .profile, .logout-button"
).forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    const rect = button.getBoundingClientRect();
    const ripple = document.createElement("i");
    ripple.className = "button-ripple";
    ripple.style.left = event.clientX - rect.left + "px";
    ripple.style.top = event.clientY - rect.top + "px";
    button.appendChild(ripple);
    window.setTimeout(() => ripple.remove(), 760);
  });
});

// js/script.js
document.addEventListener("DOMContentLoaded", () => {
  // ===== HERO detection (home .hero-slideshow, overons .hero, contact .contact-hero)
  const hero = document.querySelector(".hero-slideshow, .hero, .contact-hero");
  const mqMobile = window.matchMedia("(max-width: 768px)");
  if (hero) document.body.classList.add("has-hero");

  function applyHeaderState() {
    if (!mqMobile.matches) {
      document.body.classList.remove("nav-solid");
      return;
    }
    if (!hero) {
      document.body.classList.remove("has-hero");
      document.body.classList.add("nav-solid");
      return;
    }
    document.body.classList.toggle("nav-solid", window.scrollY > 24);
  }
  applyHeaderState();
  window.addEventListener("scroll", applyHeaderState, { passive: true });
  window.addEventListener("resize", applyHeaderState);

  // ===== Navbar(s)
  document.querySelectorAll(".navbar").forEach((navbar) => {
    const btn =
      navbar.querySelector(".menu-toggle") ||
      navbar.querySelector("[aria-controls]");

    if (!btn) return;

    // REMOVE any inline onclick to avoid double-toggling
    if (btn.hasAttribute("onclick")) btn.removeAttribute("onclick");

    // Resolve controlled menu
    let menu = null;
    const ctrl = btn.getAttribute("aria-controls");
    if (ctrl) menu = document.getElementById(ctrl);
    if (!menu) menu = navbar.querySelector(".nav-links");
    if (!menu) return;

    // Toggle helpers
    const openMenu = () => {
      menu.classList.add("show");
      btn.setAttribute("aria-expanded", "true");
    };
    const closeMenu = () => {
      menu.classList.remove("show");
      btn.setAttribute("aria-expanded", "false");
    };
    const toggleMenu = () => (menu.classList.contains("show") ? closeMenu() : openMenu());

    // Click -> toggle once
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    // Outside click closes
    document.addEventListener("click", (e) => {
      if (!menu.classList.contains("show")) return;
      const inside = navbar.contains(e.target) || btn.contains(e.target) || menu.contains(e.target);
      if (!inside) closeMenu();
    });

    // Esc closes
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });

    // Close when switching to desktop
    const mqDesktop = window.matchMedia("(min-width: 901px)");
    const handleResize = () => { if (mqDesktop.matches) closeMenu(); };
    handleResize();
    window.addEventListener("resize", handleResize);
  });
});

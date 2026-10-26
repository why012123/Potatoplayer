(() => {
  try {
    const theme = localStorage.getItem("potato:theme") === "dark" ? "dark" : "light";
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;

    const raw = localStorage.getItem("potato:appearance:v1");
    const appearance = raw ? JSON.parse(raw) : {};
    const language = appearance.language === "zh" || appearance.language === "en"
      ? appearance.language
      : "en";
    root.dataset.style = appearance.style === "editorial" ? "editorial" : "classic";
    root.dataset.display = appearance.display === "serif" ? "serif" : "sans";
    root.dataset.corners = appearance.corners === "crisp" ? "crisp" : "soft";
    root.dataset.density = appearance.density === "compact" ? "compact" : "comfortable";
    root.dataset.atmosphere = appearance.atmosphere === "still" ? "still" : "rich";
    root.dataset.accent = typeof appearance.accent === "string" ? appearance.accent : "cover";
    root.lang = language === "zh" ? "zh-CN" : "en";
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();

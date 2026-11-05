const THEMES = {
  strong: { name: "strong", hue: null, accent: "#48d6aa", base: "#6b9e88", colors: ["#80bca7", "#61dca3"] },
  weak: { name: "weak", hue: 45, accent: "#ddb54b", base: "#ae9769", colors: ["#ccb56f", "#e6bd55"] },
  critical: { name: "critical", hue: 4, accent: "#ed7970", base: "#ae7771", colors: ["#da9389", "#f07b70"] },
};

export function getRadioTheme(quality) {
  return THEMES[quality < 35 ? "critical" : quality < 85 ? "weak" : "strong"];
}

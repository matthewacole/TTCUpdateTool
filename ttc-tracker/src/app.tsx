import { useEffect, useState } from "preact/hooks";
import { preferences } from "./store";
import { Dashboard } from "./components";
import "./styles/global.css";

export function App() {
  const [theme, setTheme] = useState<"light" | "dark">(preferences.getEffectiveTheme());

  useEffect(() => {
    const updateTheme = () => setTheme(preferences.getEffectiveTheme());
    updateTheme();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", updateTheme);
    return () => mq.removeEventListener("change", updateTheme);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      theme === "dark" ? "#000000" : "#f2f2f7",
    );
  }, [theme]);

  return <Dashboard />;
}

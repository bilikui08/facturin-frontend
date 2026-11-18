import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyTheme, getStoredTheme, isDark } from "@/lib/theme";

/** Alterna entre tema claro y oscuro. */
const ThemeToggle = () => {
  const [dark, setDark] = useState(() => isDark(getStoredTheme()));

  const toggle = () => {
    const next = dark ? "light" : "dark";
    applyTheme(next, true);
    setDark(!dark);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      type="button"
      onClick={toggle}
      aria-label={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
};

export default ThemeToggle;

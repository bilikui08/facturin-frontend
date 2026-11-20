import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import LoadingButton from "../LoadingButton";

describe("LoadingButton", () => {
  it("sin carga se comporta como un botón normal", async () => {
    const onClick = vi.fn();
    render(<LoadingButton onClick={onClick}>Imputar</LoadingButton>);

    await userEvent.click(screen.getByRole("button", { name: "Imputar" }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("en curso: deshabilitado, con spinner adentro y sin admitir clicks", async () => {
    const onClick = vi.fn();
    render(<LoadingButton loading loadingLabel="Imputando" onClick={onClick}>Imputar</LoadingButton>);

    const button = screen.getByRole("button", { name: /Imputar/ });
    expect(button).toHaveProperty("disabled", true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("status", { name: "Imputando" })).toBeTruthy();

    await userEvent.click(button);
    await userEvent.dblClick(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("deshabilitado por otra razón no muestra spinner", () => {
    render(<LoadingButton disabled>Imputar</LoadingButton>);

    expect(screen.getByRole("button", { name: "Imputar" })).toHaveProperty("disabled", true);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

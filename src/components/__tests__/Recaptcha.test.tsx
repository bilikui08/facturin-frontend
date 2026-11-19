import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Recaptcha from "../Recaptcha";

interface Options {
  sitekey: string;
  theme: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
}

let options: Options;
const render_ = vi.fn((_el: HTMLElement, o: Record<string, unknown>) => {
  options = o as unknown as Options;
  return 7;
});
const reset = vi.fn();

beforeEach(() => {
  render_.mockClear();
  reset.mockClear();
  window.grecaptcha = { render: render_, reset };
});

describe("Recaptcha", () => {
  it("dibuja el widget con la clave pública del sitio y entrega la respuesta", async () => {
    const onChange = vi.fn();
    render(<Recaptcha onChange={onChange} />);

    await vi.waitFor(() => expect(render_).toHaveBeenCalledTimes(1));
    expect(options.sitekey).toMatch(/^6L/);
    expect(options.theme).toBe("light");

    act(() => options.callback("respuesta-1"));
    expect(onChange).toHaveBeenLastCalledWith("respuesta-1");

    act(() => options["expired-callback"]());
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("se reinicia cuando cambia resetKey (cada respuesta vale una vez)", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<Recaptcha onChange={onChange} resetKey={0} />);
    await vi.waitFor(() => expect(render_).toHaveBeenCalled());

    rerender(<Recaptcha onChange={onChange} resetKey={1} />);

    await vi.waitFor(() => expect(reset).toHaveBeenCalledWith(7));
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(render_).toHaveBeenCalledTimes(1); // no se vuelve a dibujar
  });

  it("no dibuja dos veces el mismo widget", async () => {
    const { rerender } = render(<Recaptcha onChange={vi.fn()} />);
    await vi.waitFor(() => expect(render_).toHaveBeenCalled());

    rerender(<Recaptcha onChange={vi.fn()} />);

    expect(render_).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Verificación anti robots")).toBeTruthy();
  });
});

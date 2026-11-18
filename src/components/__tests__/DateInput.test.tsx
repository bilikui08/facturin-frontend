import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import DateInput from "../DateInput";

const Harness = ({ onChange }: { onChange: (name: string, iso: string) => void }) => {
  const [value, setValue] = useState("");
  return (
    <DateInput
      id="d"
      name="issue_date"
      value={value}
      onChange={(name, iso) => {
        setValue(iso);
        onChange(name, iso);
      }}
    />
  );
};

describe("DateInput", () => {
  it("aplica la máscara dd/mm/aaaa y avisa la fecha en formato ISO", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.type(screen.getByPlaceholderText("dd/mm/aaaa"), "26112026");

    expect(screen.getByPlaceholderText("dd/mm/aaaa")).toHaveProperty("value", "26/11/2026");
    expect(onChange).toHaveBeenLastCalledWith("issue_date", "2026-11-26");
  });

  it("no informa una fecha que no existe (31/02)", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.type(screen.getByPlaceholderText("dd/mm/aaaa"), "31022026");

    expect(onChange).toHaveBeenLastCalledWith("issue_date", "");
    expect((screen.getByPlaceholderText("dd/mm/aaaa") as HTMLInputElement).validationMessage).toMatch(
      /fecha válida/,
    );
  });

  it("abre el calendario y elige un día", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(screen.getByRole("button", { name: "Abrir calendario" }));
    const grid = await screen.findByRole("grid");
    expect(grid).toBeTruthy();

    const day15 = screen.getAllByRole("gridcell").find((cell) => cell.textContent === "15");
    await user.click(day15!.querySelector("button")!);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1]).toMatch(/^\d{4}-\d{2}-15$/);
    expect(screen.queryByRole("grid")).toBeNull();
  });
});

import { useRef, useState, type ChangeEvent } from "react";

interface DateInputProps {
  id?: string;
  name: string;
  /** Fecha en formato ISO (yyyy-mm-dd) o vacío. */
  value: string;
  onChange: (name: string, isoValue: string) => void;
  required?: boolean;
}

// dd/mm/aaaa -> aaaa-mm-dd ("" si es incompleta o no es una fecha real)
const displayToIso = (display: string): string => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display);
  if (!match) return "";
  const [, dd, mm, yyyy] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  const isReal =
    date.getFullYear() === Number(yyyy) &&
    date.getMonth() === Number(mm) - 1 &&
    date.getDate() === Number(dd);
  return isReal ? `${yyyy}-${mm}-${dd}` : "";
};

const isoToDisplay = (iso: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
};

const maskDigits = (raw: string): string => {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)];
  return parts.filter(Boolean).join("/");
};

const DateInput = ({ id, name, value, onChange, required }: DateInputProps) => {
  const [text, setText] = useState(() => isoToDisplay(value));
  const pickerRef = useRef<HTMLInputElement>(null);

  // Si el valor cambia desde afuera (ej. al cargar datos), se muestra ese valor.
  const iso = displayToIso(text);
  const shown = iso === value ? text : isoToDisplay(value);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const masked = maskDigits(event.target.value);
    setText(masked);
    onChange(name, displayToIso(masked));
  };

  const invalid = shown !== "" && displayToIso(shown) === "";

  const openPicker = () => {
    const picker = pickerRef.current;
    if (!picker) return;
    if (typeof picker.showPicker === "function") picker.showPicker();
    else picker.focus();
  };

  return (
    <div className="input-group position-relative">
      <input
        className="form-control"
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        autoComplete="off"
        value={shown}
        onChange={handleChange}
        required={required}
        ref={(el) =>
          el?.setCustomValidity(invalid ? "Ingresá una fecha válida (dd/mm/aaaa)" : "")
        }
      />
      <button
        className="btn btn-outline-secondary"
        type="button"
        aria-label="Abrir calendario"
        onClick={openPicker}
      >
        <span aria-hidden="true">📅</span>
      </button>
      {/* Calendario nativo oculto: solo se usa para elegir la fecha. */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={displayToIso(shown)}
        onChange={(event) => {
          setText(isoToDisplay(event.target.value));
          onChange(name, event.target.value);
        }}
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
        }}
      />
    </div>
  );
};

export default DateInput;

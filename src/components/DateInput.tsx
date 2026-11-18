import { useState, type ChangeEvent } from "react";
import { CalendarDays } from "lucide-react";
import { es } from "react-day-picker/locale/es";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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

const isoToDate = (iso: string): Date | undefined => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined;
};

const dateToIso = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const DateInput = ({ id, name, value, onChange, required }: DateInputProps) => {
  const [text, setText] = useState(() => isoToDisplay(value));
  const [open, setOpen] = useState(false);

  // Si el valor cambia desde afuera (ej. al cargar datos), se muestra ese valor.
  const iso = displayToIso(text);
  const shown = iso === value ? text : isoToDisplay(value);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const masked = maskDigits(event.target.value);
    setText(masked);
    onChange(name, displayToIso(masked));
  };

  const invalid = shown !== "" && displayToIso(shown) === "";
  const selected = isoToDate(displayToIso(shown));

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    const picked = dateToIso(date);
    setText(isoToDisplay(picked));
    onChange(name, picked);
    setOpen(false);
  };

  return (
    <div className="flex items-center gap-2">
      <Input
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
        aria-invalid={invalid || undefined}
        ref={(el) =>
          el?.setCustomValidity(invalid ? "Ingresá una fecha válida (dd/mm/aaaa)" : "")
        }
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label="Abrir calendario"
          >
            <CalendarDays aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            locale={es}
            selected={selected}
            defaultMonth={selected}
            onSelect={handleSelect}
            captionLayout="dropdown"
            startMonth={new Date(2015, 0)}
            endMonth={new Date(2040, 11)}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default DateInput;
